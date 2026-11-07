/*
 * Content script — DOM-based conversation capture.
 *
 * Strategy (clean-room, user-visible-data only):
 *   1. Find the thread scroll container heuristically using ARIA roles
 *      (role="main" > role="grid" or role="log") — no dependence on the
 *      host site's internal class names, which change constantly.
 *   2. Treat each `role="row"` (or list-item fallback) inside that container
 *      as a potential message. Extract plain-text content, sender, a best-
 *      effort timestamp string, reactions, and already-visible attachment
 *      URLs.
 *   3. Observe mutations and new rows as the user (or optional auto-scroller)
 *      scrolls upward; de-duplicate with a content-based fingerprint.
 *   4. Never call private APIs, never read auth cookies or tokens, never
 *      transmit anything off-device.
 */

(() => {
  const NS = "__openChatArchiver";
  if (window[NS]?.__loaded) return;

  const state = {
    capturing: false,
    paused: false,
    messages: new Map(),      // fingerprint -> message
    order: [],                // fingerprints in insertion order
    filter: { fromDate: "", toDate: "" },
    threadTitle: null,
    observer: null,
    scroller: null,
    rootEl: null,
    pacer: null,
    urlWatcher: null,
    scrollsDone: 0,
    settings: null,
    startRequest: 0,
    autoScrollStatus: "off",
    maxScrolls: 2000,
    lastKnownUrl: location.href,
    conversationKey: null,
    pendingConversationKey: null,
    pendingThreadTitle: null,
  };

  const FINGERPRINT_KEYS = ["sender", "text", "timestamp"];

  /* ---------------- utilities ---------------- */

  const normalizeWhitespace = (s) => String(s || "").replace(/\s+/g, " ").trim();

  function fingerprint(m) {
    return FINGERPRINT_KEYS.map((k) => normalizeWhitespace(m[k])).join("::");
  }

  function todayIso() { return new Date().toISOString(); }

  function conversationKeyFromUrl(href = location.href) {
    try {
      const url = new URL(href);
      return `${url.origin}${url.pathname}`;
    } catch {
      return href;
    }
  }

  function logDebug(...args) {
    if (window[NS]?.debug) console.debug("[open-chat-archiver]", ...args);
  }

  /* ---------------- thread detection ---------------- */

  function findThreadContainer() {
    // Prefer explicit chat-log/grid regions; fall back to the main landmark.
    const candidates = [
      ...document.querySelectorAll(
        '[role="main"] [role="grid"], [role="main"] [role="log"], [role="main"] [aria-label*="essages" i]'
      ),
      ...document.querySelectorAll('[role="grid"], [role="log"]'),
    ];
    for (const c of candidates) {
      if (!c.isConnected) continue;
      if (c.clientHeight > 0 && c.querySelector('[role="row"], [role="listitem"], [role="article"]')) return c;
    }
    // Last resort: look for the biggest scrollable region inside main.
    const main = document.querySelector('[role="main"]');
    if (!main) return null;
    const all = main.querySelectorAll("div");
    let best = null;
    let bestScore = 0;
    for (const el of all) {
      const style = getComputedStyle(el);
      const overflows = /auto|scroll/.test(style.overflowY);
      if (!overflows) continue;
      const score = el.scrollHeight * el.clientHeight;
      if (score > bestScore && el.clientHeight > 200) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findThreadScroller(container) {
    // A chat grid can overflow inside a different element that owns scrolling.
    // Dimensions alone do not establish that an element can actually scroll.
    const row = container.querySelector('[role="row"], [role="listitem"], [role="article"]');
    for (let el = row?.parentElement || container; el; el = el.parentElement) {
      if (/^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY) &&
          el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2) {
        return el;
      }
    }
    return null;
  }

  function findThreadTitle() {
    // Page title is usually "(N) Thread Name | Messenger".
    const raw = document.title || "";
    const cleaned = raw.replace(/^\(\d+\)\s*/, "").replace(/\s*\|.*$/, "").trim();
    if (cleaned && cleaned.toLowerCase() !== "messenger") return cleaned;

    // Fallbacks: headings within main.
    const heading = document.querySelector('[role="main"] h1, [role="main"] h2');
    if (heading) return normalizeWhitespace(heading.textContent);
    return "Conversation";
  }

  /* ---------------- message extraction ---------------- */

  function extractMessageFromRow(row, settings) {
    // Skip system rows and date dividers.
    const roleAttr = row.getAttribute("role");
    if (roleAttr && !["row", "listitem", "article", "group"].includes(roleAttr)) return null;

    const text = normalizeWhitespace(row.innerText || "");
    if (!text) return null;

    // Ignore very short rows that are almost certainly UI chrome (date
    // stamps rendered as their own row are captured as meta, not a message).
    if (text.length < 2) return null;

    // Best-effort sender detection: explicit ARIA label, then preceding
    // heading-like element.
    let sender = row.getAttribute("aria-label") || "";
    if (sender) {
      // aria-labels on message rows are usually: "{Sender} sent {text} at {time}".
      const m = sender.match(/^(.+?)\s+(sent|said|wrote|replied)\b/i);
      if (m) sender = m[1];
    }
    if (!sender) {
      const h = row.querySelector("h4, h5, [role='heading']");
      if (h) sender = normalizeWhitespace(h.textContent);
    }

    // Direction: look at alignment — outgoing bubbles typically align right.
    let direction = "incoming";
    const style = getComputedStyle(row);
    if (style.justifyContent === "flex-end" || style.textAlign === "right") {
      direction = "outgoing";
    }

    // Timestamp: a <time> element, a datetime attribute, or an accessible
    // label on a nested element.
    let timestamp = "";
    const timeEl = row.querySelector("time[datetime], [data-timestamp], [datetime]");
    if (timeEl) {
      timestamp = timeEl.getAttribute("datetime") ||
                  timeEl.getAttribute("data-timestamp") ||
                  normalizeWhitespace(timeEl.textContent);
    }
    if (!timestamp) {
      const m = (row.getAttribute("aria-label") || "").match(/\bat\s+(.+)$/i);
      if (m) timestamp = m[1];
    }

    // Reactions: emoji-only elements near the row.
    let reactions = [];
    if (settings.captureReactions) {
      const rx = row.querySelectorAll('[aria-label*="eaction" i], [aria-label*="eacted" i]');
      reactions = Array.from(rx).map((el) =>
        normalizeWhitespace(el.getAttribute("aria-label") || el.textContent)
      ).filter(Boolean);
    }

    // Attachments: visible links and images inside the row.
    let attachments = [];
    if (settings.captureAttachmentRefs) {
      attachments = Array.from(row.querySelectorAll("a[href], img[src]"))
        .map((el) => el.getAttribute("href") || el.getAttribute("src"))
        .filter((u) => u && /^https?:/.test(u));
      attachments = Array.from(new Set(attachments));
    }

    // Strip leading "sender " prefix from text if it duplicates sender.
    let body = text;
    if (sender && body.startsWith(sender)) {
      body = body.slice(sender.length).replace(/^[\s:,-]+/, "");
    }

    return {
      sender: sender || "",
      text: body,
      timestamp: timestamp || "",
      direction,
      reactions,
      attachments,
    };
  }

  function collectAllRows(container) {
    if (!container) return [];
    const rows = container.querySelectorAll('[role="row"], [role="listitem"], [role="article"]');
    if (rows.length) return Array.from(rows);
    // Fallback: direct children of a list.
    return Array.from(container.children);
  }

  function ingest(container, settings) {
    const rows = collectAllRows(container);
    let added = 0;
    for (const row of rows) {
      const msg = extractMessageFromRow(row, settings);
      if (!msg) continue;
      const fp = fingerprint(msg);
      if (state.messages.has(fp)) continue;
      state.messages.set(fp, msg);
      state.order.push(fp);
      added++;
    }
    if (added) logDebug(`ingested ${added} message(s), total=${state.messages.size}`);
    return added;
  }

  function visibleFingerprints(container, settings, limit = 8) {
    const prints = [];
    for (const row of collectAllRows(container)) {
      const msg = extractMessageFromRow(row, settings);
      if (!msg) continue;
      prints.push(fingerprint(msg));
      if (prints.length >= limit) break;
    }
    return prints;
  }

  function maybeAdoptPendingConversation(container, settings) {
    if (!state.pendingConversationKey) return true;

    const visible = visibleFingerprints(container, settings);
    if (!visible.length) return false;
    if (state.messages.size && !visible.some((fp) => !state.messages.has(fp))) {
      return false;
    }

    state.conversationKey = state.pendingConversationKey;
    state.pendingConversationKey = null;
    resetThreadBuffer(state.pendingThreadTitle || findThreadTitle());
    state.pendingThreadTitle = null;
    return true;
  }

  function refreshCapture(container, settings) {
    if (!maybeAdoptPendingConversation(container, settings)) return false;
    ingest(container, settings);
    return true;
  }

  function attachObserver(container, settings) {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(() => {
      // Ignore deliveries from a detached root or while the next thread loads.
      if (!state.capturing || state.rootEl !== container || !container.isConnected) return;
      if (conversationKeyFromUrl() !== state.conversationKey || state.pendingConversationKey) return;
      refreshCapture(container, settings);
    });
    state.observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "datetime", "data-timestamp", "href", "src"],
    });
  }

  /* ---------------- filtering / export ---------------- */

  function asDateOrNull(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function passesDateFilter(m, from, to) {
    if (!from && !to) return true;
    const t = asDateOrNull(m.timestamp);
    if (!t) return true; // keep when we can't tell
    if (from) {
      const f = new Date(from + "T00:00:00");
      if (t < f) return false;
    }
    if (to) {
      const tt = new Date(to + "T23:59:59");
      if (t > tt) return false;
    }
    return true;
  }

  function currentMessageList() {
    return state.order.map((fp) => state.messages.get(fp)).filter(Boolean);
  }

  function filteredMessages() {
    const { fromDate, toDate } = state.filter;
    if (!fromDate && !toDate) return currentMessageList();
    return currentMessageList().filter((m) => passesDateFilter(m, fromDate, toDate));
  }

  /* ---------------- capture lifecycle ---------------- */

  async function startCapture() {
    if (state.capturing) return { ok: true };
    const request = ++state.startRequest;
    const settings = await chrome.storage.local.get([
      "captureReactions", "captureAttachmentRefs", "pacing", "maxScrolls",
    ]);
    if (request !== state.startRequest) return { ok: false, error: "Capture start cancelled." };
    const container = findThreadContainer();
    if (!container) {
      return { ok: false, error: "Could not find a conversation on this page. Open a chat and try again." };
    }
    state.settings = settings;
    state.scroller = findThreadScroller(container);
    state.rootEl = container;
    state.threadTitle = findThreadTitle();
    state.lastKnownUrl = location.href;
    const conversationKey = conversationKeyFromUrl();
    if (state.conversationKey && state.conversationKey !== conversationKey) {
      resetThreadBuffer(state.threadTitle);
    }
    state.conversationKey = conversationKey;
    state.pendingConversationKey = null;
    state.pendingThreadTitle = null;
    state.maxScrolls = Number.isFinite(settings.maxScrolls) && settings.maxScrolls >= 0
      ? Math.floor(settings.maxScrolls) : 2000;
    // The limit applies to each Start/Resume session, not the lifetime of the tab.
    state.scrollsDone = 0;
    state.capturing = true;
    refreshCapture(container, settings);
    attachObserver(container, settings);
    startPacerIfEnabled(settings.pacing);
    startUrlWatcher();
    return { ok: true };
  }

  function stopCapture() {
    state.startRequest++;
    state.capturing = false;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    state.pendingConversationKey = null;
    state.pendingThreadTitle = null;
    stopPacer();
    state.autoScrollStatus = "stopped";
    stopUrlWatcher();
    return { ok: true };
  }

  function clearBuffer() {
    state.messages.clear();
    state.order.length = 0;
    state.scrollsDone = 0;
    if (state.capturing) startPacerIfEnabled(state.settings.pacing);
    return { ok: true };
  }

  function resetThreadBuffer(threadTitle) {
    state.messages.clear();
    state.order.length = 0;
    state.scrollsDone = 0;
    state.threadTitle = threadTitle || null;
    if (state.capturing) startPacerIfEnabled(state.settings.pacing);
  }

  /* ---------------- optional paced auto-scroll ---------------- */

  const PACING_MS = { off: 0, slow: 6000, normal: 3000, fast: 1000 };

  function startPacerIfEnabled(pacing) {
    stopPacer();
    const ms = PACING_MS[pacing] || 0;
    state.autoScrollStatus = ms ? "running" : "off";
    if (!ms) return;
    state.pacer = setInterval(() => {
      if (!state.capturing) return;
      if (state.scrollsDone >= state.maxScrolls) {
        state.autoScrollStatus = "limit";
        stopPacer();
        return;
      }
      if (!state.rootEl?.isConnected || state.pendingConversationKey ||
          conversationKeyFromUrl() !== state.conversationKey) {
        state.autoScrollStatus = "waiting-container";
        return;
      }
      state.scroller = findThreadScroller(state.rootEl);
      if (!state.scroller) {
        state.autoScrollStatus = "waiting";
        return;
      }
      refreshCapture(state.rootEl, state.settings);
      const scroller = state.scroller;
      const distance = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      // Reversed flex lists use negative scrollTop values for older messages.
      const reversed = getComputedStyle(scroller).flexDirection === "column-reverse";
      const top = reversed ? -distance : 0;
      if (scroller.scrollTop <= top + 2) {
        // At the loaded boundary, the host may still be fetching older rows.
        // Keep the timer and observer alive; this is not proof of completeness.
        state.autoScrollStatus = "waiting";
        return;
      }
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.max(top, before - scroller.clientHeight * 0.9);
      if (Math.abs(scroller.scrollTop - before) > 1) {
        state.scrollsDone++;
        state.autoScrollStatus = "running";
      } else {
        state.autoScrollStatus = "waiting";
      }
    }, ms);
  }

  function stopPacer() {
    if (state.pacer) {
      clearInterval(state.pacer);
      state.pacer = null;
    }
  }

  /* ---------------- SPA navigation awareness ---------------- */

  function startUrlWatcher() {
    if (state.urlWatcher) return;
    state.urlWatcher = setInterval(() => {
      if (!state.capturing) return;
      const nextConversationKey = conversationKeyFromUrl();
      if (nextConversationKey !== state.conversationKey) {
        state.pendingConversationKey = nextConversationKey;
        state.pendingThreadTitle = findThreadTitle();
      } else {
        state.pendingConversationKey = null;
        state.pendingThreadTitle = null;
      }
      // React can replace the list or its scroll parent without changing URL.
      // Retry even if the replacement is temporarily absent.
      const container = findThreadContainer();
      if (!container) return;
      state.scroller = findThreadScroller(container);
      if (state.rootEl !== container) {
        state.rootEl = container;
        attachObserver(container, state.settings);
      }
      if (refreshCapture(container, state.settings)) {
        state.lastKnownUrl = location.href;
      }
    }, 1500);
  }

  function stopUrlWatcher() {
    if (!state.urlWatcher) return;
    clearInterval(state.urlWatcher);
    state.urlWatcher = null;
  }

  /* ---------------- messaging with popup ---------------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        switch (msg?.type) {
          case "GET_STATUS": {
            sendResponse({
              ok: true,
              capturing: state.capturing,
              autoScrollStatus: state.autoScrollStatus,
              scrollsDone: state.scrollsDone,
              maxScrolls: state.maxScrolls,
              total: state.messages.size,
              filteredInRange: filteredMessages().length,
              threadTitle: state.threadTitle || findThreadTitle(),
            });
            return;
          }
          case "START_CAPTURE": {
            sendResponse(await startCapture());
            return;
          }
          case "STOP_CAPTURE": {
            sendResponse(stopCapture());
            return;
          }
          case "CLEAR": {
            sendResponse(clearBuffer());
            return;
          }
          case "SET_FILTER": {
            state.filter.fromDate = msg.fromDate || "";
            state.filter.toDate = msg.toDate || "";
            sendResponse({ ok: true });
            return;
          }
          case "EXPORT": {
            state.filter.fromDate = msg.fromDate || state.filter.fromDate;
            state.filter.toDate = msg.toDate || state.filter.toDate;
            const out = filteredMessages();
            sendResponse({
              ok: true,
              messages: out,
              meta: {
                threadTitle: state.threadTitle || findThreadTitle(),
                source: location.origin,
                capturedAt: todayIso(),
                totalCaptured: state.messages.size,
                filter: { ...state.filter },
              },
            });
            return;
          }
          default:
            sendResponse({ ok: false, error: "Unknown message type." });
        }
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  });

  window[NS] = {
    __loaded: true,
    debug: false,
    // Exposed read-only helpers for power users debugging in devtools.
    peek: () => ({
      capturing: state.capturing,
      autoScrollStatus: state.autoScrollStatus,
      scrollsDone: state.scrollsDone,
      maxScrolls: state.maxScrolls,
      total: state.messages.size,
      threadTitle: state.threadTitle,
    }),
  };

  logDebug("content script loaded");
})();
