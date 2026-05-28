'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_field',
  ]).ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.field.attach(app, doc);
  return { ctx, doc, app };
}

test('field: overlay starts empty', () => {
  const { doc } = setup();
  const overlay = doc.getElementById('editor-canvas-overlay');
  // The SVG root may exist as a child; obstacle/zone groups should be empty.
  const zones = overlay.querySelectorAll('.editor-zone');
  const obs   = overlay.querySelectorAll('.editor-obstacle');
  assert.strictEqual(zones.length, 0);
  assert.strictEqual(obs.length,   0);
});

test('field: entering editor renders the robot start handle', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const overlay = doc.getElementById('editor-canvas-overlay');
  const start = overlay.querySelectorAll('.editor-robot-start');
  assert.strictEqual(start.length, 1, 'expected robot start handle to render');
});

test('field: adding a zone renders a .editor-zone element', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  app.setEditorState(s);
  const overlay = doc.getElementById('editor-canvas-overlay');
  assert.strictEqual(overlay.querySelectorAll('.editor-zone').length, 1);
});

test('field: adding an obstacle renders a .editor-obstacle element', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addObstacle(s, { x: 1700, y: 943 });
  app.setEditorState(s);
  const overlay = doc.getElementById('editor-canvas-overlay');
  assert.strictEqual(overlay.querySelectorAll('.editor-obstacle').length, 1);
});

test('field: exiting editor clears the overlay', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 0, y: 0 }));
  app.exitEditor();
  const overlay = doc.getElementById('editor-canvas-overlay');
  assert.strictEqual(overlay.querySelectorAll('.editor-zone').length, 0);
  assert.strictEqual(overlay.querySelectorAll('.editor-robot-start').length, 0);
});

test('palette: starts in select mode', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const palette = doc.getElementById('editor-canvas-overlay').querySelector('.editor-palette');
  assert.ok(palette, 'palette should be rendered');
  const selectBtn = palette.querySelector('.editor-tool-select');
  assert.ok(selectBtn.classList.contains('active'));
});

test('palette: click "Add obstacle" then click canvas adds an obstacle at that point', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  const palette = doc.getElementById('editor-canvas-overlay').querySelector('.editor-palette');
  palette.querySelector('.editor-tool-obstacle')._click();
  // Now the canvas click handler should treat clicks as "place obstacle".
  // We synthesise a click event with field-space coords carried via detail.
  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  svg._fire('click', { _fieldPoint: { x: 500, y: 400 } });
  assert.strictEqual(app.editorState.field.obstacles.length, 1);
  assert.strictEqual(app.editorState.field.obstacles[0].x, 500);
  assert.strictEqual(app.editorState.field.obstacles[0].y, 400);
});

test('palette: after placing an obstacle the active tool reverts to "select"', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  const palette = doc.getElementById('editor-canvas-overlay').querySelector('.editor-palette');
  palette.querySelector('.editor-tool-obstacle')._click();
  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  svg._fire('click', { _fieldPoint: { x: 0, y: 0 } });
  assert.ok(palette.querySelector('.editor-tool-select').classList.contains('active'));
  assert.ok(!palette.querySelector('.editor-tool-obstacle').classList.contains('active'));
});

test('selection: click on a zone in select mode selects it', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.zones[0].id;
  const zoneEl = doc.getElementById('editor-canvas-overlay').querySelector('.editor-zone');
  zoneEl._fire('click', { _fieldElement: true });
  assert.deepStrictEqual(app.editorState.selection, { kind: 'zone', id });
});

test('selection: selected element gets .selected class', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));
  const obstEl = doc.getElementById('editor-canvas-overlay').querySelector('.editor-obstacle');
  assert.ok(obstEl.classList.contains('selected'));
});

test('selection: clicking empty canvas clears selection', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.zones[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'zone', id }));
  // Click the SVG root (not a zone child) — should clear.
  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  svg._fire('click', { _fieldPoint: { x: 1500, y: 700 } });  // empty area
  assert.strictEqual(app.editorState.selection, null);
});

test('drag: simulating a drag on a selected obstacle updates its position', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));
  // Test seam: directly call the drag handler with field-space delta.
  ctx.MISSIONS.editor.field._test_dragMove({ x: 555, y: 666 });
  assert.strictEqual(app.editorState.field.obstacles[0].x, 555);
  assert.strictEqual(app.editorState.field.obstacles[0].y, 666);
});

test('drag: simulating a drag on the robot start updates the start pose', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'start', id: null }));
  ctx.MISSIONS.editor.field._test_dragMove({ x: 1800, y: 400 });
  assert.strictEqual(app.editorState.field.robot_start.x, 1800);
  assert.strictEqual(app.editorState.field.robot_start.y, 400);
});

test('drag: when nothing is selected, _test_dragMove is a no-op', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  const before = app.editorState;
  ctx.MISSIONS.editor.field._test_dragMove({ x: 100, y: 100 });
  assert.strictEqual(app.editorState, before);
});

test('pointerdown on empty SVG with a selection: does NOT engage drag', () => {
  // Regression: clicking empty canvas while an obstacle was highlighted
  // teleported the obstacle to the click point. Drag should only engage
  // when the pointerdown lands on the selected element itself.
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));

  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  assert.ok(svg, 'expected SVG root to be present');

  svg._fire('pointerdown', { target: svg, pointerId: 1 });

  // The gating means "drag" is NOT engaged after a pointerdown on empty area.
  assert.strictEqual(ctx.MISSIONS.editor.field._test_isDragging(), false);
});

test('pointerdown on the selected obstacle element: engages drag', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));

  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  // Mock querySelector only handles single selectors, so look up by class then
  // filter for data-id manually.
  const allObstacles = Array.from(svg.querySelectorAll('.editor-obstacle'));
  const obstacleEl = allObstacles.find(el => el.getAttribute('data-id') === id);
  assert.ok(obstacleEl, 'expected obstacle element to be selectable by id');

  svg._fire('pointerdown', { target: obstacleEl, pointerId: 1 });

  assert.strictEqual(ctx.MISSIONS.editor.field._test_isDragging(), true);
});

test('pointerdown on a non-selected element with another selection: does NOT engage drag', () => {
  // Two obstacles; #1 is selected; user pointerdown's on #2 without selecting first.
  // Drag should not engage — that would teleport #1 to where the user is clicking on #2.
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 800, y: 800 }));
  const id1 = app.editorState.field.obstacles[0].id;
  const id2 = app.editorState.field.obstacles[1].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id: id1 }));

  const svg = doc.getElementById('editor-canvas-overlay').querySelector('.editor-overlay-svg');
  const otherEl = svg.querySelector(`[data-kind="obstacle"][data-id="${id2}"]`);
  svg._fire('pointerdown', { target: otherEl, pointerId: 1 });

  assert.strictEqual(ctx.MISSIONS.editor.field._test_isDragging(), false);
});

test('delete: pressing Delete while an obstacle is selected removes it', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'obstacle', id }));
  ctx.MISSIONS.editor.field._test_deleteSelected();
  assert.strictEqual(app.editorState.field.obstacles.length, 0);
  assert.strictEqual(app.editorState.selection, null);
});

test('delete: pressing Delete while a zone is selected removes it', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const id = app.editorState.field.zones[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'zone', id }));
  ctx.MISSIONS.editor.field._test_deleteSelected();
  assert.strictEqual(app.editorState.field.zones.length, 0);
});

test('delete: robot start cannot be deleted', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'start', id: null }));
  const beforeStart = app.editorState.field.robot_start;
  ctx.MISSIONS.editor.field._test_deleteSelected();
  assert.deepStrictEqual(app.editorState.field.robot_start, beforeStart);
});
