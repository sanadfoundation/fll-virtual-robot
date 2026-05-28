'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_steps',
  ]).ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.steps.attach(app, doc);
  return { ctx, doc, app };
}

test('steps: enterEditor shows an empty step list', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const list = doc.getElementById('editor-steps-list');
  assert.strictEqual(list.children.length, 0);
});

test('steps: clicking "+ Add step" creates a row', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  assert.strictEqual(app.editorState.steps.length, 1);
  const list = doc.getElementById('editor-steps-list');
  assert.strictEqual(list.children.length, 1);
});

test('steps: editing the title input updates state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  const titleInput = doc.getElementById('editor-steps-list').querySelector('.step-title-input');
  titleInput.value = 'Reach red';
  titleInput._fire('input', { target: titleInput });
  assert.strictEqual(app.editorState.steps[0].title, 'Reach red');
});

test('steps: editing the points input updates state as a number', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const ptsInput = doc.getElementById('editor-steps-list').querySelector('.step-points-input');
  ptsInput.value = '25';
  ptsInput._fire('input', { target: ptsInput });
  assert.strictEqual(app.editorState.steps[0].points, 25);
});

test('steps: clicking the row delete button removes the step', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  assert.strictEqual(app.editorState.steps.length, 2);
  const firstDelete = doc.getElementById('editor-steps-list').querySelector('.step-delete-btn');
  firstDelete._click();
  assert.strictEqual(app.editorState.steps.length, 1);
});

test('steps: editing the hint input updates state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const hintInput = doc.getElementById('editor-steps-list').querySelector('.step-hint-input');
  hintInput.value = 'Drive east 1200mm';
  hintInput._fire('input', { target: hintInput });
  assert.strictEqual(app.editorState.steps[0].hint, 'Drive east 1200mm');
});

test('steps: clicking up arrow moves the step earlier', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  // Click the second row's up button.
  const rows = doc.getElementById('editor-steps-list').children;
  rows[1].querySelector('.step-up-btn')._click();
  assert.deepStrictEqual(app.editorState.steps.map(s => s.id), [b.id, a.id]);
});

test('steps: clicking down arrow moves the step later', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  const rows = doc.getElementById('editor-steps-list').children;
  rows[0].querySelector('.step-down-btn')._click();
  assert.deepStrictEqual(app.editorState.steps.map(s => s.id), [b.id, a.id]);
});

test('steps: each row has an Edit button that selects the step (opens condition picker)', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  const row = doc.getElementById('editor-steps-list').children[0];
  const editBtn = row.querySelector('.step-edit-btn');
  assert.ok(editBtn, 'expected each row to have a .step-edit-btn');
  editBtn._click();
  assert.deepStrictEqual(app.editorState.selection, { kind: 'step', id });
});

test('steps: inputs have placeholder + title affordances', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const row = doc.getElementById('editor-steps-list').children[0];
  const title  = row.querySelector('.step-title-input');
  const points = row.querySelector('.step-points-input');
  const hint   = row.querySelector('.step-hint-input');
  assert.ok(title.getAttribute('placeholder'),  'step title input needs a placeholder');
  assert.ok(title.getAttribute('title'),        'step title input needs a tooltip');
  assert.ok(points.getAttribute('title'),       'step points input needs a tooltip');
  assert.ok(hint.getAttribute('placeholder'),   'step hint input needs a placeholder');
  assert.ok(hint.getAttribute('title'),         'step hint input needs a tooltip');
});

test('steps: row buttons have title tooltips', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const row = doc.getElementById('editor-steps-list').children[0];
  for (const cls of ['.step-up-btn', '.step-down-btn', '.step-requires-btn', '.step-edit-btn', '.step-delete-btn']) {
    const btn = row.querySelector(cls);
    assert.ok(btn, `expected ${cls} button to exist`);
    assert.ok(btn.getAttribute('title'), `expected ${cls} to have a title attribute`);
  }
});

test('steps: clicking a row selects it', () => {
  const { doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  const row = doc.getElementById('editor-steps-list').children[0];
  row._fire('click', { target: row });
  assert.deepStrictEqual(app.editorState.selection, { kind: 'step', id });
});

test('steps: selected row gets .selected class', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  const row = doc.getElementById('editor-steps-list').children[0];
  assert.ok(row.classList.contains('selected'));
});

test('requires: checkbox for another step toggles requires on the row', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  // Open requires on row B (second row).
  const rows = doc.getElementById('editor-steps-list').children;
  const reqBtn = rows[1].querySelector('.step-requires-btn');
  reqBtn._click();
  // The panel should be in the DOM with a checkbox for step A.
  const panel = rows[1].querySelector('.step-requires-panel');
  assert.ok(panel, 'requires panel should appear');
  const checkbox = panel.querySelector('input');
  assert.ok(checkbox, 'expected a checkbox for the other step');
  checkbox._fire('change', { target: { checked: true } });
  // Mock input doesn't track `checked` on the actual input — the handler reads
  // from the synthetic event. Verify state side-effect:
  assert.deepStrictEqual(app.editorState.steps[1].requires, [a.id]);
});

test('requires: toggling off removes the requirement', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  doc.getElementById('btn-add-step')._click();
  doc.getElementById('btn-add-step')._click();
  const [a, b] = app.editorState.steps;
  app.setEditorState(ctx.MISSIONS.editor.state.editStep(app.editorState, b.id, { requires: [a.id] }));
  const rows = doc.getElementById('editor-steps-list').children;
  rows[1].querySelector('.step-requires-btn')._click();
  const panel = rows[1].querySelector('.step-requires-panel');
  const checkbox = panel.querySelector('input');
  checkbox._fire('change', { target: { checked: false } });
  assert.deepStrictEqual(app.editorState.steps[1].requires, []);
});
