'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const desc = doc.getElementById('editor-meta-desc');
    const type = doc.getElementById('editor-meta-type');
    const diff = doc.getElementById('editor-meta-difficulty');

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

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) return;
      if (desc) desc.value = editorState.description || '';
      if (type) type.value = editorState.type;
      if (diff) diff.value = editorState.difficulty_tier;
    });
  }

  editor.meta = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
