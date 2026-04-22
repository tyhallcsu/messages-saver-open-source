/*
 * Popup controller.
 * Talks to the content script in the active tab and to the background
 * service worker for downloads. Never makes network requests of its own.
 */

const SUPPORTED_HOSTS = [
  "www.facebook.com",
  "m.facebook.com",
  "www.messenger.com",
];

const $ = (id) => document.getElementById(id);

let state = {
  capturing: false,
  total: 0,
  filtered: 0,
  threadTitle: null,
};

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return SUPPORTED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function setStatus(text, cls) {
  $("statusText").textContent = text;
  const dot = $("dot");
  dot.classList.remove("active", "error");
  if (cls) dot.classList.add(cls);
}

function flash(msg, kind) {
  const existing = document.querySelector(".flash");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.className = `flash ${kind === "err" ? "err" : "ok"}`;
  el.textContent = msg;
  $("hintBox").after(el);
  setTimeout(() => el.remove(), 4000);
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function refreshStatus() {
  const tab = await getActiveTab();
  if (!tab || !isSupportedUrl(tab.url)) {
    setStatus("Open a Messenger or Facebook conversation", null);
    $("toggleCapture").disabled = true;
    $("exportBtn").disabled = true;
    return;
  }
  $("toggleCapture").disabled = false;
  $("exportBtn").disabled = false;

  const res = await sendToContent(tab.id, { type: "GET_STATUS" });
  if (!res || !res.ok) {
    setStatus("Ready — content script not yet active. Try reloading the tab.", null);
    return;
  }
  state = {
    capturing: !!res.capturing,
    total: res.total || 0,
    filtered: applyDateFilterCount(res.total, res.filteredInRange),
    threadTitle: res.threadTitle || null,
  };
  $("captured").textContent = res.total || 0;
  $("filtered").textContent = res.filteredInRange ?? res.total ?? 0;

  if (state.capturing) {
    setStatus(state.threadTitle ? `Capturing: ${state.threadTitle}` : "Capturing…", "active");
    $("toggleCapture").textContent = "Stop capture";
  } else {
    setStatus(state.threadTitle ? `Idle: ${state.threadTitle}` : "Idle", null);
    $("toggleCapture").textContent = state.total ? "Resume capture" : "Start capture";
  }
}

function applyDateFilterCount(total, filtered) {
  if (typeof filtered === "number") return filtered;
  return total || 0;
}

async function loadPrefs() {
  const { fromDate = "", toDate = "", format = "json" } =
    await chrome.storage.local.get(["fromDate", "toDate", "format"]);
  $("fromDate").value = fromDate;
  $("toDate").value = toDate;
  const radio = document.querySelector(`input[name="fmt"][value="${format}"]`);
  if (radio) radio.checked = true;
}

async function persistPrefs() {
  const fromDate = $("fromDate").value || "";
  const toDate = $("toDate").value || "";
  const format = document.querySelector('input[name="fmt"]:checked')?.value || "json";
  await chrome.storage.local.set({ fromDate, toDate, format });
  return { fromDate, toDate, format };
}

async function pushFilterToContent() {
  const tab = await getActiveTab();
  if (!tab || !isSupportedUrl(tab.url)) return;
  const { fromDate, toDate } = await persistPrefs();
  await sendToContent(tab.id, { type: "SET_FILTER", fromDate, toDate });
  await refreshStatus();
}

async function onToggleCapture() {
  const tab = await getActiveTab();
  if (!tab) return;
  const type = state.capturing ? "STOP_CAPTURE" : "START_CAPTURE";
  const res = await sendToContent(tab.id, { type });
  if (!res || !res.ok) {
    flash(res?.error || "Could not reach the page. Reload the tab.", "err");
    return;
  }
  await refreshStatus();
}

async function onClear() {
  const tab = await getActiveTab();
  if (!tab) return;
  const res = await sendToContent(tab.id, { type: "CLEAR" });
  if (!res || !res.ok) {
    flash(res?.error || "Failed to clear.", "err");
    return;
  }
  flash("Buffer cleared.", "ok");
  await refreshStatus();
}

async function onExport() {
  const tab = await getActiveTab();
  if (!tab) return;
  const { fromDate, toDate, format } = await persistPrefs();
  const res = await sendToContent(tab.id, {
    type: "EXPORT",
    fromDate,
    toDate,
  });
  if (!res || !res.ok) {
    flash(res?.error || "Nothing captured yet.", "err");
    return;
  }
  const { messages, meta } = res;
  if (!messages || messages.length === 0) {
    flash("No messages in the selected range.", "err");
    return;
  }
  const bgRes = await chrome.runtime.sendMessage({
    type: "DOWNLOAD_EXPORT",
    format,
    messages,
    meta,
  });
  if (!bgRes || !bgRes.ok) {
    flash(bgRes?.error || "Download failed.", "err");
    return;
  }
  flash(`Exported ${messages.length} messages as ${format.toUpperCase()}.`, "ok");
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadPrefs();
  await refreshStatus();

  $("toggleCapture").addEventListener("click", onToggleCapture);
  $("clearBuffer").addEventListener("click", onClear);
  $("exportBtn").addEventListener("click", onExport);
  $("fromDate").addEventListener("change", pushFilterToContent);
  $("toDate").addEventListener("change", pushFilterToContent);
  document.querySelectorAll('input[name="fmt"]').forEach((el) =>
    el.addEventListener("change", persistPrefs)
  );

  // Live refresh while popup is open.
  const interval = setInterval(refreshStatus, 1000);
  window.addEventListener("unload", () => clearInterval(interval));
});
