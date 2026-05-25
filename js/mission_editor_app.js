'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  // Attach the editor mode's DOM lifecycle to an app instance. Idempotent.
  function attach(app, doc) {
    const TOOLBAR_IDS = ['editor-toolbar', 'editor-right-panel'];
    const OVERLAY_ID  = 'editor-canvas-overlay';
    const TITLE_ID    = 'editor-title-input';
    const EXIT_ID     = 'btn-editor-exit';

    function showEditorChrome(on) {
      for (const id of TOOLBAR_IDS) {
        const el = doc.getElementById(id);
        if (el) el.hidden = !on;
      }
      const overlay = doc.getElementById(OVERLAY_ID);
      if (overlay) overlay.hidden = !on;
      if (doc.body) {
        if (on) doc.body.dataset.mode = 'editor';
        else delete doc.body.dataset.mode;
      }
    }

    function syncTitleInputFromState(state) {
      const input = doc.getElementById(TITLE_ID);
      if (input && state) input.value = state.title;
    }

    // Initial: chrome hidden.
    showEditorChrome(false);

    // Title-input → state.
    const titleInput = doc.getElementById(TITLE_ID);
    if (titleInput) {
      titleInput.addEventListener('input', (e) => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const next = MISSIONS.editor.state._clone(app.editorState);
        next.title = (e.target && e.target.value) || '';
        next.dirty = true;
        app.setEditorState(next);
      });
    }

    // Exit button → app.exitEditor.
    const exitBtn = doc.getElementById(EXIT_ID);
    if (exitBtn) exitBtn.addEventListener('click', () => app.exitEditor());

    // Subscribe to mode changes.
    app.onChange(({ mode, editorState }) => {
      const isEditor = (mode === 'editor');
      showEditorChrome(isEditor);
      if (isEditor) syncTitleInputFromState(editorState);
    });
  }

  editor.app = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
