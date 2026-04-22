# Architecture

This document describes how the three extension contexts cooperate.

## Contexts

```
┌─────────────────────────────────────────────────────────────────┐
│                       Chrome extension                          │
│                                                                 │
│  ┌──────────────┐   chrome.runtime   ┌────────────────────┐     │
│  │   popup.js   │◀──────────────────▶│   background.js    │     │
│  │  (popup UI)  │   DOWNLOAD_EXPORT  │ (service worker)   │     │
│  └──────┬───────┘                    └─────────┬──────────┘     │
│         │                                      │                │
│         │ chrome.tabs.sendMessage              │                │
│         ▼                                      ▼                │
│  ┌──────────────┐                    ┌────────────────────┐     │
│  │  content.js  │                    │ chrome.downloads   │     │
│  │  (per tab)   │                    └────────────────────┘     │
│  └──────────────┘                                               │
└─────────────────────────────────────────────────────────────────┘
             │
             │ reads from DOM
             ▼
   ┌───────────────────────┐
   │ messenger.com / fb.com │
   │ conversation view     │
   └───────────────────────┘
```

### `content.js`

Runs in the tab of every supported URL. Responsibilities:

1. **Locate the thread container** heuristically, preferring ARIA
   `role="main" > role="grid" | role="log"`, then the largest scrollable
   region inside `main`.
2. **Extract a message** from each row using:
   - Text: `innerText` (what the user can see).
   - Sender: `aria-label` (of the form "Sender sent …") or the row's
     heading element.
   - Direction: `justify-content: flex-end` / `text-align: right` → outgoing.
   - Timestamp: a child `<time>`, `[datetime]`, `[data-timestamp]`, or
     a parsed "at …" tail of the row's `aria-label`.
   - Reactions: descendants whose `aria-label` mentions "react".
   - Attachments: `a[href]` and `img[src]` with `http(s):` URLs.
3. **De-duplicate** via a fingerprint built from `sender | text | timestamp`.
4. **Observe** `childList + subtree` mutations on the container so
   messages that fade in while the user scrolls get captured.
5. **Watch URL changes** (SPA navigation) and re-anchor to the new
   thread container automatically.
6. **Respond to popup messages**:
   `GET_STATUS`, `START_CAPTURE`, `STOP_CAPTURE`, `CLEAR`, `SET_FILTER`,
   `EXPORT`.

### `popup.js`

- Queries the active tab, decides whether it's a supported URL.
- Polls the content script every second while open to show a live count.
- Persists the user's picks (`fromDate`, `toDate`, `format`) to
  `chrome.storage.local`.
- On **Download export**, asks the content script for a filtered message
  list and then forwards it to the background worker.

### `background.js`

- Seeds default settings on install.
- Receives `DOWNLOAD_EXPORT`, runs the appropriate serializer, templates
  the filename, encodes the file as a `data:` URL (UTF-8 safe), and
  calls `chrome.downloads.download({ saveAs: true })`.

## Why DOM-based capture only

- **Legality / ToS**: reading your own rendered DOM is the same thing
  your browser already does. Private API endpoints, GraphQL request
  signing, session token extraction, and traffic interception are *not*
  used and will not be accepted in PRs.
- **Audit surface**: the content script has no network calls. Everything
  it sees is derived from already-rendered DOM. The service worker has
  no network calls either. There is no way for this extension to leak
  data off-device without explicitly being given that capability.
- **Durability**: host sites rewrite their internal class names
  frequently but almost never remove ARIA semantics or `<time>`
  elements, so this approach is more stable than class-based scraping.

## Message object shape

```ts
type Message = {
  sender: string;        // "" if unknown
  text: string;          // visible text
  timestamp: string;     // ISO 8601 when available, else DOM-visible text
  direction: "incoming" | "outgoing";
  reactions: string[];   // human-readable reaction labels
  attachments: string[]; // absolute URLs only
};
```

## Export schema

JSON exports are tagged with `"schema": "open-chat-archiver/1"`. Any
backwards-incompatible change to the shape above should bump the schema
version and update `sample-data/`.

## Non-goals

- Downloading attachment bytes. The extension records attachment URLs
  only. If you need the media, follow the URL in a normal tab.
- Bypassing rate limits, captchas, or authentication checks on the host
  site.
- Rewriting, editing, or deleting messages on the host site.
