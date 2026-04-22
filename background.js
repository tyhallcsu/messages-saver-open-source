/*
 * Background service worker.
 *
 * Responsibilities:
 *  - Receive captured message buffers from the popup, serialize them into the
 *    requested export format, and trigger a browser Downloads API download.
 *  - Seed default settings on install.
 *
 * This worker never makes a network request. All payloads are encoded to a
 * data: URL and handed to chrome.downloads.download() locally.
 */

const DEFAULT_SETTINGS = Object.freeze({
  format: "json",
  filenameTemplate: "chat-archive_{thread}_{date}.{ext}",
  pacing: "off",
  maxScrolls: 2000,
  captureReactions: true,
  captureAttachmentRefs: true,
  collapseConsecutive: false,
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (existing[k] === undefined) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "DOWNLOAD_EXPORT") {
    handleDownload(msg).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: err?.message || String(err) })
    );
    return true; // keep channel open for async response
  }
  return false;
});

async function handleDownload({ format, messages, meta }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { ok: false, error: "Nothing to export." };
  }
  const settings = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const effective = { ...DEFAULT_SETTINGS, ...settings };
  const fmt = (format || effective.format || "json").toLowerCase();

  const { content, mime, ext } = serialize(fmt, messages, meta, effective);
  const filename = buildFilename(effective.filenameTemplate, {
    thread: meta?.threadTitle || "conversation",
    count: messages.length,
    ext,
  });
  const url = toDataUrl(content, mime);

  await chrome.downloads.download({
    url,
    filename,
    saveAs: true,
  });

  return { ok: true, filename };
}

/* ------------------------------------------------------------------ *
 * Serializers                                                        *
 * ------------------------------------------------------------------ */

function serialize(format, messages, meta, settings) {
  switch (format) {
    case "json": return serializeJson(messages, meta);
    case "csv":  return serializeCsv(messages);
    case "txt":  return serializeTxt(messages, meta, settings);
    case "html": return serializeHtml(messages, meta, settings);
    default:     return serializeJson(messages, meta);
  }
}

function serializeJson(messages, meta) {
  const payload = {
    schema: "open-chat-archiver/1",
    exportedAt: new Date().toISOString(),
    meta: meta || {},
    messageCount: messages.length,
    messages,
  };
  return {
    content: JSON.stringify(payload, null, 2),
    mime: "application/json",
    ext: "json",
  };
}

function serializeCsv(messages) {
  const header = [
    "timestamp_iso",
    "sender",
    "text",
    "direction",
    "reactions",
    "attachments",
  ];
  const rows = [header.map(csvCell).join(",")];
  for (const m of messages) {
    rows.push([
      m.timestamp || "",
      m.sender || "",
      m.text || "",
      m.direction || "",
      Array.isArray(m.reactions) ? m.reactions.join(" ") : "",
      Array.isArray(m.attachments) ? m.attachments.join(" | ") : "",
    ].map(csvCell).join(","));
  }
  return {
    content: rows.join("\r\n") + "\r\n",
    mime: "text/csv",
    ext: "csv",
  };
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function serializeTxt(messages, meta, settings) {
  const lines = [];
  const title = meta?.threadTitle || "Conversation";
  lines.push(`${title}`);
  lines.push("=".repeat(title.length));
  lines.push(`Exported: ${new Date().toISOString()}`);
  lines.push(`Messages: ${messages.length}`);
  lines.push("");

  let lastSender = null;
  for (const m of messages) {
    const ts = m.timestamp ? `[${m.timestamp}] ` : "";
    const sameSender = settings.collapseConsecutive && m.sender === lastSender;
    if (sameSender) {
      lines.push(`${" ".repeat((m.sender || "").length + 3)}${m.text || ""}`);
    } else {
      lines.push(`${ts}${m.sender || "Unknown"}: ${m.text || ""}`);
    }
    if (Array.isArray(m.attachments) && m.attachments.length) {
      for (const a of m.attachments) lines.push(`    attachment: ${a}`);
    }
    if (Array.isArray(m.reactions) && m.reactions.length) {
      lines.push(`    reactions: ${m.reactions.join(" ")}`);
    }
    lastSender = m.sender;
  }
  return {
    content: lines.join("\n") + "\n",
    mime: "text/plain",
    ext: "txt",
  };
}

function serializeHtml(messages, meta, settings) {
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const title = esc(meta?.threadTitle || "Conversation");
  const items = [];
  let lastSender = null;

  for (const m of messages) {
    const collapsed = settings.collapseConsecutive && m.sender === lastSender;
    const classes = ["msg"];
    if (m.direction === "outgoing") classes.push("out");
    if (collapsed) classes.push("collapsed");
    items.push(`<article class="${classes.join(" ")}">`);
    if (!collapsed) {
      items.push(`<header><span class="sender">${esc(m.sender || "Unknown")}</span>`);
      if (m.timestamp) items.push(`<time datetime="${esc(m.timestamp)}">${esc(m.timestamp)}</time>`);
      items.push(`</header>`);
    }
    items.push(`<p class="body">${esc(m.text || "")}</p>`);
    if (Array.isArray(m.attachments) && m.attachments.length) {
      items.push(`<ul class="attachments">`);
      for (const a of m.attachments) items.push(`<li>${esc(a)}</li>`);
      items.push(`</ul>`);
    }
    if (Array.isArray(m.reactions) && m.reactions.length) {
      items.push(`<p class="reactions">${esc(m.reactions.join(" "))}</p>`);
    }
    items.push(`</article>`);
    lastSender = m.sender;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title} — chat archive</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #1b1f24; line-height: 1.5; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    .meta { color: #6b7280; font-size: 12px; margin-bottom: 24px; }
    .msg { padding: 8px 12px; margin: 6px 0; border-radius: 10px; background: #f3f4f6; max-width: 75%; }
    .msg.out { background: #dbeafe; margin-left: auto; }
    .msg.collapsed { margin-top: 0; }
    .msg header { display: flex; gap: 10px; font-size: 11px; color: #6b7280; margin-bottom: 2px; }
    .msg .sender { font-weight: 600; color: #1b1f24; }
    .msg .body { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .msg .attachments { margin: 6px 0 0; padding-left: 20px; font-size: 12px; color: #374151; }
    .msg .reactions { margin: 4px 0 0; font-size: 14px; }
    footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9aa3af; font-size: 11px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">Exported ${esc(new Date().toISOString())} · ${messages.length} messages</p>
  ${items.join("\n")}
  <footer>Generated by Open Chat Archiver (open-source, MV3).</footer>
</body>
</html>
`;
  return { content: html, mime: "text/html", ext: "html" };
}

/* ------------------------------------------------------------------ *
 * Filename + encoding helpers                                        *
 * ------------------------------------------------------------------ */

function buildFilename(template, tokens) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const filled = (template || "chat-archive_{thread}_{date}.{ext}")
    .replace(/\{thread\}/g, safeFilenamePart(tokens.thread))
    .replace(/\{date\}/g, date)
    .replace(/\{time\}/g, time)
    .replace(/\{count\}/g, String(tokens.count))
    .replace(/\{ext\}/g, tokens.ext);
  return filled.replace(/[\\/:*?"<>|]/g, "-");
}

function safeFilenamePart(s) {
  return String(s || "conversation")
    .normalize("NFKD")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 60) || "conversation";
}

function toDataUrl(content, mime) {
  // Using data: URL keeps us off the network and avoids needing URL.createObjectURL in the SW.
  // btoa works on Latin-1, so encode UTF-8 first.
  const utf8 = new TextEncoder().encode(content);
  let bin = "";
  for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
  return `data:${mime};charset=utf-8;base64,${btoa(bin)}`;
}
