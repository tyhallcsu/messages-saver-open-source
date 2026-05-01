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
    maxScrolls: 2000,
    lastKnownUrl: location.href,
  };

  const FINGERPRINT_KEYS = ["sender", "text", "timestamp"];

  /* ---------------- utilities ---------------- */

  const normalizeWhitespace = (s) => String(s || "").replace(/\s+/g, " ").trim();

  function fingerprint(m) {
    return FINGERPRINT_KEYS.map((k) => normalizeWhitespace(m[k])).join("::");
  }

  function todayIso() { return new Date().toISOString(); }

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
      if (c.scrollHeight > c.clientHeight + 20) return c;
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

  async function ingest(container, settings) {
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
    const container = findThreadContainer();
    if (!container) {
      return { ok: false, error: "Could not find a conversation on this page. Open a chat and try again." };
    }
    state.scroller = container;
    state.rootEl = container;
    state.threadTitle = findThreadTitle();
    state.lastKnownUrl = location.href;

    const settings = await chrome.storage.local.get([
      "captureReactions",
      "captureAttachmentRefs",
      "pacing",
      "maxScrolls",
    ]);
    state.maxScrolls = Number.isFinite(settings.maxScrolls) ? settings.maxScrolls : 2000;

    await ingest(container, settings);

    state.observer = new MutationObserver(async (mutations) => {
      // Only re-ingest when new child nodes appear.
      const hasNew = mutations.some((m) => m.addedNodes && m.addedNodes.length > 0);
      if (hasNew) {
        await ingest(container, settings);
      }
    });
    state.observer.observe(container, { childList: true, subtree: true });

    state.capturing = true;
    startPacerIfEnabled(settings.pacing);
    startUrlWatcher();
    return { ok: true };
  }

  function stopCapture() {
    state.capturing = false;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    stopPacer();
    stopUrlWatcher();
    return { ok: true };
  }

  function clearBuffer() {
    state.messages.clear();
    state.order.length = 0;
    state.scrollsDone = 0;
    return { ok: true };
  }

  /* ---------------- optional paced auto-scroll ---------------- */

  const PACING_MS = { off: 0, slow: 6000, normal: 3000, fast: 1000 };

  function startPacerIfEnabled(pacing) {
    stopPacer();
    const ms = PACING_MS[pacing] || 0;
    if (!ms || !state.scroller) return;
    state.pacer = setInterval(() => {
      if (!state.capturing || !state.scroller) return;
      if (state.scrollsDone >= state.maxScrolls) { stopPacer(); return; }
      // Scroll upward to load older messages. If we're already at the top,
      // stop pacing — nothing more to load.
      if (state.scroller.scrollTop <= 2) { stopPacer(); return; }
      state.scroller.scrollTop = Math.max(0, state.scroller.scrollTop - state.scroller.clientHeight * 0.9);
      state.scrollsDone++;
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
    state.urlWatcher = setInterval(async () => {
      if (location.href === state.lastKnownUrl) return;

      state.lastKnownUrl = location.href;
      if (!state.capturing) return;

      // Thread switched — capture continues but re-anchor to the new container.
      const newContainer = findThreadContainer();
      if (!newContainer || newContainer === state.scroller) return;

      if (state.observer) state.observer.disconnect();
      state.scroller = newContainer;
      state.rootEl = newContainer;
      state.threadTitle = findThreadTitle();

      const settings = await chrome.storage.local.get([
        "captureReactions",
        "captureAttachmentRefs",
      ]);
      await ingest(newContainer, settings);

      state.observer = new MutationObserver(async (mutations) => {
        const hasNew = mutations.some((m) => m.addedNodes && m.addedNodes.length > 0);
        if (hasNew) {
          await ingest(newContainer, settings);
        }
      });
      state.observer.observe(newContainer, { childList: true, subtree: true });
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
      total: state.messages.size,
      threadTitle: state.threadTitle,
    }),
  };

  logDebug("content script loaded");
})();
