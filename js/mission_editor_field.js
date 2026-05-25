'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  const FIELD_W_MM = 2362;
  const FIELD_H_MM = 1143;
  const NS = 'http://www.w3.org/2000/svg';

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
    }

    function clearOverlay() {
      while (overlay.children.length) overlay.removeChild(overlay.children[0]);
      svg = null; mathGroup = null;
      zonesGroup = null; obstaclesGroup = null; startGroup = null;
    }

    function createSvg(tag) {
      const el = doc.createElement(tag);
      el.setAttribute('xmlns', NS);
      return el;
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
      startGroup.appendChild(handle);
    }

    function removeChildren(node) {
      while (node.children.length) node.removeChild(node.children[0]);
    }

    app.onChange(({ mode, editorState }) => {
      if (mode === 'editor') render(editorState);
      else clearOverlay();
    });
  }

  editor.field = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
