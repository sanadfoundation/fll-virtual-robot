'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const desc = doc.getElementById('editor-meta-desc');
    const type = doc.getElementById('editor-meta-type');
    const diff = doc.getElementById('editor-meta-difficulty');
    const tl         = doc.getElementById('editor-meta-time-limit');

    function bind(el, eventName, key) {
      if (!el) return;
      el.addEventListener(eventName, (e) => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const val = (e.target && e.target.value) || '';
        const next = MISSIONS.editor.state.setMeta(app.editorState, { [key]: val });
        app.setEditorState(next);
      });
    }

    bind(desc, 'input',  'description');
    bind(type, 'change', 'type');
    bind(diff, 'change', 'difficulty_tier');

    // Time limit is a number (or empty for no limit). Parse before pushing
    // to setMeta so state stores a number (or undefined), matching the
    // schema's expectation.
    if (tl) {
      tl.addEventListener('input', (e) => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const raw = (e.target && e.target.value) || '';
        const n = raw === '' ? null : parseInt(raw, 10);
        const next = MISSIONS.editor.state.setMeta(app.editorState,
          { time_limit_s: (n == null || Number.isNaN(n) || n <= 0) ? null : n });
        app.setEditorState(next);
      });
    }

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) return;
      if (desc) desc.value = editorState.description || '';
      if (type) type.value = editorState.type;
      if (diff) diff.value = editorState.difficulty_tier;
      if (tl) {
        const v = editorState.scoring && editorState.scoring.time_limit_s;
        tl.value = (typeof v === 'number' && v > 0) ? String(v) : '';
      }
    });
  }

  editor.meta = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
