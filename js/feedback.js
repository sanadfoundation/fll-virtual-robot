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
  // formBaseUrl MUST already contain a query string (e.g. "...?embedded=true")
  // — Google Forms' embed URL always does. We append additional params with
  // "&" separators on that assumption. A bare URL with no "?" would produce
  // a malformed result.
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

  let modalEl       = null;
  let escHandler    = null;

  // ── Modal lifecycle (filled in by Task 5) ─────────────────────────────────
  function buildModalDom() {
    const doc = root.document;
    if (!doc) return null;

    const backdrop = doc.createElement('div');
    backdrop.className = 'feedback-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'feedback-modal-title');
    backdrop.hidden = true;

    const modal = doc.createElement('div');
    modal.className = 'feedback-modal';

    const header = doc.createElement('div');
    header.className = 'feedback-modal-header';

    const title = doc.createElement('h2');
    title.id = 'feedback-modal-title';
    title.textContent = 'Send Feedback';
    header.appendChild(title);

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'feedback-modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', close);
    header.appendChild(closeBtn);

    const iframe = doc.createElement('iframe');
    iframe.className = 'feedback-modal-iframe';
    iframe.title = 'Send Feedback form';

    modal.appendChild(header);
    modal.appendChild(iframe);
    backdrop.appendChild(modal);

    // Backdrop click closes; clicks inside the modal must not bubble.
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });

    doc.body.appendChild(backdrop);
    return { backdrop, iframe, closeBtn };
  }

  function open() {
    const doc = root.document;
    if (!doc) return;
    if (!modalEl) modalEl = buildModalDom();
    if (!modalEl) return;

    const url = buildPrefilledUrl(FORM_BASE_URL, ENTRY_IDS, collectMetadata());
    if (!url) return; // form not configured — refuse to open

    modalEl.iframe.src = url;
    modalEl.backdrop.hidden = false;
    doc.body.classList.add('feedback-modal-open');

    escHandler = (e) => {
      if (e.key === 'Escape') close();
    };
    doc.addEventListener('keydown', escHandler);

    // Move focus to the close button so ESC/keyboard users can dismiss
    // without first tabbing into the cross-origin iframe.
    try { modalEl.closeBtn.focus(); } catch (e) { /* focus may fail in some envs */ }
  }

  function close() {
    const doc = root.document;
    if (!doc || !modalEl) return;
    modalEl.backdrop.hidden = true;
    modalEl.iframe.src = 'about:blank'; // stop the form from holding network/UI state
    doc.body.classList.remove('feedback-modal-open');
    if (escHandler) {
      doc.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  }

  // ── Bootstrap (filled in by Task 5) ───────────────────────────────────────
  function init() {
    const doc = root.document;
    if (!doc) return;
    const btn = doc.getElementById('btn-feedback');
    if (!btn) return;
    if (!FORM_BASE_URL) {
      // Feature dormant until the maintainer fills in the constants.
      btn.hidden = true;
      return;
    }
    btn.addEventListener('click', open);
  }

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
