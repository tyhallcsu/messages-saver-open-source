# Privacy

Open Chat Archiver is designed to give you a local copy of your own
conversations with **no data collection of any kind**.

## What the extension does on your device

- Reads messages that your browser has already rendered in the active
  tab's DOM while you are signed in.
- Keeps the captured messages in an in-memory buffer inside the
  content script (the browser tab). When the tab reloads, the buffer is
  discarded.
- Stores user preferences (format, filename template, pacing, capture
  toggles) in `chrome.storage.local`. Never `chrome.storage.sync` —
  your preferences do not leave the device.
- Writes exports to disk through `chrome.downloads.download()`. You see
  the standard browser Save dialog before anything is written.

## What the extension never does

- Never makes outbound network requests. The service worker has no
  `fetch`, `XHR`, or `WebSocket` calls. The `host_permissions` list
  exists solely so the content script can run inside the Messenger /
  Facebook tabs; it is not used for any remote calls.
- Never reads, copies, or transmits cookies, auth headers, session
  tokens, or account identifiers.
- Never integrates with analytics services, crash reporters, feature
  flag servers, A/B tests, or advertising SDKs.
- Never displays third-party content. Fonts and colors are native CSS
  only.

## What the extension's permissions are for

| Permission         | Why it is requested                                        |
| ------------------ | ---------------------------------------------------------- |
| `storage`          | Save your export format, filename template, and toggles.   |
| `downloads`        | Trigger the browser's Save dialog for the export file.     |
| `activeTab`        | Send messages to the content script when you click the popup. |
| `host_permissions` for `facebook.com`, `messenger.com` | Run the content script in those tabs so it can read the conversation you are viewing. |

## Auditing

- `background.js` is plain JavaScript with no bundler, minification, or
  remote imports. Search it for `fetch(`, `XMLHttpRequest`, `WebSocket`,
  `ping`, or `image(` — you will find none.
- `content.js` is similarly dependency-free. Its only external
  interaction is `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`
  between extension components.
- The manifest does not request `"*://*/*"` or `"<all_urls>"` for host
  permissions.

If you find anything that appears to contradict this document, please
open an issue — that is a bug, and a serious one.
