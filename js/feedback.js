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
    throw new Error('not implemented');
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
