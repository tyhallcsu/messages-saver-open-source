# Usage guide

This is a short, practical walkthrough. For design details see
[ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Install

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and pick this folder (`messages-saver-open-source/`).

## 2. Open a conversation

Navigate to either:

- `https://www.messenger.com/t/<thread>`
- `https://www.facebook.com/messages/t/<thread>`

The extension is inert on every other page — its content script only
runs on those URL patterns.

## 3. Start capturing

Click the Open Chat Archiver icon, then **Start capture**. The status
dot turns green and the **captured** counter begins tracking the
messages already visible.

Scroll up slowly. As Messenger / Facebook loads older messages into the
DOM, the observer picks them up and the counter climbs.

### Optional: paced auto-scroll

If you do not want to scroll manually:

1. Right-click the icon → **Options**.
2. Under *Capture behavior*, set **Scroll pacing** to *Slow / Normal /
   Fast*.
3. Save, then start capture. The extension will gently scroll the
   message list upward on an interval until it reaches the top or hits
   the **max auto-scrolls** ceiling.

Pacing is disabled by default because manual scrolling is the most
reliable way to load history.

## 4. Filter by date (optional)

Set **From** / **To** in the popup. The *in range* counter updates
immediately. Leaving both blank exports everything captured.

Messages with no parseable timestamp are always included — the
extension does not silently drop ambiguous rows.

## 5. Export

Pick a format and click **Download export**. The browser's Save dialog
appears with the filename derived from the template in Options
(default: `chat-archive_{thread}_{date}.{ext}`).

| Format | What you get |
| ------ | ------------ |
| JSON   | Machine-readable. Use for archiving, migrating, or scripting. |
| CSV    | Spreadsheet-ready. Opens in Excel / Numbers / Sheets. |
| TXT    | A readable transcript. Enable *collapse consecutive* in Options for a cleaner look when the same person sends several messages in a row. |
| HTML   | A self-contained, printable page. No external assets. |

## 6. Troubleshooting

**The popup says "Ready — content script not yet active".**
Reload the conversation tab. The content script is injected at
`document_idle`; if you had the tab open before installing the
extension, it needs a reload.

**The captured count doesn't move.**
Check the status dot:

- Grey: capture isn't running. Click *Start capture*.
- Red: the thread container couldn't be found. Make sure you're on an
  actual conversation URL, not the inbox list. If you are, file an
  issue and include the URL pattern and a screenshot.

**Timestamps look garbled.**
The site often renders timestamps as casual strings ("Tue 9:14 AM")
rather than machine-readable values. The extension keeps whatever it
can read; for strict date filtering, you'll get best results in JSON
since the filter only drops messages whose timestamps are
unambiguously outside the range.

**Duplicate messages in the export.**
The de-duplication key is `sender | text | timestamp`. If you scroll
back and forth repeatedly *and* the host site re-renders a message
with a changed timestamp string, a duplicate can slip through. Use
**Clear** and start over if that happens.

## 7. Uninstall

Go to `chrome://extensions` and click **Remove** on Open Chat
Archiver. Saved preferences live in `chrome.storage.local` and are
deleted along with the extension.
