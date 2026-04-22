# Changelog

All notable changes to Open Chat Archiver will be documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [SemVer](https://semver.org/).

## [0.1.0] — initial public release

### Added
- Manifest V3 Chrome extension scaffolding.
- DOM-based conversation capture via `MutationObserver` on the active
  Messenger / Facebook conversation region.
- Popup UI with status indicator, live capture count, date-range filter,
  format picker, and export button.
- Options page with default format, filename template, scroll pacing,
  capture toggles (reactions, attachment URLs, consecutive collapsing).
- Background service worker with JSON / CSV / TXT / HTML serializers,
  filename templating, and `chrome.downloads.download()` integration.
- Original PNG icons at 16, 48, and 128 px, generated from
  `scripts/generate_icons.py` with standard-library Python only.
- Sample synthetic exports in `sample-data/`.
- Documentation: README, PRIVACY, ARCHITECTURE, USAGE.
