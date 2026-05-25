'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  const FIELD_W_MM = 2362;
  const FIELD_H_MM = 1143;
  const NS = 'http://www.w3.org/2000/svg';

  const TOOLS = ['select', 'obstacle', 'zone', 'start'];

  // Convert math y-up coordinates to SVG (top-left origin) coords.
  // SVG viewBox is in mm; we keep math y-up coordinates by setting
  // transform="scale(1,-1) translate(0,-FIELD_H_MM)" on the root group.

  function attach(app, doc) {
    const overlay = doc.getElementById('editor-canvas-overlay');
    if (!overlay) return;

    let svg = null;
    let mathGroup = null;
    let zonesGroup = null;
    let obstaclesGroup = null;
    let startGroup = null;
    let activeTool = 'select';
    let palette = null;

    function ensureSvg() {
      if (svg) return;
      svg = createSvg('svg');
      svg.setAttribute('viewBox', `0 0 ${FIELD_W_MM} ${FIELD_H_MM}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.classList.add('editor-overlay-svg');
      // math y-up wrapper: flip Y and translate.
      mathGroup = createSvg('g');
      mathGroup.setAttribute('transform', `translate(0,${FIELD_H_MM}) scale(1,-1)`);
      zonesGroup     = createSvg('g'); zonesGroup.classList.add('editor-zones');
      obstaclesGroup = createSvg('g'); obstaclesGroup.classList.add('editor-obstacles');
      startGroup     = createSvg('g'); startGroup.classList.add('editor-start');
      mathGroup.appendChild(zonesGroup);
      mathGroup.appendChild(obstaclesGroup);
      mathGroup.appendChild(startGroup);
      svg.appendChild(mathGroup);
      overlay.appendChild(svg);
      svg.addEventListener('click', handleSvgClick);
      // Production-only: convert pointer events to field coords using SVG CTM.
      // In tests, an injected `_fieldPoint` short-circuits this branch.
      svg.addEventListener('click', (ev) => {
        if (ev._fieldPoint) return;  // already handled by the synthetic-path listener above
        if (typeof svg.getBoundingClientRect !== 'function') return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        // Page-space → SVG-space via the inverse CTM. Math y-up.
        const px = (ev.clientX - rect.left) * (FIELD_W_MM / rect.width);
        const pyTop = (ev.clientY - rect.top)  * (FIELD_H_MM / rect.height);
        const py = FIELD_H_MM - pyTop;
        handleSvgClick({ _fieldPoint: { x: px, y: py } });
      });
      let dragging = false;
      svg.addEventListener('pointerdown', (ev) => {
        if (activeTool !== 'select') return;
        if (!app.editorState || !app.editorState.selection) return;
        dragging = true;
        if (svg.setPointerCapture && ev.pointerId !== undefined) {
          try { svg.setPointerCapture(ev.pointerId); } catch (_e) {}
        }
      });
      svg.addEventListener('pointermove', (ev) => {
        if (!dragging) return;
        if (typeof svg.getBoundingClientRect !== 'function') return;
        const rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const px = (ev.clientX - rect.left) * (FIELD_W_MM / rect.width);
        const pyTop = (ev.clientY - rect.top)  * (FIELD_H_MM / rect.height);
        dragMoveToPoint({ x: px, y: FIELD_H_MM - pyTop });
      });
      svg.addEventListener('pointerup', () => { dragging = false; });
      svg.addEventListener('pointercancel', () => { dragging = false; });
    }

    function ensurePalette() {
      if (palette) return;
      palette = doc.createElement('div');
      palette.classList.add('editor-palette');
      for (const tool of TOOLS) {
        const btn = doc.createElement('button');
        btn.classList.add('editor-tool', `editor-tool-${tool}`);
        if (tool === activeTool) btn.classList.add('active');
        btn.textContent = labelFor(tool);
        btn.setAttribute('type', 'button');
        btn.addEventListener('click', () => setTool(tool));
        palette.appendChild(btn);
      }
      overlay.appendChild(palette);
    }

    function labelFor(tool) {
      switch (tool) {
        case 'select':   return '↖ Select';
        case 'obstacle': return '▭ Obstacle';
        case 'zone':     return '▢ Zone';
        case 'start':    return '⌖ Robot start';
        default: return tool;
      }
    }

    function setTool(tool) {
      activeTool = tool;
      const buttons = palette.children;
      for (const b of buttons) {
        b.classList.toggle('active', b.classList.contains(`editor-tool-${tool}`));
      }
    }

    function dragMoveToPoint(point) {
      const sel = app.editorState && app.editorState.selection;
      if (!sel) return;
      let next = app.editorState;
      if (sel.kind === 'obstacle') {
        next = MISSIONS.editor.state.moveObstacle(next, sel.id, point);
      } else if (sel.kind === 'zone') {
        next = MISSIONS.editor.state.moveZone(next, sel.id, point);
      } else if (sel.kind === 'start') {
        next = MISSIONS.editor.state.setRobotStart(next, {
          x: point.x, y: point.y, heading: next.field.robot_start.heading,
        });
      } else {
        return;
      }
      app.setEditorState(next);
    }

    function handleElementClick(ev, kind, id) {
      if (activeTool !== 'select') return;  // tool palette governs add-modes
      // Suppress the SVG-level click handler (which would clear selection).
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
      ev._handled = true;
      app.setEditorState(MISSIONS.editor.state.setSelection(app.editorState, { kind, id }));
    }

    function handleSvgClick(ev) {
      if (ev._handled) return;
      if (activeTool === 'select') {
        if (app.editorState && app.editorState.selection) {
          app.setEditorState(MISSIONS.editor.state.setSelection(app.editorState, null));
        }
        return;
      }
      const point = ev._fieldPoint;
      if (!point) return;
      if (activeTool === 'obstacle') {
        app.setEditorState(MISSIONS.editor.state.addObstacle(app.editorState, point));
        setTool('select');
      } else if (activeTool === 'zone') {
        app.setEditorState(MISSIONS.editor.state.addZone(app.editorState, point));
        setTool('select');
      } else if (activeTool === 'start') {
        const next = MISSIONS.editor.state.setRobotStart(app.editorState, {
          x: point.x, y: point.y, heading: app.editorState.field.robot_start.heading,
        });
        app.setEditorState(next);
        setTool('select');
      }
    }

    function clearOverlay() {
      while (overlay.children.length) overlay.removeChild(overlay.children[0]);
      svg = null; mathGroup = null;
      zonesGroup = null; obstaclesGroup = null; startGroup = null;
      palette = null;
    }

    function createSvg(tag) {
      // Must use createElementNS so browsers render the elements as SVG.
      // The test mock aliases createElementNS to createElement.
      if (typeof doc.createElementNS === 'function') {
        return doc.createElementNS(NS, tag);
      }
      return doc.createElement(tag);
    }

    function render(state) {
      if (!state) { clearOverlay(); return; }
      ensureSvg();
      // Zones
      removeChildren(zonesGroup);
      for (const z of state.field.zones) {
        const rect = createSvg('rect');
        rect.setAttribute('x', z.x);
        rect.setAttribute('y', z.y);
        rect.setAttribute('width', z.w);
        rect.setAttribute('height', z.h);
        rect.classList.add('editor-zone');
        rect.setAttribute('data-id', z.id);
        rect.setAttribute('data-kind', 'zone');
        rect.setAttribute('data-color', z.color);
        if (state.selection && state.selection.kind === 'zone' && state.selection.id === z.id) {
          rect.classList.add('selected');
        }
        rect.addEventListener('click', (ev) => handleElementClick(ev, 'zone', z.id));
        zonesGroup.appendChild(rect);
      }
      // Obstacles
      removeChildren(obstaclesGroup);
      for (const o of state.field.obstacles) {
        // The obstacle config uses {x,y} as the center; SVG rect is top-left
        // anchored. Convert by offsetting -w/2, -h/2.
        const rect = createSvg('rect');
        rect.setAttribute('x', o.x - o.w / 2);
        rect.setAttribute('y', o.y - o.h / 2);
        rect.setAttribute('width', o.w);
        rect.setAttribute('height', o.h);
        rect.classList.add('editor-obstacle');
        rect.setAttribute('data-id', o.id);
        rect.setAttribute('data-kind', 'obstacle');
        if (state.selection && state.selection.kind === 'obstacle' && state.selection.id === o.id) {
          rect.classList.add('selected');
        }
        rect.addEventListener('click', (ev) => handleElementClick(ev, 'obstacle', o.id));
        obstaclesGroup.appendChild(rect);
      }
      // Robot start
      removeChildren(startGroup);
      const start = state.field.robot_start;
      const handle = createSvg('circle');
      handle.setAttribute('cx', start.x);
      handle.setAttribute('cy', start.y);
      handle.setAttribute('r', 16);
      handle.classList.add('editor-robot-start');
      handle.setAttribute('data-kind', 'robot-start');
      if (state.selection && state.selection.kind === 'start') {
        handle.classList.add('selected');
      }
      handle.addEventListener('click', (ev) => handleElementClick(ev, 'start', null));
      startGroup.appendChild(handle);
    }

    function removeChildren(node) {
      while (node.children.length) node.removeChild(node.children[0]);
    }

    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') {
        ensureSvg();
        ensurePalette();
        render(editorState);
      } else {
        clearOverlay();
        palette = null;
        activeTool = 'select';
      }
    });

    function deleteSelected() {
      const sel = app.editorState && app.editorState.selection;
      if (!sel) return;
      let next = app.editorState;
      if (sel.kind === 'obstacle') {
        next = MISSIONS.editor.state.deleteObstacle(next, sel.id);
      } else if (sel.kind === 'zone') {
        next = MISSIONS.editor.state.deleteZone(next, sel.id);
      } else {
        return;  // start can't be deleted
      }
      next = MISSIONS.editor.state.setSelection(next, null);
      app.setEditorState(next);
    }

    editor.field._test_dragMove = dragMoveToPoint;
    editor.field._test_deleteSelected = deleteSelected;

    if (doc.addEventListener) {
      doc.addEventListener('keydown', (ev) => {
        if (app.mode !== 'editor') return;
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          // Don't steal Delete from text inputs (title, description, step inputs).
          const tag = (ev.target && ev.target.tagName && ev.target.tagName.toLowerCase()) || '';
          if (tag === 'input' || tag === 'textarea') return;
          deleteSelected();
        }
      });
    }
  }

  editor.field = { attach, _test_dragMove: null, _test_deleteSelected: null };
})(typeof window !== 'undefined' ? window : globalThis);
