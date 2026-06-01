'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function setup() {
  const ctx = makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_inspector',
  ]).ctx;
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.inspector.attach(app, doc);
  return { ctx, doc, app };
}

// ── helper: add an obstacle, set selection, push state ──────────────────────
function addAndSelectObstacle(ctx, app) {
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addObstacle(s, { x: 500, y: 500 });
  const id = s.field.obstacles[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'obstacle', id });
  app.setEditorState(s);
  return { id };
}

// ── 1. inspector starts hidden when no selection ─────────────────────────────
test('inspector: starts hidden when no selection', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const section = doc.getElementById('editor-inspector-section');
  assert.strictEqual(section.hidden, true);
});

// ── 2. inspector reveals when an obstacle is selected ───────────────────────
test('inspector: reveals when an obstacle is selected', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  addAndSelectObstacle(ctx, app);
  const section = doc.getElementById('editor-inspector-section');
  const body    = doc.getElementById('editor-inspector-body');
  assert.strictEqual(section.hidden, false);
  assert.ok(body.children.length > 0, 'body should have children');
});

// ── 3. inspector renders obstacle's id ───────────────────────────────────────
test('inspector: renders obstacle id in body', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  const { id } = addAndSelectObstacle(ctx, app);
  const body = doc.getElementById('editor-inspector-body');
  function hasText(el, text) {
    if (el.textContent && el.textContent.includes(text)) return true;
    return el.children.some(c => hasText(c, text));
  }
  assert.ok(hasText(body, `ID: ${id}`), `body should contain "ID: ${id}"`);
});

// ── 4. inspector renders an editable label input ─────────────────────────────
test('inspector: label input fires sets obstacle label in state', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  addAndSelectObstacle(ctx, app);
  const body = doc.getElementById('editor-inspector-body');
  // Find the first text input (label input)
  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs.type === type) return el;
    for (const c of el.children) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const labelInput = findInput(body, 'text');
  assert.ok(labelInput, 'should have a text input for label');
  labelInput.value = 'Red Block';
  labelInput._fire('input', { target: labelInput });
  assert.strictEqual(app.editorState.field.obstacles[0].label, 'Red Block');
});

// ── 5. inspector renders W and H number inputs for an obstacle ───────────────
test('inspector: W and H inputs exist and match state', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addObstacle(s, { x: 500, y: 500 });
  const id = s.field.obstacles[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'obstacle', id });
  app.setEditorState(s);

  const obstacle = app.editorState.field.obstacles[0];
  const body = doc.getElementById('editor-inspector-body');
  function findAllInputs(el, type, out) {
    if (el.tag === 'input' && el.attrs.type === type) out.push(el);
    for (const c of el.children) findAllInputs(c, type, out);
  }
  const numInputs = [];
  findAllInputs(body, 'number', numInputs);
  assert.ok(numInputs.length >= 2, 'should have at least 2 number inputs (W and H)');
  const vals = numInputs.map(i => i.value);
  assert.ok(vals.includes(String(obstacle.w)), `W input should match obstacle.w=${obstacle.w}`);
  assert.ok(vals.includes(String(obstacle.h)), `H input should match obstacle.h=${obstacle.h}`);
});

// ── 6. resize input clamps width to ≥ 20 ────────────────────────────────────
test('inspector: resize input clamps width to 20 minimum', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  addAndSelectObstacle(ctx, app);
  const body = doc.getElementById('editor-inspector-body');
  function findAllInputs(el, type, out) {
    if (el.tag === 'input' && el.attrs.type === type) out.push(el);
    for (const c of el.children) findAllInputs(c, type, out);
  }
  const numInputs = [];
  findAllInputs(body, 'number', numInputs);
  // First number input is W
  const wInput = numInputs[0];
  wInput.value = '5';
  wInput._fire('input', { target: wInput });
  assert.strictEqual(app.editorState.field.obstacles[0].w, 20);
});

// ── 7. inspector reveals for selected zone with id and color buttons ─────────
test('inspector: reveals for zone selection with id and color swatches', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  const id = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'zone', id });
  app.setEditorState(s);

  const section = doc.getElementById('editor-inspector-section');
  const body    = doc.getElementById('editor-inspector-body');
  assert.strictEqual(section.hidden, false);

  function hasText(el, text) {
    if (el.textContent && el.textContent.includes(text)) return true;
    return el.children.some(c => hasText(c, text));
  }
  assert.ok(hasText(body, `ID: ${id}`), 'body should show zone ID');

  // Color swatches should exist
  function findAll(el, cls, out) {
    if (el.classList && el.classList.contains(cls)) out.push(el);
    for (const c of el.children) findAll(c, cls, out);
  }
  const swatches = [];
  findAll(body, 'inspector-color-swatch', swatches);
  assert.ok(swatches.length >= 6, 'should have zone color swatches');
});

// ── 8. zone color change updates state ───────────────────────────────────────
test('inspector: zone color swatch click updates state.zones[0].color', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  const id = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'zone', id });
  app.setEditorState(s);

  function findAll(el, cls, out) {
    if (el.classList && el.classList.contains(cls)) out.push(el);
    for (const c of el.children) findAll(c, cls, out);
  }
  const body = doc.getElementById('editor-inspector-body');
  const swatches = [];
  findAll(body, 'inspector-color-swatch', swatches);
  // Click the green swatch
  const greenSwatch = swatches.find(sw => sw.attrs['data-color'] === 'green');
  assert.ok(greenSwatch, 'should have a green swatch');
  greenSwatch._click();
  assert.strictEqual(app.editorState.field.zones[0].color, 'green');
});

// ── 9. reveals for selected line with color + thickness controls ─────────────
test('inspector: reveals for line selection with color swatches + thickness input', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addLine(s, { x1: 0, y1: 0, x2: 100, y2: 100 });
  const id = s.field.lines[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'line', id });
  app.setEditorState(s);

  const section = doc.getElementById('editor-inspector-section');
  const body    = doc.getElementById('editor-inspector-body');
  assert.strictEqual(section.hidden, false);

  function findAll(el, cls, out) {
    if (el.classList && el.classList.contains(cls)) out.push(el);
    for (const c of el.children) findAll(c, cls, out);
  }
  const swatches = [];
  findAll(body, 'inspector-color-swatch', swatches);
  assert.ok(swatches.length > 0, 'should have line color swatches');

  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs.type === type) return el;
    for (const c of el.children) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const numInput = findInput(body, 'number');
  assert.ok(numInput, 'should have a thickness number input');
  assert.strictEqual(numInput.value, '4'); // default thickness
});

// ── 10. line thickness clamps to 1..20 ───────────────────────────────────────
test('inspector: line thickness clamps to 1..20', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addLine(s, { x1: 0, y1: 0, x2: 100, y2: 100 });
  const id = s.field.lines[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'line', id });
  app.setEditorState(s);

  const body = doc.getElementById('editor-inspector-body');
  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs.type === type) return el;
    for (const c of el.children) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const tInput = findInput(body, 'number');

  // try 0 → clamps to 1
  tInput.value = '0';
  tInput._fire('input', { target: tInput });
  assert.strictEqual(app.editorState.field.lines[0].thickness, 1);

  // try 25 → clamps to 20
  tInput.value = '25';
  tInput._fire('input', { target: tInput });
  assert.strictEqual(app.editorState.field.lines[0].thickness, 20);
});

// ── 11. reveals for selected wall with W+H inputs ───────────────────────────
test('inspector: reveals for wall selection with W+H inputs', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addWall(s, { x: 100, y: 200 });
  const id = s.field.walls[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'wall', id });
  app.setEditorState(s);

  const section = doc.getElementById('editor-inspector-section');
  const body    = doc.getElementById('editor-inspector-body');
  assert.strictEqual(section.hidden, false);

  const wall = app.editorState.field.walls[0];
  function findAllInputs(el, type, out) {
    if (el.tag === 'input' && el.attrs.type === type) out.push(el);
    for (const c of el.children) findAllInputs(c, type, out);
  }
  const numInputs = [];
  findAllInputs(body, 'number', numInputs);
  assert.ok(numInputs.length >= 2, 'should have W and H inputs');
  const vals = numInputs.map(i => i.value);
  assert.ok(vals.includes(String(wall.w)), `W input should show ${wall.w}`);
  assert.ok(vals.includes(String(wall.h)), `H input should show ${wall.h}`);
});

// ── 12. reveals for robot start with heading input ───────────────────────────
test('inspector: reveals for robot start with heading input', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'start' });
  app.setEditorState(s);

  const section = doc.getElementById('editor-inspector-section');
  const body    = doc.getElementById('editor-inspector-body');
  assert.strictEqual(section.hidden, false);

  const heading = app.editorState.field.robot_start.heading;
  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs.type === type) return el;
    for (const c of el.children) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const hInput = findInput(body, 'number');
  assert.ok(hInput, 'should have heading number input');
  assert.strictEqual(hInput.value, String(heading));
});

// ── 13. heading change updates start.heading and preserves x,y ──────────────
test('inspector: heading change updates start.heading and preserves x,y', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'start' });
  app.setEditorState(s);

  const origStart = app.editorState.field.robot_start;
  const body = doc.getElementById('editor-inspector-body');
  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs.type === type) return el;
    for (const c of el.children) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const hInput = findInput(body, 'number');
  hInput.value = '45';
  hInput._fire('input', { target: hInput });

  const newStart = app.editorState.field.robot_start;
  assert.strictEqual(newStart.heading, 45);
  assert.strictEqual(newStart.x, origStart.x);
  assert.strictEqual(newStart.y, origStart.y);
});

// ── 14. clears body on exit from editor mode ─────────────────────────────────
test('inspector: clears body and hides section on exitEditor', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  addAndSelectObstacle(ctx, app);
  const section = doc.getElementById('editor-inspector-section');
  const body    = doc.getElementById('editor-inspector-body');
  assert.ok(body.children.length > 0, 'should have children before exit');
  app.exitEditor();
  assert.strictEqual(body.children.length, 0, 'body should be empty after exit');
  assert.strictEqual(section.hidden, true, 'section should be hidden after exit');
});

// ── 15. handles stale selection gracefully ───────────────────────────────────
test('inspector: stale selection keeps section hidden without throwing', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'obstacle', id: 'no-such-id' });
  assert.doesNotThrow(() => app.setEditorState(s));
  const section = doc.getElementById('editor-inspector-section');
  assert.strictEqual(section.hidden, true);
});

// ── helper: add a zone and select it ──────────────────────────────────────────
function addAndSelectZone(ctx, app) {
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 200, y: 200 });
  const id = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.setSelection(s, { kind: 'zone', id });
  app.setEditorState(s);
  return { id };
}

// ── 16. zone inspector is shown when a zone is selected ───────────────────────
test('inspector: zone inspector is shown when a zone is selected', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  addAndSelectZone(ctx, app);
  assert.strictEqual(doc.getElementById('editor-inspector-section').hidden, false);
});

// ── 17. zone inspector has a text input for label ──────────────────────────────
test('inspector: zone inspector has a text input for label', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  addAndSelectZone(ctx, app);
  const body = doc.getElementById('editor-inspector-body');
  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs && el.attrs.type === type) return el;
    for (const c of (el.children || [])) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const labelInput = findInput(body, 'text');
  assert.ok(labelInput, 'should have a text input for zone label');
});

// ── 18. typing in zone label input calls setZoneLabel on state ────────────────
test('inspector: typing in zone label input calls setZoneLabel on state', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  const { id } = addAndSelectZone(ctx, app);
  const body = doc.getElementById('editor-inspector-body');
  function findInput(el, type) {
    if (el.tag === 'input' && el.attrs && el.attrs.type === type) return el;
    for (const c of (el.children || [])) { const r = findInput(c, type); if (r) return r; }
    return null;
  }
  const labelInput = findInput(body, 'text');
  labelInput.value = 'Energy Zone';
  labelInput._fire('input', { target: labelInput });
  assert.strictEqual(app.editorState.field.zones[0].label, 'Energy Zone');
});
