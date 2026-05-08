# New-Release Detection & Reload Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect new deployments while the simulator tab is open and show a non-blocking banner offering a one-click reload.

**Architecture:** A GitHub Actions workflow generates `static/version.json` on every push to `main` and publishes the site to GitHub Pages. A small client module (`js/version_check.js`) fetches that file at startup to capture a baseline SHA, then polls every 5 minutes (visibility-gated) and shows a banner above the header when the SHA changes. Pure helpers are unit-tested via the existing `node:test` harness.

**Tech Stack:** Vanilla browser JS (no build step), `node:test` for unit tests, GitHub Actions + `actions/deploy-pages` for the deploy workflow.

**Reference spec:** [`docs/superpowers/specs/2026-05-07-version-detection-reload-nudge-design.md`](../specs/2026-05-07-version-detection-reload-nudge-design.md).

---

## File Structure

| File | New / Modified | Responsibility |
|---|---|---|
| `js/version_check.js` | new | Module: baseline capture, poll loop, banner show/hide/dismiss. Exposes `window.versionCheck` for tests and bootstrap. |
| `tests/js/version_check/helper.js` | new | Loads `js/version_check.js` into a `vm` context (mirrors `tests/js/sim-helper.js`). |
| `tests/js/version_check/version_check.test.js` | new | Unit tests for `shouldShowBanner` and `parseVersionPayload`. |
| `css/style.css` | modify | Banner styles using existing theme variables. |
| `index.html` | modify | One `<script>` tag for `version_check.js`. |
| `.github/workflows/deploy-pages.yml` | new | On push to `main`: write `static/version.json`, publish to Pages. |
| `.gitignore` | modify | Ignore `static/version.json` (generated, never committed). |
| `BACKLOG.md` | modify | Strike the App Shell bullet. |

---

## Task 1: Skeleton module with browser/node-friendly export

**Files:**
- Create: `js/version_check.js`

- [ ] **Step 1: Create the skeleton with the module-pattern wrapper used elsewhere in the project**

Create `js/version_check.js` with:

```javascript
'use strict';

(function (root) {
  // Pure helpers (filled in by Tasks 2 and 3).
  function shouldShowBanner(/* latestSha, baselineSha, dismissedSha */) {
    throw new Error('not implemented');
  }
  function parseVersionPayload(/* text */) {
    throw new Error('not implemented');
  }

  // Runtime entry point (filled in by Task 5/6). Safe no-op for now.
  function init() {}

  const api = { shouldShowBanner, parseVersionPayload, init };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.versionCheck = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Commit**

```bash
git add js/version_check.js
git commit -m "feat(version-check): add module skeleton"
```

---

## Task 2: `shouldShowBanner` (TDD)

**Files:**
- Create: `tests/js/version_check/helper.js`
- Create: `tests/js/version_check/version_check.test.js`
- Modify: `js/version_check.js`

- [ ] **Step 1: Create the test helper (mirrors `tests/js/sim-helper.js`)**

Create `tests/js/version_check/helper.js`:

```javascript
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../js/version_check.js'),
  'utf8',
);

function loadVersionCheck() {
  const root = {};
  const context = vm.createContext({
    window: root,
    globalThis: root,
    console,
  });
  vm.runInContext(SRC, context);
  return root.versionCheck;
}

module.exports = { loadVersionCheck };
```

- [ ] **Step 2: Write the failing tests for `shouldShowBanner`**

Create `tests/js/version_check/version_check.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { loadVersionCheck } = require('./helper');

test('shouldShowBanner: false when latest matches baseline', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('abc', 'abc', null), false);
});

test('shouldShowBanner: false when latest matches dismissed', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('def', 'abc', 'def'), false);
});

test('shouldShowBanner: true when latest differs from both baseline and dismissed', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('xyz', 'abc', 'def'), true);
});

test('shouldShowBanner: true when latest differs from baseline and dismissed is null', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('xyz', 'abc', null), true);
});

test('shouldShowBanner: false on empty / null latest', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('',   'abc', null), false);
  assert.strictEqual(shouldShowBanner(null, 'abc', null), false);
});

test('shouldShowBanner: false on empty / null baseline (cannot compare)', () => {
  const { shouldShowBanner } = loadVersionCheck();
  assert.strictEqual(shouldShowBanner('xyz', '',   null), false);
  assert.strictEqual(shouldShowBanner('xyz', null, null), false);
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
node --test tests/js/version_check/version_check.test.js
```

Expected: all 6 tests fail with `Error: not implemented`.

- [ ] **Step 4: Implement `shouldShowBanner`**

In `js/version_check.js`, replace the placeholder with:

```javascript
function shouldShowBanner(latestSha, baselineSha, dismissedSha) {
  if (!latestSha || !baselineSha) return false;
  if (latestSha === baselineSha)  return false;
  if (latestSha === dismissedSha) return false;
  return true;
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
node --test tests/js/version_check/version_check.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/js/version_check/ js/version_check.js
git commit -m "feat(version-check): implement shouldShowBanner"
```

---

## Task 3: `parseVersionPayload` (TDD)

**Files:**
- Modify: `tests/js/version_check/version_check.test.js`
- Modify: `js/version_check.js`

- [ ] **Step 1: Add failing tests for `parseVersionPayload`**

Append to `tests/js/version_check/version_check.test.js`:

```javascript
test('parseVersionPayload: returns { sha, builtAt } for well-formed JSON', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc","builtAt":"2026-05-07T18:42:11Z"}');
  assert.deepStrictEqual(result, { sha: 'abc', builtAt: '2026-05-07T18:42:11Z' });
});

test('parseVersionPayload: returns object with sha when builtAt missing', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc"}');
  assert.deepStrictEqual(result, { sha: 'abc', builtAt: null });
});

test('parseVersionPayload: returns null when sha missing', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('{"builtAt":"2026-05-07T18:42:11Z"}'), null);
});

test('parseVersionPayload: returns null on malformed JSON', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('not json'), null);
  assert.strictEqual(parseVersionPayload(''),         null);
});

test('parseVersionPayload: ignores unknown fields', () => {
  const { parseVersionPayload } = loadVersionCheck();
  const result = parseVersionPayload('{"sha":"abc","builtAt":"t","extra":42}');
  assert.deepStrictEqual(result, { sha: 'abc', builtAt: 't' });
});

test('parseVersionPayload: rejects non-string sha', () => {
  const { parseVersionPayload } = loadVersionCheck();
  assert.strictEqual(parseVersionPayload('{"sha":123}'), null);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/version_check/version_check.test.js
```

Expected: 6 new tests fail (existing 6 still pass).

- [ ] **Step 3: Implement `parseVersionPayload`**

In `js/version_check.js`, replace the placeholder with:

```javascript
function parseVersionPayload(text) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { return null; }
  if (!data || typeof data.sha !== 'string' || data.sha.length === 0) return null;
  const builtAt = (typeof data.builtAt === 'string') ? data.builtAt : null;
  return { sha: data.sha, builtAt: builtAt };
}
```

- [ ] **Step 4: Run tests to confirm all 12 pass**

```bash
node --test tests/js/version_check/version_check.test.js
```

Expected: 12 passing.

- [ ] **Step 5: Commit**

```bash
git add tests/js/version_check/version_check.test.js js/version_check.js
git commit -m "feat(version-check): implement parseVersionPayload"
```

---

## Task 4: Banner CSS

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Append banner styles to `css/style.css`**

Append to the end of `css/style.css`:

```css
/* ── Version banner ────────────────────────────────────────────────────────── */
.version-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
}

.version-banner[hidden] { display: none; }

.version-banner-msg {
  flex: 1;
}

.version-banner-reload {
  background: var(--amber);
  color: #1a1a1a;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  font-size: inherit;
}

.version-banner-reload:hover { background: var(--amber2); }

.version-banner-dismiss {
  background: transparent;
  color: var(--text-mid);
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.version-banner-dismiss:hover { color: var(--text); }
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "feat(version-check): add banner styles"
```

---

## Task 5: Runtime — DOM, fetch, dismiss, reload (no polling yet)

**Files:**
- Modify: `js/version_check.js`

- [ ] **Step 1: Add private state, DOM helpers, fetch, and banner render**

Inside the IIFE in `js/version_check.js`, **above** the `api` declaration, add:

```javascript
  // ── Private state ─────────────────────────────────────────────────────────
  const VERSION_URL    = 'static/version.json';
  const DISMISSED_KEY  = 'vrs_dismissed_sha';

  let baselineSha  = null;
  let dismissedSha = null;
  let bannerEl     = null;

  // ── Storage ───────────────────────────────────────────────────────────────
  function readDismissed() {
    try { return root.localStorage && root.localStorage.getItem(DISMISSED_KEY); }
    catch (e) { return null; }
  }

  function writeDismissed(sha) {
    try { root.localStorage && root.localStorage.setItem(DISMISSED_KEY, sha); }
    catch (e) { /* private mode / quota — banner still hides for the session */ }
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  async function fetchVersion() {
    const url = VERSION_URL + '?_=' + Date.now();
    let res;
    try { res = await root.fetch(url, { cache: 'no-store' }); }
    catch (e) { return null; }
    if (!res || !res.ok) return null;
    let text;
    try { text = await res.text(); }
    catch (e) { return null; }
    return parseVersionPayload(text);
  }

  // ── Banner DOM ────────────────────────────────────────────────────────────
  function ensureBanner() {
    if (bannerEl) return bannerEl;
    const doc = root.document;
    if (!doc) return null;

    const el = doc.createElement('div');
    el.id = 'version-banner';
    el.className = 'version-banner';
    el.hidden = true;

    const msg = doc.createElement('span');
    msg.className = 'version-banner-msg';
    msg.textContent = 'A new version is available.';
    el.appendChild(msg);

    const reload = doc.createElement('button');
    reload.type = 'button';
    reload.className = 'version-banner-reload';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => root.location.reload());
    el.appendChild(reload);

    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'version-banner-dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => {
      const sha = el.dataset.sha;
      if (sha) {
        dismissedSha = sha;
        writeDismissed(sha);
      }
      el.hidden = true;
    });
    el.appendChild(dismiss);

    const header = doc.querySelector('header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(el, header.nextSibling);
    } else {
      doc.body && doc.body.insertBefore(el, doc.body.firstChild);
    }
    bannerEl = el;
    return el;
  }

  function showBanner(latestSha, builtAt) {
    const el = ensureBanner();
    if (!el) return;
    el.dataset.sha = latestSha;
    el.title = builtAt ? ('Built ' + builtAt) : '';
    el.hidden = false;
  }

  // ── Bootstrap (single check, no polling yet — added in Task 6) ────────────
  async function bootstrap() {
    const initial = await fetchVersion();
    if (!initial) return; // dormant: dev server, network error, etc.
    baselineSha  = initial.sha;
    dismissedSha = readDismissed();
  }
```

- [ ] **Step 2: Replace the placeholder `init` body**

In `js/version_check.js`, replace:

```javascript
  function init() {}
```

with:

```javascript
  function init() {
    bootstrap();
  }
```

- [ ] **Step 3: Run existing tests to confirm helpers still pass**

```bash
node --test tests/js/version_check/version_check.test.js
```

Expected: 12 passing (the new code doesn't run during tests because no test calls `init`).

- [ ] **Step 4: Commit**

```bash
git add js/version_check.js
git commit -m "feat(version-check): add fetch, banner DOM, dismiss handler"
```

---

## Task 6: Polling loop with visibility gating

**Files:**
- Modify: `js/version_check.js`

- [ ] **Step 1: Add the polling functions**

In `js/version_check.js`, **above** `function bootstrap()`, add:

```javascript
  // ── Polling ───────────────────────────────────────────────────────────────
  const POLL_INTERVAL_MS = 5 * 60 * 1000;
  let pollTimerId = null;

  async function checkOnce() {
    const latest = await fetchVersion();
    if (!latest) return;
    if (shouldShowBanner(latest.sha, baselineSha, dismissedSha)) {
      showBanner(latest.sha, latest.builtAt);
    } else if (bannerEl && !bannerEl.hidden && latest.sha !== bannerEl.dataset.sha) {
      // Banner already up; a newer SHA appeared. Update the tooltip silently.
      bannerEl.dataset.sha = latest.sha;
      bannerEl.title = latest.builtAt ? ('Built ' + latest.builtAt) : '';
    }
  }

  function startPolling() {
    if (pollTimerId !== null) return;
    pollTimerId = root.setInterval(checkOnce, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimerId === null) return;
    root.clearInterval(pollTimerId);
    pollTimerId = null;
  }

  function onVisibilityChange() {
    const doc = root.document;
    if (!doc) return;
    if (doc.visibilityState === 'visible') {
      startPolling();
      checkOnce(); // immediate catch-up
    } else {
      stopPolling();
    }
  }
```

- [ ] **Step 2: Wire visibility + initial poll into `bootstrap`**

In `js/version_check.js`, replace the existing `bootstrap` body with:

```javascript
  async function bootstrap() {
    const initial = await fetchVersion();
    if (!initial) return; // dormant
    baselineSha  = initial.sha;
    dismissedSha = readDismissed();

    const doc = root.document;
    if (doc && doc.addEventListener) {
      doc.addEventListener('visibilitychange', onVisibilityChange);
    }
    if (!doc || doc.visibilityState === 'visible') {
      startPolling();
    }
  }
```

- [ ] **Step 3: Run tests to confirm helpers still pass**

```bash
node --test tests/js/version_check/version_check.test.js
```

Expected: 12 passing.

- [ ] **Step 4: Commit**

```bash
git add js/version_check.js
git commit -m "feat(version-check): poll every 5 min while tab is visible"
```

---

## Task 7: Wire into `index.html` and verify in browser

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the script tag and bootstrap call**

In `index.html`, after the existing `<script src="js/main.js"></script>` line (around line 169), add:

```html
<script src="js/version_check.js"></script>
<script>window.versionCheck && window.versionCheck.init();</script>
```

- [ ] **Step 2: Manual smoke test — dormant case (no version.json)**

```bash
python3 -m http.server 8787
```

Open <http://localhost:8787>. Open DevTools → Network. Confirm:
- A request to `static/version.json?_=…` returns **404**.
- No banner appears.
- No console errors.

- [ ] **Step 3: Manual smoke test — banner appears on SHA change**

While the dev server is running, in another terminal:

```bash
mkdir -p static
printf '{"sha":"a","builtAt":"2026-05-07T18:00:00Z"}\n' > static/version.json
```

Reload the page. Network tab should show `version.json` returning 200.

Then:

```bash
printf '{"sha":"b","builtAt":"2026-05-07T18:05:00Z"}\n' > static/version.json
```

Toggle to another tab and back (forces visibility re-poll). Banner should appear with text "A new version is available." and a tooltip "Built 2026-05-07T18:05:00Z".

- [ ] **Step 4: Manual smoke test — dismiss persistence**

Click ✕ on the banner. Banner hides. Toggle visibility again — banner stays hidden.

```bash
printf '{"sha":"c","builtAt":"2026-05-07T18:10:00Z"}\n' > static/version.json
```

Toggle visibility again. Banner reappears (third SHA, neither baseline nor dismissed).

- [ ] **Step 5: Manual smoke test — Reload button**

Click **Reload**. Page reloads. Banner does not reappear (the page now loaded `c` as its baseline).

- [ ] **Step 6: Clean up the local test file before committing**

```bash
rm static/version.json
```

(`.gitignore` will be updated in Task 9 to prevent this from ever being committed accidentally, but for now keep the working tree clean.)

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat(version-check): wire into index.html"
```

---

## Task 8: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Generate version.json
        run: |
          mkdir -p static
          printf '{"sha":"%s","builtAt":"%s"}\n' \
            "${GITHUB_SHA}" \
            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            > static/version.json
          cat static/version.json

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate YAML syntax**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/deploy-pages.yml')); print('OK')"
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: add GitHub Pages deploy workflow with version.json"
```

> **Note:** End-to-end validation requires pushing to `main` (or a feature branch with `branches: [main, the-branch]` temporarily). After this work merges, confirm on the next push that the deployed `https://<pages-url>/static/version.json` contains the merge commit's SHA.

---

## Task 9: Cleanup — `.gitignore`, `BACKLOG.md`

**Files:**
- Modify: `.gitignore`
- Modify: `BACKLOG.md`

- [ ] **Step 1: Add `static/version.json` to `.gitignore`**

Append to `.gitignore`:

```
# Generated per-deploy by .github/workflows/deploy-pages.yml; never commit a local copy
static/version.json
```

- [ ] **Step 2: Strike the App Shell bullet in `BACKLOG.md`**

In `BACKLOG.md`, find the line:

```markdown
- **New-release detection + reload nudge** — poll a deployed `version.json` (or hash an asset) and show a non-blocking banner offering to reload when a new build ships, so users on long-lived tabs don't keep running stale code.
```

Delete it. (Per project style — see `06ee746 Updated backlog` — completed items are removed, not struck through.)

- [ ] **Step 3: Run the full JS test suite one more time**

```bash
node --test tests/js/
```

Expected: every previously-passing test still passes plus the 12 new ones from `version_check`.

- [ ] **Step 4: Commit**

```bash
git add .gitignore BACKLOG.md
git commit -m "chore: ignore generated version.json; close backlog item"
```

---

## Definition of Done

- All 12 unit tests in `tests/js/version_check/version_check.test.js` pass.
- `node --test tests/js/` is green (no regressions in existing suites).
- Manual smoke test from Task 7 passes end-to-end on a local `python3 -m http.server`.
- `.github/workflows/deploy-pages.yml` is valid YAML; the next push to `main` produces a Pages deploy whose `static/version.json` contains the deploy's commit SHA.
- `BACKLOG.md` no longer lists the App Shell item.
- `static/version.json` is gitignored.
