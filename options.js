/*
 * Options page controller.
 * Settings are stored under chrome.storage.local (not sync) to avoid leaving
 * this device.
 */

const DEFAULTS = Object.freeze({
  format: "json",
  filenameTemplate: "chat-archive_{thread}_{date}.{ext}",
  pacing: "off",
  maxScrolls: 2000,
  captureReactions: true,
  captureAttachmentRefs: true,
  collapseConsecutive: false,
});

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const merged = { ...DEFAULTS, ...stored };
  const fmt = document.querySelector(`input[name="format"][value="${merged.format}"]`);
  if (fmt) fmt.checked = true;
  $("filenameTemplate").value = merged.filenameTemplate;
  $("pacing").value = merged.pacing;
  $("maxScrolls").value = merged.maxScrolls;
  $("captureReactions").checked = !!merged.captureReactions;
  $("captureAttachmentRefs").checked = !!merged.captureAttachmentRefs;
  $("collapseConsecutive").checked = !!merged.collapseConsecutive;

  const manifest = chrome.runtime.getManifest();
  $("versionLabel").textContent = manifest.version;
}

function collect() {
  return {
    format: document.querySelector('input[name="format"]:checked')?.value || DEFAULTS.format,
    filenameTemplate: $("filenameTemplate").value.trim() || DEFAULTS.filenameTemplate,
    pacing: $("pacing").value,
    maxScrolls: Math.max(0, parseInt($("maxScrolls").value, 10) || DEFAULTS.maxScrolls),
    captureReactions: $("captureReactions").checked,
    captureAttachmentRefs: $("captureAttachmentRefs").checked,
    collapseConsecutive: $("collapseConsecutive").checked,
  };
}

async function save() {
  await chrome.storage.local.set(collect());
  const msg = $("savedMsg");
  msg.hidden = false;
  setTimeout(() => { msg.hidden = true; }, 1500);
}

async function reset() {
  await chrome.storage.local.set(DEFAULTS);
  await load();
  const msg = $("savedMsg");
  msg.textContent = "Reset.";
  msg.hidden = false;
  setTimeout(() => { msg.hidden = true; msg.textContent = "Saved."; }, 1500);
}

document.addEventListener("DOMContentLoaded", async () => {
  await load();
  $("save").addEventListener("click", save);
  $("reset").addEventListener("click", reset);
});
