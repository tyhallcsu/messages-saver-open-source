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

## Day-2 update workflow (PR-based)

Direct pushes to `main` are discouraged even though the host plan does
not currently support enforced branch protection on this private repo
(GitHub Pro is required, or the repo would need to be public). The
convention below is the day-2 flow regardless.

```bash
# Start from a clean main
git checkout main
git pull --ff-only origin main

# Cut a feature branch
git checkout -b fix/scroll-pacing-default

# Make changes, commit using whatever granularity reads best
git add .
git commit -m "fix(content): clamp scroll pacing to 250ms minimum"

# Push and open a PR
git push -u origin fix/scroll-pacing-default
gh pr create --base main --fill --web
```

**When the PR is ready to merge**, squash and delete the branch in one
command:

```bash
gh pr merge --squash --delete-branch
```

### Pre-merge checklist

Before clicking merge, confirm:

- [ ] CI is green on the PR (the `ci` workflow validates manifest, runs
      `node --check`, regenerates icons, and enforces the no-network rule).
- [ ] CHANGELOG.md has an entry under `## [Unreleased]` if the change is
      user-visible.
- [ ] `manifest.json` `version` was bumped if this PR will be tagged for
      release.
- [ ] No new manifest permissions, network calls, or runtime dependencies.
- [ ] Screenshots attached for any UI change.

### Cutting a release

There are three ways to fire the release pipeline. All three run the
same `_validate` gate first; a failed gate aborts the publish.

**1. Auto-release on version bump (recommended).**
Bump `manifest.json` `version` in a PR, add a matching `## [<version>]`
section to `CHANGELOG.md`, get the PR merged. The push to `main`
triggers `release.yml` automatically; the workflow detects the version
change, runs the validation gate, creates the matching tag, and
publishes the release. No `git tag` step required on your end.

**2. Manual tag push.**

```bash
git checkout main
git pull --ff-only origin main
git tag v$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
git push origin --tags
```

The release workflow verifies the tag matches `manifest.json` and
publishes. Useful when you want to release from a specific older
commit.

**3. Manual UI trigger.**
GitHub UI → **Actions** tab → **release** workflow → **Run workflow**
button. Uses whatever version is in `manifest.json` on the chosen
branch. Useful for re-running a failed publish without bumping the
version again.

In all three cases the release workflow:

1. Decides whether to release (version actually changed, tag doesn't
   already exist for the auto path).
2. Runs `_validate.yml` — manifest parse, sample-data schema, node
   `--check`, manifest-path existence, icon regen, network-API check,
   host-permission check.
3. Builds the runtime zip (manifest, scripts, icons, LICENSE, README,
   PRIVACY).
4. Computes SHA-256, file manifest, and pulls the matching `CHANGELOG.md`
   section.
5. Publishes a GitHub Release with the zip attached and an extensive
   install + verify + usage body auto-generated.

### Branch-protection status

| Setting | State | Notes |
|---|---|---|
| Required status checks on `main` | Not enforced | Requires GitHub Pro on private user repos. Convention: do not push directly. |
| Linear history | Not enforced | Squash-merge default keeps history linear in practice. |
| Force-push to `main` | Allowed by API | Convention: never force-push to `main`. |
| CODEOWNERS review | Active | `.github/CODEOWNERS` routes all PRs to `@tyhallcsu`. |

To enable enforced branch protection, either upgrade to GitHub Pro or
make the repo public. Until then, the PR-based workflow above is
convention-only.
