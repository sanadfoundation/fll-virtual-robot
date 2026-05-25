'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const list   = doc.getElementById('editor-steps-list');
    const addBtn = doc.getElementById('btn-add-step');

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (app.mode !== 'editor' || !app.editorState) return;
        app.setEditorState(MISSIONS.editor.state.addStep(app.editorState));
      });
    }

    function clearList() {
      if (!list) return;
      while (list.children.length) list.removeChild(list.children[0]);
    }

    function render(state) {
      if (!list) return;
      clearList();
      if (!state) return;
      for (const step of state.steps) {
        list.appendChild(renderRow(step));
      }
    }

    function renderRow(step) {
      const row = doc.createElement('li');
      row.classList.add('editor-step-row');
      row.setAttribute('data-id', step.id);

      const title = doc.createElement('input');
      title.classList.add('step-title-input');
      title.setAttribute('type', 'text');
      title.value = step.title;
      title.addEventListener('input', (e) => {
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { title: e.target.value }));
      });

      const points = doc.createElement('input');
      points.classList.add('step-points-input');
      points.setAttribute('type', 'number');
      points.value = String(step.points);
      points.addEventListener('input', (e) => {
        const n = parseInt(e.target.value, 10);
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { points: Number.isNaN(n) ? 0 : n }));
      });

      const hint = doc.createElement('input');
      hint.classList.add('step-hint-input');
      hint.setAttribute('type', 'text');
      hint.value = step.hint || '';
      hint.addEventListener('input', (e) => {
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { hint: e.target.value }));
      });

      const del = doc.createElement('button');
      del.classList.add('step-delete-btn');
      del.setAttribute('type', 'button');
      del.textContent = '🗑';
      del.addEventListener('click', () => {
        app.setEditorState(MISSIONS.editor.state.deleteStep(app.editorState, step.id));
      });

      row.appendChild(title);
      row.appendChild(points);
      row.appendChild(hint);
      row.appendChild(del);
      return row;
    }

    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') render(editorState);
      else clearList();
    });
  }

  editor.steps = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
