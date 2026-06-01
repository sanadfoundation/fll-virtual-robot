'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  const ZONE_COLORS     = ['red', 'green', 'blue', 'yellow', 'orange', 'purple'];
  const OBSTACLE_COLORS = ['purple', 'red', 'green', 'blue', 'yellow', 'orange', 'cyan', 'black'];
  const WALL_COLORS     = ['grey', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'cyan'];
  const LINE_COLORS = ['black', 'red', 'green', 'blue', 'yellow', 'orange'];

  function attach(app, doc) {
    const section = doc.getElementById('editor-inspector-section');
    const body    = doc.getElementById('editor-inspector-body');
    if (!section || !body) return;

    function clearBody() {
      while (body.children.length) body.removeChild(body.children[0]);
    }

    function makeField(labelText, inputEl) {
      const row = doc.createElement('label');
      row.classList.add('editor-field');
      const span = doc.createElement('span');
      span.textContent = labelText;
      row.appendChild(span);
      row.appendChild(inputEl);
      if (inputEl.setAttribute) inputEl.setAttribute('data-field', labelText);
      return row;
    }

    function renderObstacleInspector(o) {
      const wrap = doc.createElement('div');

      const idLine = doc.createElement('div');
      idLine.classList.add('inspector-id');
      idLine.textContent = `ID: ${o.id}`;
      wrap.appendChild(idLine);

      const labelInput = doc.createElement('input');
      labelInput.setAttribute('type', 'text');
      labelInput.setAttribute('placeholder', 'e.g. Barrel');
      labelInput.value = o.label || '';
      labelInput.addEventListener('input', (e) => {
        app.setEditorState(
          MISSIONS.editor.state.setObstacleLabel(app.editorState, o.id, e.target.value)
        );
      });
      wrap.appendChild(makeField('Label (shown on obstacle)', labelInput));

      const colorRow = doc.createElement('div');
      colorRow.classList.add('inspector-color-row');
      for (const c of OBSTACLE_COLORS) {
        const sw = doc.createElement('button');
        sw.setAttribute('type', 'button');
        sw.classList.add('inspector-color-swatch');
        sw.setAttribute('data-color', c);
        if ((o.color || 'purple') === c) sw.classList.add('active');
        sw.addEventListener('click', () => {
          app.setEditorState(
            MISSIONS.editor.state.setObstacleColor(app.editorState, o.id, c)
          );
        });
        colorRow.appendChild(sw);
      }
      wrap.appendChild(makeField('Color', colorRow));

      const wInput = doc.createElement('input');
      wInput.setAttribute('type', 'number');
      wInput.value = String(o.w);
      wInput.addEventListener('input', (e) => {
        const v = Math.max(20, parseInt(e.target.value, 10) || 20);
        app.setEditorState(
          MISSIONS.editor.state.resizeObstacle(app.editorState, o.id, { w: v, h: o.h })
        );
      });

      const hInput = doc.createElement('input');
      hInput.setAttribute('type', 'number');
      hInput.value = String(o.h);
      hInput.addEventListener('input', (e) => {
        const v = Math.max(20, parseInt(e.target.value, 10) || 20);
        app.setEditorState(
          MISSIONS.editor.state.resizeObstacle(app.editorState, o.id, { w: o.w, h: v })
        );
      });

      wrap.appendChild(makeField('Width (mm)', wInput));
      wrap.appendChild(makeField('Height (mm)', hInput));
      return wrap;
    }

    function renderZoneInspector(z) {
      const wrap = doc.createElement('div');

      const idLine = doc.createElement('div');
      idLine.classList.add('inspector-id');
      idLine.textContent = `ID: ${z.id}`;
      wrap.appendChild(idLine);

      const labelInput = doc.createElement('input');
      labelInput.setAttribute('type', 'text');
      labelInput.value = z.label || '';
      labelInput.setAttribute('placeholder', 'e.g. Goal A');
      labelInput.addEventListener('input', (e) => {
        app.setEditorState(
          MISSIONS.editor.state.setZoneLabel(app.editorState, z.id, e.target.value)
        );
      });
      wrap.appendChild(makeField('Label (optional)', labelInput));

      const colorRow = doc.createElement('div');
      colorRow.classList.add('inspector-color-row');
      for (const c of ZONE_COLORS) {
        const sw = doc.createElement('button');
        sw.setAttribute('type', 'button');
        sw.classList.add('inspector-color-swatch');
        sw.setAttribute('data-color', c);
        if (z.color === c) sw.classList.add('active');
        sw.addEventListener('click', () => {
          app.setEditorState(
            MISSIONS.editor.state.setZoneColor(app.editorState, z.id, c)
          );
        });
        colorRow.appendChild(sw);
      }
      wrap.appendChild(makeField('Color', colorRow));

      const wInput = doc.createElement('input');
      wInput.setAttribute('type', 'number');
      wInput.value = String(z.w);
      wInput.addEventListener('input', (e) => {
        const v = Math.max(20, parseInt(e.target.value, 10) || 20);
        app.setEditorState(
          MISSIONS.editor.state.resizeZone(app.editorState, z.id, { w: v, h: z.h })
        );
      });

      const hInput = doc.createElement('input');
      hInput.setAttribute('type', 'number');
      hInput.value = String(z.h);
      hInput.addEventListener('input', (e) => {
        const v = Math.max(20, parseInt(e.target.value, 10) || 20);
        app.setEditorState(
          MISSIONS.editor.state.resizeZone(app.editorState, z.id, { w: z.w, h: v })
        );
      });

      wrap.appendChild(makeField('Width (mm)', wInput));
      wrap.appendChild(makeField('Height (mm)', hInput));
      return wrap;
    }

    function renderLineInspector(l) {
      const wrap = doc.createElement('div');

      const idLine = doc.createElement('div');
      idLine.classList.add('inspector-id');
      idLine.textContent = `ID: ${l.id}`;
      wrap.appendChild(idLine);

      const colorRow = doc.createElement('div');
      colorRow.classList.add('inspector-color-row');
      for (const c of LINE_COLORS) {
        const sw = doc.createElement('button');
        sw.setAttribute('type', 'button');
        sw.classList.add('inspector-color-swatch');
        sw.setAttribute('data-color', c);
        if (l.color === c) sw.classList.add('active');
        sw.addEventListener('click', () => {
          app.setEditorState(
            MISSIONS.editor.state.setLineProps(app.editorState, l.id, { color: c })
          );
        });
        colorRow.appendChild(sw);
      }
      wrap.appendChild(makeField('Color', colorRow));

      const tInput = doc.createElement('input');
      tInput.setAttribute('type', 'number');
      tInput.setAttribute('min', '1');
      tInput.setAttribute('max', '20');
      tInput.value = String(l.thickness || 4);
      tInput.addEventListener('input', (e) => {
        const parsed = parseInt(e.target.value, 10);
        const v = Math.max(1, Math.min(20, Number.isNaN(parsed) ? 4 : parsed));
        app.setEditorState(
          MISSIONS.editor.state.setLineProps(app.editorState, l.id, { thickness: v })
        );
      });
      wrap.appendChild(makeField('Thickness (mm)', tInput));
      return wrap;
    }

    function renderWallInspector(w) {
      const wrap = doc.createElement('div');

      const idLine = doc.createElement('div');
      idLine.classList.add('inspector-id');
      idLine.textContent = `ID: ${w.id}`;
      wrap.appendChild(idLine);

      const colorRow = doc.createElement('div');
      colorRow.classList.add('inspector-color-row');
      for (const c of WALL_COLORS) {
        const sw = doc.createElement('button');
        sw.setAttribute('type', 'button');
        sw.classList.add('inspector-color-swatch');
        sw.setAttribute('data-color', c);
        if ((w.color || 'grey') === c) sw.classList.add('active');
        sw.addEventListener('click', () => {
          app.setEditorState(
            MISSIONS.editor.state.setWallColor(app.editorState, w.id, c)
          );
        });
        colorRow.appendChild(sw);
      }
      wrap.appendChild(makeField('Color', colorRow));

      const wInput = doc.createElement('input');
      wInput.setAttribute('type', 'number');
      wInput.value = String(w.w);
      wInput.addEventListener('input', (e) => {
        const v = Math.max(20, parseInt(e.target.value, 10) || 20);
        app.setEditorState(
          MISSIONS.editor.state.resizeWall(app.editorState, w.id, { w: v, h: w.h })
        );
      });

      const hInput = doc.createElement('input');
      hInput.setAttribute('type', 'number');
      hInput.value = String(w.h);
      hInput.addEventListener('input', (e) => {
        const v = Math.max(20, parseInt(e.target.value, 10) || 20);
        app.setEditorState(
          MISSIONS.editor.state.resizeWall(app.editorState, w.id, { w: w.w, h: v })
        );
      });

      wrap.appendChild(makeField('Width (mm)', wInput));
      wrap.appendChild(makeField('Height (mm)', hInput));
      return wrap;
    }

    function renderStartInspector(start) {
      const wrap = doc.createElement('div');

      const hInput = doc.createElement('input');
      hInput.setAttribute('type', 'number');
      hInput.setAttribute('min', '0');
      hInput.setAttribute('max', '359');
      hInput.value = String(start.heading);
      hInput.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        if (Number.isNaN(v)) return;
        app.setEditorState(
          MISSIONS.editor.state.setRobotStart(app.editorState,
            { x: start.x, y: start.y, heading: v })
        );
      });
      wrap.appendChild(makeField('Heading (0=east, 90=north)', hInput));
      return wrap;
    }

    function render(state) {
      // Preserve focus across rebuilds so inputs don't lose focus mid-edit.
      const prevActive = (typeof document !== 'undefined') ? document.activeElement : null;
      const prevInBody = prevActive && prevActive.tagName === 'INPUT' && body.contains(prevActive);
      const prevPlaceholder = prevInBody ? prevActive.placeholder : null;
      const prevDataField = prevInBody
        ? (prevActive.getAttribute ? prevActive.getAttribute('data-field') : null)
        : null;

      clearBody();
      if (!state || !state.selection) { section.hidden = true; return; }
      const sel = state.selection;

      if (sel.kind === 'obstacle') {
        const o = state.field.obstacles.find(x => x.id === sel.id);
        if (!o) { section.hidden = true; return; }
        section.hidden = false;
        body.appendChild(renderObstacleInspector(o));
      } else if (sel.kind === 'zone') {
        const z = state.field.zones.find(x => x.id === sel.id);
        if (!z) { section.hidden = true; return; }
        section.hidden = false;
        body.appendChild(renderZoneInspector(z));
      } else if (sel.kind === 'start') {
        section.hidden = false;
        body.appendChild(renderStartInspector(state.field.robot_start));
      } else if (sel.kind === 'line') {
        const l = (state.field.lines || []).find(x => x.id === sel.id);
        if (!l) { section.hidden = true; return; }
        section.hidden = false;
        body.appendChild(renderLineInspector(l));
      } else if (sel.kind === 'wall') {
        const w = (state.field.walls || []).find(x => x.id === sel.id);
        if (!w) { section.hidden = true; return; }
        section.hidden = false;
        body.appendChild(renderWallInspector(w));
      } else {
        section.hidden = true;
      }

      // Re-focus: match by placeholder (text inputs) or data-field label (number inputs).
      if ((prevPlaceholder || prevDataField) && body.querySelectorAll) {
        const inputs = body.querySelectorAll('input');
        for (var i = 0; i < inputs.length; i++) {
          const matchPlaceholder = prevPlaceholder && inputs[i].placeholder === prevPlaceholder;
          const matchDataField = prevDataField && (inputs[i].getAttribute
            ? inputs[i].getAttribute('data-field') === prevDataField : false);
          if (matchPlaceholder || matchDataField) {
            inputs[i].focus && inputs[i].focus();
            break;
          }
        }
      }
    }

    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') render(editorState);
      else { section.hidden = true; clearBody(); }
    });
  }

  editor.inspector = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
