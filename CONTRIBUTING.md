# Contributing

Thank you for considering a contribution!

## Ground rules

1. **Dependency-free.** No npm, no bundler, no runtime libraries. Pure
   HTML / CSS / vanilla JavaScript. The icon generator uses only the
   Python standard library.
2. **No network calls.** The service worker and content script must
   never contact a remote host. If your change introduces `fetch`,
   `XMLHttpRequest`, `WebSocket`, a script `src=` pointing off-origin,
   or anything similar, it will not be merged.
3. **No private auth.** Do not read cookies, auth headers, local
   storage tokens, CSRF tokens, or URL-encoded session state. The
   extension only sees the rendered DOM.
4. **Respect host-site ToS.** We avoid any behavior that would be
   meaningfully different from what a user can do by hand: no faking
   requests, no rate-limit evasion, no editing or deleting messages.
5. **Keep the permission list minimal.** If a change needs a new
   permission, call that out prominently in the PR description and
   justify it.

## Code style

- Two-space indent, semicolons, double quotes for strings.
- Prefer small, named functions over deep nesting.
- Comments should explain *why*, not *what*.
- Avoid abbreviations in identifiers (`messageFingerprint`, not `mfp`).

## Testing your change

There is no automated test suite yet. Manual smoke test:

1. Load the unpacked extension.
2. Open a real Messenger conversation.
3. Start capture, scroll a few screens, export as each of JSON / CSV /
   TXT / HTML.
4. Confirm the exports open cleanly and content looks right.
5. Diff any schema changes against `sample-data/`.

If you add behavior that can be exercised without the host site,
please also add a deterministic sample in `sample-data/`.

## Pull request checklist

- [ ] No new runtime dependencies.
- [ ] No new network calls.
- [ ] No new permissions (or, if needed, justified in the PR).
- [ ] README / docs updated if user-facing behavior changed.
- [ ] Sample exports regenerated if the JSON schema changed.
- [ ] Screenshots attached for UI changes.

## Filing issues

Please include:

- Chrome version.
- Extension version (`manifest.json` `version`).
- The URL pattern you were on (e.g. `messenger.com/t/…`) — redact the
  thread ID.
- Screenshot or a short screen recording if the UI is involved.
- Relevant lines from the browser console.
