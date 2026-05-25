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
