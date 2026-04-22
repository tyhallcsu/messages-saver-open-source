# CLAUDE.md

Project-level guidance for [Claude Code](https://claude.com/claude-code) or
any other AI pair-programmer working in this repository.

## Project at a glance

Open Chat Archiver is a dependency-free, Manifest V3 Chrome extension that
exports a conversation from the user's own Facebook / Messenger session
to JSON, CSV, TXT, or HTML. All logic runs locally — there are no remote
endpoints.

There is no build step. Source files run as-is inside Chrome.

## Hard rules for any code change

These are non-negotiable. A PR that violates them will be reverted.

1. **No network egress.** `content.js` and `background.js` must never
   call `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`,
   or import a script from off-origin. Telemetry, crash reporting, and
   "anonymous usage stats" all count as network egress.
2. **No runtime dependencies.** No npm, no bundler, no CDN imports.
   Pure vanilla HTML / CSS / JS. The icon generator uses the Python
   standard library only.
3. **No private-API scraping.** The content script reads only the
   already-rendered DOM. Do not touch cookies, `document.cookie`,
   auth headers, GraphQL endpoints, session tokens, CSRF state, or
   internal site JavaScript objects.
4. **Minimal permissions.** Do not add manifest permissions casually.
   If a change needs one, justify it in the PR description. Never add
   `"<all_urls>"` or `"*://*/*"` host permissions.
5. **Respect host-site ToS.** Nothing this extension does should be
   materially different from what a user could do by manually reading
   and copy-pasting their own conversation.

## File map

```
manifest.json            MV3 manifest. Host permissions are narrow.
background.js            Service worker: serializers + chrome.downloads.
content.js               Per-tab DOM capture via MutationObserver.
popup.html / .css / .js  Toolbar popup UI.
options.html / .css / .js Options page.
icons/                   Generated PNGs (16/48/128).
scripts/generate_icons.py  Stdlib-only PNG generator.
sample-data/             Synthetic fake conversations for schema tests.
docs/ARCHITECTURE.md     How the three contexts talk to each other.
docs/USAGE.md            End-user walkthrough.
PRIVACY.md               Ground-truth privacy claims. Keep current.
CONTRIBUTING.md          PR checklist and style.
```

## Common tasks

### Adjust the DOM extractor

`content.js → extractMessageFromRow()` is the single function responsible
for turning a DOM row into a `Message` object. Prefer ARIA / semantic
selectors over class names — the host site rewrites classes constantly.

### Add or change an export format

1. Add a `serializeXxx()` function in `background.js`.
2. Wire it into `serialize()` at the top of the file.
3. Add a radio option in `popup.html` and `options.html`.
4. Add a new sample file in `sample-data/` and update the sample README.
5. Update the table in `README.md`.

### Rebuild icons

```bash
python3 scripts/generate_icons.py
```

The script requires no extra packages. Edit the `render(size)` function
for design tweaks; `write_png()` and the drawing primitives handle
serialization.

### Smoke test

1. Load the unpacked extension at `chrome://extensions` (Developer
   mode → Load unpacked).
2. Open `messenger.com/t/<thread>`.
3. Click the icon → **Start capture**, scroll a few screens.
4. Export once in each format. Confirm the download dialog appears and
   the file opens cleanly.

## Message schema

Canonical shape (keep it stable; bump the schema string on breaking
changes):

```ts
type Message = {
  sender: string;
  text: string;
  timestamp: string;                        // ISO 8601 when available
  direction: "incoming" | "outgoing";
  reactions: string[];
  attachments: string[];                    // absolute URLs only
};
```

JSON exports carry `"schema": "open-chat-archiver/1"`.

## What NOT to add

- Analytics, crash reporting, feature flags, A/B tests.
- Auto-update mechanisms that pull JS from a remote host.
- Any integration that requires an API key.
- Attachment downloading (we record URLs only; this keeps the attack
  surface zero).
- Any code that modifies the host site's DOM, sends messages, deletes
  items, or interacts with it beyond reading.

## Author

All commits in this repository are authored by **sharmanhall**.

## Helpful context when generating code

- Chrome MV3 service workers have no `window`, no `document`, no
  persistent state. Keep the worker stateless and store everything you
  need in `chrome.storage.local`.
- `btoa` is Latin-1 only. When base64-encoding exports, encode to UTF-8
  with `TextEncoder` first (see `toDataUrl()` in `background.js`).
- Chrome MV3 content scripts cannot directly call `chrome.downloads`.
  Forward the payload to the background worker via
  `chrome.runtime.sendMessage`.
