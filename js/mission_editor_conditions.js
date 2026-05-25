'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const section = doc.getElementById('editor-cond-section');
    const container = doc.getElementById('editor-cond-workspace');
    const Blockly = global.Blockly;
    let workspace = null;
    let suppressNextChange = false;

    function ensureWorkspace() {
      if (workspace || !Blockly || !container) return workspace;
      workspace = Blockly.inject(container, { toolbox: null, readOnly: false });
      workspace.addChangeListener(() => {
        if (suppressNextChange) { suppressNextChange = false; return; }
        syncToState();
      });
      return workspace;
    }

    function syncToState() {
      // Implemented in Task 19 (generator-to-condition wiring).
    }

    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      ensureWorkspace();
      // Load blocks for the step's current condition (Task 20).
    }

    function hide() {
      if (section) section.hidden = true;
    }

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) { hide(); return; }
      const sel = editorState.selection;
      if (sel && sel.kind === 'step') {
        const step = editorState.steps.find(s => s.id === sel.id);
        if (step) showForStep(step);
        else hide();
      } else {
        hide();
      }
    });
  }

  editor.conditions = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
