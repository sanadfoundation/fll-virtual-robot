'use strict';

(function (root) {
  // Pure helpers (filled in by Tasks 2 and 3).
  function shouldShowBanner(latestSha, baselineSha, dismissedSha) {
    if (!latestSha || !baselineSha) return false;
    if (latestSha === baselineSha)  return false;
    if (latestSha === dismissedSha) return false;
    return true;
  }
  function parseVersionPayload(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { return null; }
    if (!data || typeof data.sha !== 'string' || data.sha.length === 0) return null;
    const builtAt = (typeof data.builtAt === 'string') ? data.builtAt : null;
    return { sha: data.sha, builtAt: builtAt };
  }

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

  // Runtime entry point (Task 6 will start polling from here).
  function init() {
    bootstrap();
  }

  const api = { shouldShowBanner, parseVersionPayload, init };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.versionCheck = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
