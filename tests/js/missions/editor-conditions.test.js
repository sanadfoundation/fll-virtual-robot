'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');
const { makeBlocklyStub } = require('../mocks/blockly-stub');

function env() {
  const ctx = makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_conditions',
  ]).ctx;
  ctx.Blockly = makeBlocklyStub();
  return ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.conditions.attach(app, doc);
  return { ctx, doc, app };
}

test('conditions: section starts hidden when no step is selected', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const section = doc.getElementById('editor-cond-section');
  assert.strictEqual(section.hidden, true);
});

test('conditions: section appears when a step is selected', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const stepId = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: stepId }));
  const section = doc.getElementById('editor-cond-section');
  assert.strictEqual(section.hidden, false);
});

test('conditions: deselecting hides the section', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, null));
  assert.strictEqual(doc.getElementById('editor-cond-section').hidden, true);
});

test('conditions: attaching defines all seven predicate blocks (including cond_sensor_color)', () => {
  const { ctx } = setup();
  const defined = ctx.Blockly._definedBlocks;
  for (const t of ['cond_zone', 'cond_sensor', 'cond_sensor_color', 'cond_contact', 'cond_not', 'cond_all_of', 'cond_any_of']) {
    assert.ok(defined[t], `expected block type "${t}" to be defined`);
  }
});

test('cond_sensor_color: emits { kind: sensor, port: C, op, value: <color name> }', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const ws = ctx.Blockly._lastWorkspace();
  ws._setBlocks([makeBlock('cond_sensor_color', { OP: '==', VALUE: 'red' })]);
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'sensor', port: 'C', op: '==', value: 'red' });
});

test('cond_sensor_color: != operator emits the same shape', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const ws = ctx.Blockly._lastWorkspace();
  ws._setBlocks([makeBlock('cond_sensor_color', { OP: '!=', VALUE: 'blue' })]);
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'sensor', port: 'C', op: '!=', value: 'blue' });
});

test('loadIntoWorkspace: a port-C string-valued sensor condition spawns cond_sensor_color, NOT cond_sensor', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  const s0 = ctx.MISSIONS.editor.state.addStep(app.editorState);
  const sId = s0.steps[0].id;
  const withCond = ctx.MISSIONS.editor.state.editStep(s0, sId,
    { condition: { kind: 'sensor', port: 'C', op: '==', value: 'red' } });
  app.setEditorState(withCond);
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: sId }));
  const ws = ctx.Blockly._lastWorkspace();
  assert.strictEqual(ws.getTopBlocks()[0].type, 'cond_sensor_color');
});

test('loadIntoWorkspace: a port-D numeric-valued sensor condition still spawns cond_sensor', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  const s0 = ctx.MISSIONS.editor.state.addStep(app.editorState);
  const sId = s0.steps[0].id;
  const withCond = ctx.MISSIONS.editor.state.editStep(s0, sId,
    { condition: { kind: 'sensor', port: 'D', op: '<', value: 100 } });
  app.setEditorState(withCond);
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: sId }));
  const ws = ctx.Blockly._lastWorkspace();
  assert.strictEqual(ws.getTopBlocks()[0].type, 'cond_sensor');
});

function makeBlock(type, fields, children, parent) {
  return {
    type,
    fields: fields || {},
    children: children || {},
    parent: parent || null,
    _jsonCondition() {
      // Test helper — mirror the generator the editor will provide.
      return ctxCondGenForBlock(this);
    },
  };
}

function ctxCondGenForBlock(b) {
  if (b.type === 'cond_zone')
    return { kind: 'zone', subject: 'robot', zone: b.fields.ZONE };
  if (b.type === 'cond_sensor') {
    const raw = b.fields.VALUE;
    const asNum = Number(raw);
    return { kind: 'sensor', port: b.fields.PORT, op: b.fields.OP,
             value: Number.isNaN(asNum) ? raw : asNum };
  }
  if (b.type === 'cond_contact')
    return { kind: 'contact', obstacle: b.fields.OBSTACLE };
  if (b.type === 'cond_not')
    return { kind: 'not', of: ctxCondGenForBlock(b.children.OF) };
  if (b.type === 'cond_all_of' || b.type === 'cond_any_of') {
    const a = b.children.A ? ctxCondGenForBlock(b.children.A) : null;
    const bb = b.children.B ? ctxCondGenForBlock(b.children.B) : null;
    return { kind: b.type === 'cond_all_of' ? 'all_of' : 'any_of', of: [a, bb].filter(Boolean) };
  }
  return null;
}

test('generator: zone block emits { kind: zone, subject: robot, zone: <id> }', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  // Add a step + select it so workspace is live.
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const stepId = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: stepId }));
  const ws = ctx.Blockly._lastWorkspace();
  ws._setBlocks([makeBlock('cond_zone', { ZONE: 'red' })]);
  // The editor should sync the workspace top block to step.condition.
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'zone', subject: 'robot', zone: 'red' });
});

test('generator: sensor block emits numeric value when input parses as number', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const ws = ctx.Blockly._lastWorkspace();
  ws._setBlocks([makeBlock('cond_sensor', { PORT: 'D', OP: '<', VALUE: '100' })]);
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'sensor', port: 'D', op: '<', value: 100 });
});

test('generator: not wraps an inner block', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const ws = ctx.Blockly._lastWorkspace();
  const inner = makeBlock('cond_zone', { ZONE: 'green' });
  ws._setBlocks([makeBlock('cond_not', {}, { OF: inner })]);
  assert.deepStrictEqual(app.editorState.steps[0].condition,
    { kind: 'not', of: { kind: 'zone', subject: 'robot', zone: 'green' } });
});

test('loadIntoWorkspace: selecting a step with an existing condition populates the workspace', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 100, y: 100 }));
  const zid = app.editorState.field.zones[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const sid = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, sid, {
    condition: { kind: 'zone', subject: 'robot', zone: zid },
  }));
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: sid }));
  const ws = ctx.Blockly._lastWorkspace();
  const top = ws.getTopBlocks();
  assert.strictEqual(top.length, 1);
  assert.strictEqual(top[0].type, 'cond_zone');
  assert.strictEqual(top[0].fields.ZONE, zid);
});

test('dropdowns: zone dropdown options reflect placed zones', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 0, y: 0 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 200, y: 200 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const opts = ctx.MISSIONS.editor.conditions._zoneOptions(app.editorState);
  assert.strictEqual(opts.length, 2);
  for (const [label, value] of opts) {
    assert.strictEqual(typeof label, 'string');
    assert.strictEqual(typeof value, 'string');
  }
});

test('dropdowns: obstacle dropdown options reflect placed obstacles', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 0, y: 0 }));
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const opts = ctx.MISSIONS.editor.conditions._obstacleOptions(app.editorState);
  assert.strictEqual(opts.length, 1);
});

test('dropdowns: obstacle option DISPLAY uses label when set; falls back to id', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 0, y: 0 }));
  const id1 = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setObstacleLabel(app.editorState, id1, 'Energy block'));
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 100, y: 100 }));
  const id2 = app.editorState.field.obstacles[1].id;
  // id2 has no label set, so display falls back to its id.

  const opts = ctx.MISSIONS.editor.conditions._obstacleOptions(app.editorState);
  assert.strictEqual(opts.length, 2);
  // [display, value] — display = label when set, fall back to id.
  assert.deepStrictEqual(opts[0], ['Energy block', id1]);
  assert.deepStrictEqual(opts[1], [id2, id2]);
});

test('selecting a step collapses meta + steps sections to give the condition workspace room', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;

  // Before selecting a step: both sections should still be marked open.
  const metaEl  = doc.getElementById('editor-meta-section');
  const stepsEl = doc.getElementById('editor-steps-section');
  // The mock starts with attrs from the production HTML; we set them manually
  // to mirror the initial state.
  metaEl.setAttribute('open',  '');
  stepsEl.setAttribute('open', '');

  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));

  assert.strictEqual(metaEl.getAttribute('open'),  null, 'meta should be collapsed');
  assert.strictEqual(stepsEl.getAttribute('open'), null, 'steps should be collapsed');
});

test('deselecting a step re-expands meta + steps sections', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, null));

  const metaEl  = doc.getElementById('editor-meta-section');
  const stepsEl = doc.getElementById('editor-steps-section');
  assert.strictEqual(metaEl.getAttribute('open'),  '', 'meta should be open again');
  assert.strictEqual(stepsEl.getAttribute('open'), '', 'steps should be open again');
});

test('dropdowns: obstacle option VALUE is always the id (so the underlying condition stays stable across renames)', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addObstacle(app.editorState, { x: 0, y: 0 }));
  const id1 = app.editorState.field.obstacles[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setObstacleLabel(app.editorState, id1, 'My energy'));
  const opts = ctx.MISSIONS.editor.conditions._obstacleOptions(app.editorState);
  assert.strictEqual(opts[0][1], id1);
});

test('workspace: switching step selection reloads the workspace', () => {
  const { ctx, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addZone(app.editorState, { x: 0, y: 0 }));
  const zid = app.editorState.field.zones[0].id;
  // Two steps with different conditions.
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const [a, b] = app.editorState.steps;
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, a.id,
    { condition: { kind: 'zone', subject: 'robot', zone: zid } }));
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, b.id,
    { condition: { kind: 'contact', obstacle: 'none' } }));
  // Select step a, then b — expect workspace to swap.
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: a.id }));
  const ws = ctx.Blockly._lastWorkspace();
  assert.strictEqual(ws.getTopBlocks()[0].type, 'cond_zone');
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: b.id }));
  assert.strictEqual(ws.getTopBlocks()[0].type, 'cond_contact');
});
