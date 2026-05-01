# Changelog

All notable changes to Open Chat Archiver will be documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/),
and this project follows [SemVer](https://semver.org/).

## [Unreleased]

### Added
- `.github/CODEOWNERS` routing every path to the maintainer.
- Tag-triggered `release` workflow that builds a runtime zip, computes
  its SHA-256, extracts the matching CHANGELOG section, and publishes a
  GitHub Release with extensive auto-generated install / verify / usage
  documentation in the body.
- `node --check` over every extension JS file in CI.
- CI step that fails the build if any path declared in `manifest.json`
  is missing on disk.
- `docs/USAGE.md` rewritten as a complete end-user walkthrough including
  install, options reference, capture flow, export verification, update
  procedure, and an expanded troubleshooting section.
- `CONTRIBUTING.md` documents the day-2 PR-based workflow, pre-merge
  checklist, release-tagging procedure, and current branch-protection
  status.

### Changed
- README polished with a centered hero, scoped badges, and at-a-glance
  attribute table. Every claim is sourced from `manifest.json`,
  `CLAUDE.md`, or an existing source file.
- CI's disallowed-network-API grep now also rejects `EventSource` and
  `importScripts`.

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
