# Usage guide

A complete, step-by-step walkthrough for installing Open Chat Archiver,
capturing a conversation, and verifying that the export file you got is
correct.

For design details, see [ARCHITECTURE.md](ARCHITECTURE.md).

> **Time required:** 5 minutes for install + 2–10 minutes to capture a
> conversation, depending on its length and your scroll speed.
> **Network required:** none, after you've cloned the repo.

---

## Table of contents

1. [Before you start](#1-before-you-start)
2. [Install the extension](#2-install-the-extension)
3. [Configure options (optional)](#3-configure-options-optional)
4. [Open a conversation](#4-open-a-conversation)
5. [Start capturing](#5-start-capturing)
6. [Filter by date (optional)](#6-filter-by-date-optional)
7. [Export](#7-export)
8. [Verify your export is correct](#8-verify-your-export-is-correct)
9. [Updating the extension](#9-updating-the-extension)
10. [Troubleshooting](#10-troubleshooting)
11. [Uninstall and clean up](#11-uninstall-and-clean-up)

---

## 1. Before you start

You need:

- **Google Chrome 114 or newer** (any Chromium-based browser that supports
  Manifest V3 also works — Edge, Brave, Arc, Vivaldi).
- **A signed-in Facebook or Messenger session** in that browser. The
  extension only reads what you can already see logged in.
- **A few minutes** to scroll through the conversation. The extension
  captures messages as they render in the DOM — it cannot fetch history
  the page hasn't already loaded.

You do **not** need:

- A GitHub account, an API key, or any sign-up.
- An internet connection beyond the one you're already using to view the
  conversation. The extension itself never makes network requests.
- Admin or developer permissions on your machine. Loading an unpacked
  extension is a normal Chrome user action.

---

## 2. Install the extension

### 2a. Get the source

**Option A — Clone with git (recommended):**

```bash
git clone https://github.com/tyhallcsu/messages-saver-open-source.git
cd messages-saver-open-source
```

**Option B — Download a release zip:** grab the `open-chat-archiver-<version>.zip`
from the [Releases page](https://github.com/tyhallcsu/messages-saver-open-source/releases),
unzip it into a folder you'll keep around. Chrome reads from disk, so do
not delete the folder after loading.

### 2b. Load it into Chrome

1. Open a new tab and go to `chrome://extensions`.
2. Toggle **Developer mode** on (top-right corner).
3. Click **Load unpacked**.
4. Select the cloned/unzipped folder.
5. Pin the icon to your toolbar via the puzzle-piece icon → push-pin.

> **Screenshot placeholder — `chrome://extensions` showing Open Chat Archiver loaded.**
> *(Add `docs/img/install-extensions-page.png` and reference it here once captured.)*

### 2c. Confirm it loaded

The extensions page should show **Open Chat Archiver — 0.1.0** with a
green toggle and three small icons (16/48/128 px). If you see a red
**Errors** badge, click it; the most common cause is a missing file
(usually because the folder selection picked the wrong directory).

---

## 3. Configure options (optional)

The defaults are fine for most users. Visit the options page if you want
to change them.

**To open Options:** right-click the extension icon → **Options**, or
click the ⚙ link in the popup footer.

> **Screenshot placeholder — Options page with all settings visible.**

| Setting | Default | What it does |
|---|---|---|
| **Default format** | `JSON` | Pre-selects the format radio in the popup. |
| **Filename template** | `chat-archive_{thread}_{date}.{ext}` | Tokens: `{thread}`, `{date}`, `{ext}`. Sanitized for cross-platform safety at write time. |
| **Scroll pacing** | `Off` | `Slow` / `Normal` / `Fast` makes the extension auto-scroll the conversation upward at a fixed cadence to load older messages. |
| **Max auto-scrolls** | `2000` | Hard ceiling on auto-scroll iterations. Stops the extension from scrolling forever on a thread that doesn't end. |
| **Capture reactions** | On | Includes the human-readable reaction labels (e.g. `"heart reaction"`) on each message. |
| **Capture attachment URLs** | On | Includes absolute URLs of images and links inside each message. URLs only — no media is downloaded. |
| **Collapse consecutive** | Off | TXT-export only: when the same person sends multiple messages in a row, collapse the sender label. |

Click **Save**. A green "Saved." chip appears for ~1.5 seconds.

> **Tip:** the **Reset** button restores every option to its default,
> not just the field you most recently edited.

---

## 4. Open a conversation

Navigate to one of:

- `https://www.messenger.com/t/<thread-id>` (recommended — cleanest DOM)
- `https://www.facebook.com/messages/t/<thread-id>`
- `https://m.facebook.com/messages/<thread-id>` (mobile layout)

The extension is **inert on every other page**. Its content script only
runs on the URL patterns above (defined in `manifest.json` →
`content_scripts.matches`).

> **Heads up:** if you opened the conversation tab *before* installing
> the extension, reload it once. The content script injects at
> `document_idle`; tabs opened pre-install never received it.

---

## 5. Start capturing

### 5a. Open the popup

Click the Open Chat Archiver icon in the Chrome toolbar.

> **Screenshot placeholder — popup in idle state, status dot grey.**

The popup shows:

| Element | Meaning |
|---|---|
| **Status dot** (green / red / grey) | Capture state — see below. |
| **Status text** | What the extension is doing right now. |
| **Captured** counter | Total messages observed in the DOM since capture started. |
| **In range** counter | How many of those fall inside your date filter (equals **Captured** if no filter is set). |
| **Start / Stop / Resume capture** | Toggles the observer. |
| **Clear** | Empties the in-memory buffer for this tab. |
| **Format radios** | JSON / CSV / TXT / HTML. |
| **From / To** | ISO-style date inputs (YYYY-MM-DD). |
| **Download export** | Builds the file and triggers the browser Save dialog. |

**Status-dot color reference:**

- 🟢 **Green** — actively capturing.
- ⚪ **Grey** — idle. Click *Start capture* to begin.
- 🔴 **Red** — the content script could not locate a message thread on
  this page. Reload, or check that you're on a real conversation URL
  (not the inbox list).

### 5b. Click *Start capture*

The status dot turns green. The **Captured** counter starts at the
number of messages already rendered in the DOM (usually a few dozen).

### 5c. Load older messages

Two ways to scroll back:

**Manual (recommended for accuracy):**

Click somewhere inside the conversation, then press <kbd>Page Up</kbd>
or scroll with your mouse wheel. As Messenger / Facebook fetches and
renders older messages, the `MutationObserver` picks them up and the
counter climbs.

**Automatic (paced auto-scroll):**

If you enabled it in Options, the extension scrolls the message list
upward on an interval. To watch progress without occupying the tab,
keep the popup open — the counter refreshes once per second.

> **Why is manual scrolling more reliable?** Messenger/Facebook
> sometimes throttles aggressive scrolling and renders fewer older
> messages than expected. Manual scrolling lets you slow down naturally
> on rate-limit signals.

### 5d. When have I scrolled enough?

Watch the **Captured** counter. When it stops climbing for ~10 seconds
even though you're still scrolling, you've reached the top of the
conversation (or the host site is refusing to load more).

---

## 6. Filter by date (optional)

Set **From** and/or **To** in the popup. Changes propagate to the content
script immediately and the **In range** counter recalculates.

- Leaving both blank exports everything captured.
- Setting **From** only includes messages newer than that date.
- Setting **To** only includes messages older than (or on) that date.
- Messages whose timestamps cannot be parsed are **always included** —
  the extension does not silently drop ambiguous rows.

> **Edge case:** a message with a "Tue 9:14 AM" relative timestamp
> string (no year) cannot be filtered reliably. It will be kept and
> rendered with the visible string in JSON's `timestamp` field. If you
> need strict date filtering, scroll until the casual strings turn into
> absolute dates (Messenger does this for messages older than ~7 days).

---

## 7. Export

1. Pick a format radio (JSON / CSV / TXT / HTML).
2. Click **Download export**.
3. Chrome's native Save dialog appears with the filename derived from
   your filename template.
4. Confirm and save to disk.

> **Screenshot placeholder — Chrome Save dialog with the suggested filename.**

A green confirmation chip ("Exported 142 messages as JSON.") appears
inside the popup for a few seconds.

### Format quick-reference

| Format | What you get | Best for |
|---|---|---|
| **JSON** | Lossless, schema-tagged. See [Message schema](#message-schema). | Archives, scripting, importing into another tool. |
| **CSV** | One row per message, UTF-8, CRLF. | Spreadsheets (Excel / Numbers / Sheets). |
| **TXT** | Plain readable transcript. Optional consecutive-sender collapsing. | Quick reading, printing, sharing. |
| **HTML** | Self-contained page with built-in CSS. No external assets. | Browsing in a browser, archiving as a single file. |

### Message schema (JSON)

Every JSON export carries `"schema": "open-chat-archiver/1"`. The
top-level shape:

```json
{
  "schema": "open-chat-archiver/1",
  "exportedAt": "ISO-8601 string",
  "meta": {
    "threadTitle": "string | null",
    "source": "URL of the captured tab",
    "capturedAt": "ISO-8601 string",
    "totalCaptured": 0,
    "filter": { "fromDate": "", "toDate": "" }
  },
  "messageCount": 0,
  "messages": [
    {
      "sender":      "string",
      "text":        "string",
      "timestamp":   "ISO 8601 when available, else the visible label",
      "direction":   "incoming | outgoing",
      "reactions":   ["array of human-readable strings"],
      "attachments": ["array of absolute URLs"]
    }
  ]
}
```

A reference instance with synthetic data lives at
[`sample-data/sample-conversation.json`](../sample-data/sample-conversation.json).

---

## 8. Verify your export is correct

For a meaningful archive you want to confirm three things:
**completeness, ordering, and fidelity**.

### 8a. Completeness check

Open the export and confirm the **first** and **last** message look
right.

```bash
# JSON: total messages and first/last sender
python3 - <<'PY'
import json, sys
data = json.load(open("chat-archive_<thread>_<date>.json"))
msgs = data["messages"]
print(f"messageCount     : {data['messageCount']}")
print(f"actual messages  : {len(msgs)}")
print(f"first            : {msgs[0]['sender']!r}: {msgs[0]['text'][:60]!r}")
print(f"last             : {msgs[-1]['sender']!r}: {msgs[-1]['text'][:60]!r}")
PY
```

Cross-check `data['messageCount']` against `meta.totalCaptured`. They
should match exactly when no date filter is applied.

### 8b. Ordering check

Messages should be in chronological order (oldest → newest). For JSON:

```bash
python3 - <<'PY'
import json
msgs = json.load(open("chat-archive_<thread>_<date>.json"))["messages"]
parsable = [m for m in msgs if m["timestamp"] and m["timestamp"][0].isdigit()]
sorted_ts = sorted(parsable, key=lambda m: m["timestamp"])
print("ordered:", parsable == sorted_ts)
print("parsable timestamps:", len(parsable), "/", len(msgs))
PY
```

A small number of unparseable timestamps is normal (recent messages
often render as "9:14 AM" strings). If most timestamps are unparseable,
scroll the conversation a bit further back so Messenger swaps them for
absolute dates, then re-export.

### 8c. Fidelity spot-check

Pick three random messages from the export and find them in the live
conversation. Confirm:

- Sender name matches exactly.
- Visible text matches (the extension preserves whatever the DOM shows;
  it does not re-decode emoji or remove formatting).
- Reactions, if you have *Capture reactions* enabled, are listed.
- Attachment URLs, if any, are present and reachable.

**Re-running** the export after fixing a missed step is safe — the
extension's de-duplication key is `sender | text | timestamp`, so
exporting after additional scrolling produces a strictly larger file.

### 8d. Privacy check

Confirm the extension itself made no network calls during your session:

1. Open `chrome://extensions` → **Open Chat Archiver** → **Inspect views: service worker**.
2. In DevTools → **Network** tab.
3. Restart capture and run an export.
4. The Network tab should remain **empty**. Any request would be a bug;
   please file one.

---

## 9. Updating the extension

When a new release is published:

1. **Note your settings** (or screenshot the Options page) — settings
   live in `chrome.storage.local`, scoped to the loaded copy of the
   extension. Replacing the folder usually preserves them, but capture
   them once just in case.
2. Pull or download the new version.
3. Go to `chrome://extensions` → click the **Reload** circular-arrow
   button on the Open Chat Archiver card.
4. (If loaded from a fresh folder) **Remove** the old card and **Load
   unpacked** the new folder. Re-pin the icon if needed.

---

## 10. Troubleshooting

### "Open a Messenger or Facebook conversation"

You're not on a supported URL. Navigate to `messenger.com/t/<thread>`
(or one of the other supported patterns) and reopen the popup.

### "Ready — content script not yet active. Try reloading the tab."

The conversation tab was open before the extension was installed (or
reloaded). Reload the tab; the content script injects at `document_idle`.

### Status dot is red

The content script could not locate a thread container on this page.
Two common causes:

- You're on the inbox list (`messenger.com/`), not a thread (`messenger.com/t/<id>`).
- Messenger shipped a layout change that removed the ARIA roles the
  extractor relies on. **Please file an issue with the URL pattern (redact
  the thread ID) and a screenshot.**

### Captured counter doesn't move

- Confirm the dot is green. Grey = capture not started.
- Try scrolling slowly. A brief pause between scroll bursts gives the
  observer time to deliver mutations.
- If using paced auto-scroll, switch to manual once — the host site may
  be throttling automated scrolling.

### Timestamps look like `Tue 9:14 AM` or `Yesterday`

These are casual strings rendered by the host site. The extension
preserves them verbatim because converting them client-side without a
year would invent precision. Older messages (>7 days) usually render
with absolute dates; scroll back further and re-export.

### Duplicate messages in the export

The de-duplication key is `sender | text | timestamp`. If the host site
re-renders the same message with a slightly different timestamp string
between scrolls (e.g. "Tue 9:14 AM" → "April 18, 2026 at 9:14 AM"), a
duplicate slips through. **Click *Clear* and capture again** if it
matters.

### Export contains "You" instead of my name

That's intentional and matches what the host site shows in the
conversation column. There's no API call to resolve "You" → your real
name without leaving the device.

### "Download failed" / no Save dialog appears

Chrome's downloads system blocks programmatic downloads under specific
configurations. Try:

- Re-enabling Chrome's download prompts (`chrome://settings/downloads` →
  "Ask where to save each file before downloading").
- Reloading the extension at `chrome://extensions`.
- Opening the service-worker DevTools (`chrome://extensions` →
  **Inspect views: service worker** → **Console**) — any error from
  `chrome.downloads.download` will be logged there.

### The HTML export shows blank

Open it in any modern browser. The HTML is self-contained (no external
fonts or images), so a stripped-down browser will still render it. If it
appears blank in a chat preview, open the file directly.

### CSV opens with weird characters in Excel

The export uses UTF-8. In Excel, use **Data → From Text/CSV** and pick
**65001: Unicode (UTF-8)** as the source encoding rather than
double-clicking the file.

---

## 11. Uninstall and clean up

1. `chrome://extensions` → **Remove** on the Open Chat Archiver card.
   Chrome confirms; click **Remove** in the dialog.
2. Saved settings under `chrome.storage.local` are deleted automatically
   along with the extension.
3. Delete the local folder you cloned or unzipped, if you want.

There is no other state to clean up — no remote servers, no shared
storage, no analytics tags, nothing in `chrome.storage.sync`.

---

## Where to go next

- [PRIVACY.md](../PRIVACY.md) — exact privacy guarantees and how to
  audit them.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — how the popup, content
  script, and service worker cooperate.
- [sample-data/](../sample-data/) — synthetic exports in every format,
  useful as integration-test fixtures.
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to propose changes.
- [SECURITY.md](../SECURITY.md) — how to report a vulnerability.
