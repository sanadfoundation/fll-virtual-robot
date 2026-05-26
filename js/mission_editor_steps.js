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
        if (e.stopPropagation) e.stopPropagation();
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { title: e.target.value }));
      });

      const points = doc.createElement('input');
      points.classList.add('step-points-input');
      points.setAttribute('type', 'number');
      points.value = String(step.points);
      points.addEventListener('input', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        const n = parseInt(e.target.value, 10);
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { points: Number.isNaN(n) ? 0 : n }));
      });

      const hint = doc.createElement('input');
      hint.classList.add('step-hint-input');
      hint.setAttribute('type', 'text');
      hint.value = step.hint || '';
      hint.addEventListener('input', (e) => {
        if (e.stopPropagation) e.stopPropagation();
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

      const reqBtn = doc.createElement('button');
      reqBtn.classList.add('step-requires-btn');
      reqBtn.setAttribute('type', 'button');
      reqBtn.textContent = '⛓';
      let panel = null;
      reqBtn.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        if (panel) { row.removeChild(panel); panel = null; return; }
        panel = doc.createElement('div');
        panel.classList.add('step-requires-panel');
        const others = app.editorState.steps.filter(s => s.id !== step.id);
        if (others.length === 0) {
          const empty = doc.createElement('div');
          empty.textContent = 'No other steps yet.';
          empty.classList.add('step-requires-empty');
          panel.appendChild(empty);
        } else {
          const currentRequires = new Set(step.requires || []);
          for (const other of others) {
            const label = doc.createElement('label');
            label.classList.add('step-requires-item');
            const cb = doc.createElement('input');
            cb.setAttribute('type', 'checkbox');
            if (currentRequires.has(other.id)) cb.setAttribute('checked', 'true');
            cb.addEventListener('change', (ev) => {
              const checked = ev.target && ev.target.checked;
              const cur = new Set(app.editorState.steps.find(s => s.id === step.id).requires || []);
              if (checked) cur.add(other.id); else cur.delete(other.id);
              app.setEditorState(MISSIONS.editor.state.editStep(
                app.editorState, step.id, { requires: Array.from(cur) }));
            });
            label.appendChild(cb);
            const span = doc.createElement('span');
            span.textContent = other.title || other.id;
            label.appendChild(span);
            panel.appendChild(label);
          }
        }
        row.appendChild(panel);
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
        const tag = (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase()) || (ev.target && ev.target.tag) || '';
        if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'select') return;
        app.setEditorState(MISSIONS.editor.state.setSelection(
          app.editorState, { kind: 'step', id: step.id }));
      });

      row.appendChild(title);
      row.appendChild(points);
      row.appendChild(hint);
      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(reqBtn);
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
