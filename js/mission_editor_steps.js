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
      const selection = state.selection;
      for (const step of state.steps) {
        list.appendChild(renderRow(step, selection));
      }
    }

    function renderRow(step, selection) {
      const row = doc.createElement('li');
      row.classList.add('editor-step-row');
      row.setAttribute('data-id', step.id);

      if (selection && selection.kind === 'step' && selection.id === step.id) {
        row.classList.add('selected');
      }

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

      const up = doc.createElement('button');
      up.classList.add('step-up-btn');
      up.setAttribute('type', 'button');
      up.textContent = '↑';
      up.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        const i = app.editorState.steps.findIndex(s => s.id === step.id);
        if (i > 0) app.setEditorState(MISSIONS.editor.state.reorderStep(app.editorState, step.id, i - 1));
      });

      const down = doc.createElement('button');
      down.classList.add('step-down-btn');
      down.setAttribute('type', 'button');
      down.textContent = '↓';
      down.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        const i = app.editorState.steps.findIndex(s => s.id === step.id);
        if (i < app.editorState.steps.length - 1) {
          app.setEditorState(MISSIONS.editor.state.reorderStep(app.editorState, step.id, i + 1));
        }
      });

      const del = doc.createElement('button');
      del.classList.add('step-delete-btn');
      del.setAttribute('type', 'button');
      del.textContent = '🗑';
      del.addEventListener('click', () => {
        app.setEditorState(MISSIONS.editor.state.deleteStep(app.editorState, step.id));
      });

      row.addEventListener('click', (ev) => {
        if (ev._handled) return;
        if (ev.target && (ev.target.tag === 'input' || ev.target.tag === 'button')) return;
        app.setEditorState(MISSIONS.editor.state.setSelection(
          app.editorState, { kind: 'step', id: step.id }));
      });

      row.appendChild(title);
      row.appendChild(points);
      row.appendChild(hint);
      row.appendChild(up);
      row.appendChild(down);
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
