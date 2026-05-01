<div align="center">

<img src="icons/icon-128.png" alt="Open Chat Archiver" width="128" height="128" />

# Open Chat Archiver (FB Messages Downloader)

**A dependency-free Chrome extension that exports your own Facebook / Messenger conversations to JSON, CSV, TXT, or HTML — locally, with no network egress.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/tyhallcsu/messages-saver-open-source/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tyhallcsu/messages-saver-open-source/actions/workflows/ci.yml)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Zero dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)](#development)
[![No tracking](https://img.shields.io/badge/tracking-none-brightgreen.svg)](PRIVACY.md)

[Install](#install) · [Usage](#usage) · [Formats](#formats) · [Privacy](#privacy) · [Architecture](#architecture) · [Contributing](#contributing)

</div>

---

## Overview

Open Chat Archiver is a small, open-source Chrome extension (Manifest V3) that
lets you save a local copy of a conversation you are already signed into on
Facebook or Messenger. It works purely by reading the messages that are
already rendered in your own browser — **no private APIs, no external servers,
no telemetry, no tracking.**

Exports are written to your computer through the browser's standard Downloads
prompt. There is no sign-up, no paid tier, no feature flags, and no remote
update channel.

> This project is an independent, clean-room reimplementation. It is not
> affiliated with, endorsed by, or derived from Meta Platforms, Inc., nor
> from any commercial "Messages Saver" product. "Facebook" and "Messenger"
> are trademarks of their respective owners and are used here only to
> describe the sites this tool can read from.

## At a glance

| | |
|---|---|
| **Type** | Chrome Extension (Manifest V3) |
| **Status** | Public, pre-1.0 (`0.1.0`) |
| **License** | [MIT](LICENSE) |
| **Runtime deps** | None (vanilla HTML / CSS / JS) |
| **Build step** | None |
| **Network calls** | None (enforced in CI) |
| **Min Chrome** | 114 |
| **Permissions** | `storage`, `downloads`, `activeTab` |
| **Host scope** | `facebook.com`, `m.facebook.com`, `messenger.com` only |

## Features

- **Four export formats** — JSON (lossless, schema-tagged), CSV, plain TXT,
  and a self-contained HTML viewer.
- **Date-range filter** — restrict exports to a specific window.
- **DOM-based capture** — uses a `MutationObserver` on the conversation
  region, so it sees only what *you* see on screen.
- **Optional paced auto-scroll** — load older messages without hammering the
  page.
- **Configurable** — format, filename template, scroll pacing, reactions,
  attachment URL capture, consecutive-sender collapsing.
- **Local-only state** — preferences live in `chrome.storage.local`. The
  service worker has no `fetch`, `XHR`, or `WebSocket` calls.

## Install

The extension is distributed via this repository (developer-mode load).

1. Clone the repo:
   ```bash
   git clone https://github.com/tyhallcsu/messages-saver-open-source.git
   ```
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the cloned folder.
5. Pin the icon to your toolbar.

After editing any source file, click the extension's *Reload* button on
`chrome://extensions`.

## Usage

1. Open a conversation on `messenger.com` or `www.facebook.com/messages/...`.
2. Click the extension icon → **Start capture**.
3. Scroll up to load older messages, or enable *paced auto-scroll* in the
   options page.
4. Watch the **captured** counter climb in the popup.
5. (Optional) Set a **From** / **To** date range.
6. Pick a format (JSON / CSV / TXT / HTML) and click **Download export**.
7. Confirm the browser's Save dialog.

Click **Stop capture** to end the session, or **Clear** to reset the
in-memory buffer. A more detailed walkthrough is in [docs/USAGE.md](docs/USAGE.md).

## Formats

| Format | Best for | Notes |
|---|---|---|
| **JSON** | Archival, programmatic access | Schema: `open-chat-archiver/1`. See [`sample-data/sample-conversation.json`](sample-data/sample-conversation.json). |
| **CSV** | Spreadsheets, diffs | One message per row; UTF-8 with CRLF terminators. |
| **TXT** | Human-readable transcripts | Optional consecutive-sender collapsing. |
| **HTML** | Self-contained viewable file | Plain CSS, no external assets. |

Sample exports of synthetic conversations live in [`sample-data/`](sample-data/).

## Permissions

The extension asks for the minimum needed to do its job. Each permission is
justified below; the rationale is also documented in [PRIVACY.md](PRIVACY.md).

| Permission | Purpose |
|---|---|
| `storage` | Persist your export format, filename template, and capture toggles. |
| `downloads` | Trigger the browser's Save dialog when you click **Download export**. |
| `activeTab` | Send messages to the content script on the current Messenger/Facebook tab when you open the popup. |
| `host_permissions` (`facebook.com`, `m.facebook.com`, `messenger.com`) | Allow the content script to run inside those tabs and read the conversation DOM. |

There is no `<all_urls>` host permission. CI rejects any PR that adds one.

## Privacy

The short version (full text in [PRIVACY.md](PRIVACY.md)):

- Runs entirely on your device.
- Reads only the DOM of the active conversation tab.
- Makes **zero** network requests of its own. The CI pipeline enforces this
  with a static check against `fetch`, `XMLHttpRequest`, `WebSocket`,
  `navigator.sendBeacon`, `EventSource`, and `importScripts`.
- Exports are plain files written through `chrome.downloads.download()`.

## Architecture

Three contexts cooperate; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for
the full diagram and message contracts.

```
┌──────────────┐  messages   ┌──────────────┐   download url
│  popup.html  │◀──────────▶│  content.js  │
│  popup.js    │             │              │
└─────┬────────┘             └──────────────┘
      │                              ▲
      │ DOWNLOAD_EXPORT              │ DOM mutations
      ▼                              │
┌──────────────┐                     │
│ background.js│ ──► chrome.downloads.download()
└──────────────┘
```

## Repo layout

```
messages-saver-open-source/
├── manifest.json
├── background.js          # service worker: serializers + downloads
├── content.js             # DOM capture + export buffer
├── content.css
├── popup.html / .css / .js
├── options.html / .css / .js
├── icons/                 # 16 / 48 / 128 px (generated by scripts/generate_icons.py)
├── scripts/
│   └── generate_icons.py  # stdlib-only Python PNG generator
├── sample-data/           # synthetic example exports (JSON / CSV / TXT)
├── docs/
│   ├── ARCHITECTURE.md
│   └── USAGE.md
├── .github/
│   ├── workflows/         # ci.yml, release.yml
│   ├── ISSUE_TEMPLATE/
│   └── PULL_REQUEST_TEMPLATE.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                # MIT
├── PRIVACY.md
└── SECURITY.md
```

## Development

There is no build step. Edit the source files and reload the extension at
`chrome://extensions`.

Regenerate icons after editing the design in `scripts/generate_icons.py`:

```bash
python3 scripts/generate_icons.py
```

The generator uses only the Python standard library — no extra packages.

If you change `content.js → extractMessageFromRow()` or any serializer in
`background.js`, sanity-check the output against
[`sample-data/sample-conversation.json`](sample-data/sample-conversation.json)
to confirm the schema still parses.

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and
pull request to `main` and verifies:

- `manifest.json` and `sample-data/sample-conversation.json` parse as JSON.
- `node --check` passes for every extension JS file.
- Every path declared in `manifest.json` (icons, scripts, popup, options,
  content scripts, web-accessible resources) exists on disk.
- Icons on disk match the deterministic output of `scripts/generate_icons.py`.
- No disallowed network APIs are called from extension code.
- `host_permissions` does not include `<all_urls>` or wildcard schemes.

### Releases

[`.github/workflows/release.yml`](.github/workflows/release.yml) fires when
you push a tag matching `v*.*.*`. It verifies the tag matches
`manifest.json`'s `version`, builds a zip of the runtime files, and creates
a GitHub Release with auto-generated notes and the zip attached.

To cut a release:

```bash
# bump manifest.json version, update CHANGELOG.md, commit, then:
git tag v0.1.1
git push origin v0.1.1
```

## Limitations

- Facebook / Messenger ships DOM changes frequently. Selectors are chosen
  for stability (ARIA roles, `<time>`, generic `[role=row]`) but may still
  drift. Please open an issue with a screenshot if capture stops working.
- The extension only sees rendered messages. Media is referenced by URL,
  not downloaded.
- Very large conversations (tens of thousands of messages) may slow the
  page as the DOM grows. That is a property of the host site, not of this
  extension.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
first — the short version:

- Keep the extension dependency-free.
- No trackers, analytics, remote endpoints, or feature flags.
- No reading of cookies, auth headers, or session tokens.
- No new manifest permissions without a clear justification in the PR.
- Smoke-test against a real conversation before requesting review.

## Security

Found something that looks like a vulnerability? Please **do not** open a
public issue. See [SECURITY.md](SECURITY.md) for how to file a private
advisory.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). The project follows
[SemVer](https://semver.org/).

## Code of conduct

Participation in this project is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Author

Maintained by **sharmanhall**.

## License

[MIT](LICENSE).
