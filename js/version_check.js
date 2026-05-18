'use strict';

(function (root) {
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

  // Collect same-origin static asset URLs from the live DOM and Performance
  // Resource Timing buffer. Used by hardReload() to refresh the HTTP cache
  // before reloading, so the new page version doesn't pick up stale cached
  // JS/CSS/images.
  function collectSameOriginAssetUrls(doc, perf, baseHref) {
    const urls = new Set();
    let base;
    try { base = new URL(baseHref); }
    catch (e) { return urls; }
    const addSameOrigin = (raw) => {
      if (!raw) return;
      let abs;
      try { abs = new URL(raw, base); }
      catch (e) { return; }
      if (abs.origin !== base.origin) return;
      urls.add(abs.href);
    };
    if (doc && typeof doc.querySelectorAll === 'function') {
      const tags = [
        ['link[rel="stylesheet"][href]', 'href'],
        ['script[src]',                  'src'],
        ['img[src]',                     'src'],
      ];
      for (const [selector, attr] of tags) {
        const nodes = doc.querySelectorAll(selector) || [];
        for (const el of nodes) addSameOrigin(el.getAttribute(attr));
      }
    }
    if (perf && typeof perf.getEntriesByType === 'function') {
      let entries = [];
      try { entries = perf.getEntriesByType('resource') || []; }
      catch (e) { entries = []; }
      for (const e of entries) {
        if (e && typeof e.name === 'string') addSameOrigin(e.name);
      }
    }
    return urls;
  }

  // Reload that bypasses the HTTP cache for same-origin static assets.
  // `cache: 'reload'` forces a network fetch and updates the HTTP cache, so
  // the subsequent location.reload() uses the freshened entries.
  async function hardReload() {
    const tasks = [];
    const fetchFn = root.fetch;
    if (typeof fetchFn === 'function') {
      const baseHref = root.location && root.location.href;
      const urls = collectSameOriginAssetUrls(root.document, root.performance, baseHref);
      for (const u of urls) {
        tasks.push(fetchFn(u, { cache: 'reload' }).catch(() => {}));
      }
    }
    if (root.caches && typeof root.caches.keys === 'function') {
      tasks.push(
        root.caches.keys()
          .then(keys => Promise.all(keys.map(k => root.caches.delete(k).catch(() => {}))))
          .catch(() => {})
      );
    }
    try { await Promise.all(tasks); }
    catch (e) { /* swallow: reload regardless */ }
    if (root.location && typeof root.location.reload === 'function') {
      root.location.reload();
    }
  }

  // ── Private state ─────────────────────────────────────────────────────────
  const VERSION_URL    = 'static/version.json';
  const DISMISSED_KEY  = 'vrs_dismissed_sha';

  let baselineSha  = null;
  let dismissedSha = null;
  let bannerEl     = null;

  function getBaselineSha() {
    return baselineSha;
  }

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
    el.setAttribute('role', 'status');
    el.hidden = true;

    const msg = doc.createElement('span');
    msg.className = 'version-banner-msg';
    msg.textContent = 'A new version is available.';
    el.appendChild(msg);

    const reload = doc.createElement('button');
    reload.type = 'button';
    reload.className = 'version-banner-reload';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => {
      reload.disabled = true;
      reload.textContent = 'Reloading…';
      hardReload();
    });
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

  // ── Bootstrap ─────────────────────────────────────────────────────────────
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

  function init() {
    bootstrap();
  }

  const api = {
    shouldShowBanner,
    parseVersionPayload,
    init,
    getBaselineSha,
    collectSameOriginAssetUrls,
    hardReload,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.versionCheck = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
