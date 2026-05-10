'use strict';

(function (root) {
  // ── Configuration (paste values here after Google Form setup) ─────────────
  // Until FORM_BASE_URL is non-empty, init() hides the Feedback button so the
  // feature is dormant in production. See docs/superpowers/specs/2026-05-10-feedback-design.md
  // section "Operational setup" for how to obtain these values.
  const FORM_BASE_URL = '';
  const ENTRY_IDS = {
    sha:       '',
    mode:      '',
    userAgent: '',
  };

  // ── Pure helper (filled in by Task 2) ─────────────────────────────────────
  function buildPrefilledUrl(formBaseUrl, entryIds, metadata) {
    if (!formBaseUrl) return '';
    const ids  = entryIds || {};
    const meta = metadata || {};
    const params = [];
    function maybeAdd(idKey, valueKey) {
      const id    = ids[idKey];
      const value = meta[valueKey];
      if (!id || !value) return;
      // encodeURIComponent is standard; Google Forms accepts it
      params.push(id + '=' + encodeURIComponent(value));
    }
    maybeAdd('sha',       'sha');
    maybeAdd('mode',      'mode');
    maybeAdd('userAgent', 'userAgent');
    if (params.length === 0) return formBaseUrl;
    return formBaseUrl + '&' + params.join('&');
  }

  // ── DOM-reading helper (filled in by Task 4) ──────────────────────────────
  function collectMetadata() {
    let sha = '';
    try {
      if (root.versionCheck && typeof root.versionCheck.getBaselineSha === 'function') {
        sha = root.versionCheck.getBaselineSha() || '';
      }
    } catch (e) { /* versionCheck dormant — sha stays empty */ }

    let mode = '';
    try {
      const doc      = root.document;
      const blocksEl = doc && doc.getElementById('tab-blocks');
      const pythonEl = doc && doc.getElementById('tab-python');
      if (blocksEl && blocksEl.classList.contains('active')) mode = 'blocks';
      else if (pythonEl && pythonEl.classList.contains('active')) mode = 'python';
    } catch (e) { /* DOM unavailable — mode stays empty */ }

    let userAgent = '';
    try {
      if (root.navigator && typeof root.navigator.userAgent === 'string') {
        userAgent = root.navigator.userAgent;
      }
    } catch (e) { /* navigator unavailable — userAgent stays empty */ }

    return { sha, mode, userAgent };
  }

  // ── Modal lifecycle (filled in by Task 5) ─────────────────────────────────
  function open()  {}
  function close() {}

  // ── Bootstrap (filled in by Task 5) ───────────────────────────────────────
  function init() {}

  const api = {
    init,
    open,
    close,
    buildPrefilledUrl,
    collectMetadata,
    _FORM_BASE_URL: FORM_BASE_URL,
    _ENTRY_IDS:     ENTRY_IDS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.feedback = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
