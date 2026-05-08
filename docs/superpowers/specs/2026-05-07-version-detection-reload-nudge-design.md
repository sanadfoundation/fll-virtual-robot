# New-Release Detection & Reload Nudge — Design

**Date:** 2026-05-07
**Backlog item:** `BACKLOG.md` → App Shell → "New-release detection + reload nudge"

## Problem

Users keep the simulator open across long sessions (a class period, or even multiple days on a leftover tab). When we ship a fix, those tabs keep running stale code with no signal that anything changed. We want a non-blocking nudge that tells the user a new version is live and lets them reload on their own terms.

## Goals

- Detect that a new build has been deployed while the page is open.
- Show a polite, non-blocking banner offering a reload.
- Never auto-reload, never block input, never lose work.
- Cost essentially nothing in normal operation (no third-party dependencies, no rate limits, no background traffic when the tab is hidden).

## Non-goals

- "What's new" changelog UI (the `builtAt` timestamp is captured for a future iteration; this spec doesn't render it beyond a tooltip).
- Service workers / offline support.
- Notifying the user about deploys that happen while the tab is closed (the next page load picks up the new build naturally — no work needed).

## Architecture

Three pieces:

### 1. GitHub Actions workflow

Path: `.github/workflows/deploy-pages.yml`.

Triggers on push to `main`. Job steps:
1. Checkout.
2. Generate `static/version.json` with the commit SHA and ISO timestamp:
   ```json
   { "sha": "<github.sha>", "builtAt": "<iso-8601>" }
   ```
3. Configure Pages, upload the working tree as the artifact, deploy.

The workflow is the **only writer** of `version.json`. The file is *not* committed to the repo — it's generated fresh per deploy and published as part of the Pages artifact. This avoids self-committing loops and keeps the working tree clean.

### 2. `static/version.json`

Schema:

```json
{
  "sha": "ad0665fcd0a1...",
  "builtAt": "2026-05-07T18:42:11Z"
}
```

- `sha` — full or short commit hash. The only field used for comparison.
- `builtAt` — ISO-8601 UTC timestamp. Advisory only (banner tooltip).

Served by GitHub Pages. Always fetched with `cache: 'no-store'` and a `?_=<Date.now()>` query param to defeat any intermediary caching.

### 3. `js/version_check.js`

New top-level module, loaded from `index.html` after `main.js`. Single responsibility: capture baseline, poll, show/dismiss banner. Target ~80 lines.

State (module-scoped):
- `baselineSha` — set once at startup.
- `dismissedSha` — read from / written to `localStorage[vrs_dismissed_sha]`.
- `pollTimerId` — the `setInterval` handle, cleared/restarted on visibility changes.
- `bannerEl` — created lazily on first display.

Pure helpers (extracted for unit testing):
- `shouldShowBanner(latestSha, baselineSha, dismissedSha) → boolean`
- `parseVersionPayload(text) → { sha, builtAt } | null`

### 4. Banner DOM & CSS

Inserted by `version_check.js` between `<header>` and `.app-body`:

```html
<div id="version-banner" class="version-banner" hidden>
  <span class="version-banner-msg">A new version is available.</span>
  <button class="version-banner-reload" type="button">Reload</button>
  <button class="version-banner-dismiss" type="button" aria-label="Dismiss">✕</button>
</div>
```

CSS in `css/style.css`. Slim bar (~32px tall), uses existing theme variables so it inherits light/dark. Non-modal. The `[hidden]` attribute toggles visibility — no animation needed in v1.

## Data flow

### On page load

1. `version_check.js` runs after `main.js`.
2. Fetch `static/version.json` with `cache: 'no-store'`.
3. On success: stash `data.sha` as `baselineSha`. On failure (404 in dev, network blip): log a debug warning, mark the module dormant, do not start the poll loop.
4. Read `dismissedSha` from `localStorage`.
5. Start the poll loop (only if step 3 succeeded).

### Poll loop

- `setInterval` every 5 minutes, but only fires while `document.visibilityState === 'visible'`.
- On `visibilitychange → 'visible'`: trigger an immediate check (catches the "user came back to a tab they left open" case).
- On `visibilitychange → 'hidden'`: clear the interval; restart on next visibility regain. (Prevents background tabs from accumulating polls.)

Each check:
1. Fetch `version.json` with `cache: 'no-store'` + `?_=<Date.now()>`.
2. Parse via `parseVersionPayload`. On parse failure: swallow, return.
3. Call `shouldShowBanner(latest.sha, baselineSha, dismissedSha)`. If true → render banner.
4. If banner already visible and the SHA changed again, update its `title` tooltip with the new `builtAt`. (Don't hide and re-show.)

### Banner actions

- **Reload** → `location.reload()`. No query param tricks; the Pages deploy already publishes new file ETags.
- **✕ (dismiss)** → write `latest.sha` to `localStorage[vrs_dismissed_sha]`, set `hidden` on the banner. Won't reappear until a *third* SHA is observed (i.e., a newer build than the one they dismissed).

## Error handling

The feature is best-effort. Every failure mode is silent:

| Failure | Behavior |
|---|---|
| `version.json` 404 (dev server) | Module dormant, no banner, no poll loop. |
| Network error during initial fetch | Module dormant. |
| Network error during poll | Skip this tick; retry next interval. |
| Malformed JSON | Skip; retry next interval. |
| `localStorage` write fails (private mode quota) | Catch; banner still hides for the session, just no cross-session memory. |

No toasts, no console errors at non-debug log levels. The banner is the *only* user-visible artifact of this feature.

## Testing

### Unit (existing `node:test` harness in `tests/`)

- `shouldShowBanner` — full truth table:
  - `latest === baseline` → `false`
  - `latest === dismissed` → `false`
  - `latest !== baseline && latest !== dismissed` → `true`
  - empty / null inputs → `false`
- `parseVersionPayload` — valid JSON, missing `sha`, malformed JSON, extra fields all return the expected shape (or `null`).

### Manual smoke

1. Run `python3 -m http.server 8787`. Confirm banner does **not** appear (404 path, dormant).
2. Hand-create `static/version.json` with `{"sha":"a","builtAt":"..."}`. Reload. Edit to `{"sha":"b","builtAt":"..."}`. Wait for the next poll (or toggle tab visibility). Banner appears.
3. Click ✕. Banner hides. Edit to `{"sha":"b"}` again — banner stays hidden. Edit to `{"sha":"c"}` — banner reappears.
4. Click **Reload**. Page reloads, banner does not reappear (now `baselineSha === c`).

### Workflow validation

Push to a throwaway branch with the workflow gated to that branch. Confirm:
- The Pages artifact contains a fresh `static/version.json`.
- `sha` matches `${{ github.sha }}`.
- `builtAt` is a valid ISO-8601 timestamp.

## Open questions resolved during brainstorming

- **Source of truth:** `version.json` produced by GitHub Actions, not asset-hash. Asset-hash on `index.html` would miss almost every release in this repo, and hashing every JS file is brittle.
- **Polling cadence:** every 5 min while visible, plus on visibility-regained.
- **Mid-run protection:** none. Reload is the user's call. Editor state is already persisted to `localStorage`; only an active program run is at risk, and we trust the user not to click Reload mid-experiment.
- **Dismiss semantics:** dismiss persists for that specific SHA. The next deploy re-prompts.

## Out of scope (will not implement in this work)

- Workflow that runs the test suite before deploying. Useful but separate concern; this spec assumes pushes to `main` are deploy-ready.
- Renaming `static/` if it conflicts with a future asset pipeline.
- Backporting the banner to older deploys (impossible by definition — the old build doesn't have the JS).

## File touch list

- **New:** `.github/workflows/deploy-pages.yml`
- **New:** `js/version_check.js`
- **New:** `tests/js/version_check/version_check.test.js` (matches the existing per-feature folder layout under `tests/js/`)
- **Modified:** `index.html` — one `<script>` line for `version_check.js`
- **Modified:** `css/style.css` — banner styles
- **Modified:** `.gitignore` — add `static/version.json` so a locally hand-edited copy never lands in a commit
- **Modified:** `BACKLOG.md` — strike the line under App Shell
