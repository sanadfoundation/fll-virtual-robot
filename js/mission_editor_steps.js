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

    const rowById = new Map();  // step.id -> <li> element

    function clearList() {
      if (!list) return;
      while (list.children.length) list.removeChild(list.children[0]);
      rowById.clear();
    }

    function render(state) {
      if (!list) return;
      if (!state || state.steps.length === 0) {
        clearList();
        return;
      }

      // Build the new ordered list of <li> rows. Reuse existing rows when
      // their step id is unchanged — only update selection class. Create new
      // rows only for new steps. Skipping the recreate preserves input focus
      // while the user is typing into title/points/hint fields.
      const newOrder = [];
      const seenIds = new Set();
      for (const step of state.steps) {
        seenIds.add(step.id);
        let row = rowById.get(step.id);
        if (!row) {
          row = renderRow(step, state.selection);
          rowById.set(step.id, row);
        } else {
          const isSelected = state.selection
            && state.selection.kind === 'step'
            && state.selection.id === step.id;
          if (isSelected) row.classList.add('selected');
          else row.classList.remove('selected');
        }
        newOrder.push(row);
      }

      // Drop rows for steps that no longer exist.
      for (const id of Array.from(rowById.keys())) {
        if (!seenIds.has(id)) {
          const row = rowById.get(id);
          if (row && row.parentNode === list) list.removeChild(row);
          rowById.delete(id);
        }
      }

      // Ensure list children match newOrder. Use insertBefore to reposition
      // without destroying nodes.
      for (let i = 0; i < newOrder.length; i++) {
        const target = newOrder[i];
        if (list.children[i] !== target) {
          list.insertBefore(target, list.children[i] || null);
        }
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
      title.setAttribute('placeholder', 'Step title (e.g. Drive to red zone)');
      title.setAttribute('title', 'Title — shown to the player in the Mission Map panel');
      title.setAttribute('aria-label', 'Step title');
      title.value = step.title;
      title.addEventListener('input', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { title: e.target.value }));
      });

      const points = doc.createElement('input');
      points.classList.add('step-points-input');
      points.setAttribute('type', 'number');
      points.setAttribute('placeholder', 'pts');
      points.setAttribute('title', 'Points awarded when this step completes');
      points.setAttribute('aria-label', 'Step points');
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
      hint.setAttribute('placeholder', 'Optional hint shown to the player');
      hint.setAttribute('title', 'Hint — appears in the Mission Map when this step is active');
      hint.setAttribute('aria-label', 'Step hint');
      hint.value = step.hint || '';
      hint.addEventListener('input', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        app.setEditorState(MISSIONS.editor.state.editStep(
          app.editorState, step.id, { hint: e.target.value }));
      });

      const up = doc.createElement('button');
      up.classList.add('step-up-btn');
      up.setAttribute('type', 'button');
      up.setAttribute('title', 'Move step up');
      up.setAttribute('aria-label', 'Move step up');
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
      down.setAttribute('title', 'Move step down');
      down.setAttribute('aria-label', 'Move step down');
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
      reqBtn.setAttribute('title', 'Set step dependencies (must complete first)');
      reqBtn.setAttribute('aria-label', 'Step dependencies');
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

      const editBtn = doc.createElement('button');
      editBtn.classList.add('step-edit-btn');
      editBtn.setAttribute('type', 'button');
      editBtn.setAttribute('title', 'Edit this step\'s completion condition');
      editBtn.setAttribute('aria-label', 'Edit step condition');
      editBtn.textContent = '✎';
      editBtn.addEventListener('click', (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        e._handled = true;
        app.setEditorState(MISSIONS.editor.state.setSelection(
          app.editorState, { kind: 'step', id: step.id }));
      });

      const del = doc.createElement('button');
      del.classList.add('step-delete-btn');
      del.setAttribute('type', 'button');
      del.setAttribute('title', 'Delete this step');
      del.setAttribute('aria-label', 'Delete step');
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
      row.appendChild(editBtn);
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
