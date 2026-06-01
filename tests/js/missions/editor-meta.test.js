'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_meta',
  ]).ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.meta.attach(app, doc);
  return { ctx, doc, app };
}

test('meta: enterEditor reflects state into the form fields', () => {
  const { doc, app } = setup();
  app.enterEditor();
  assert.strictEqual(doc.getElementById('editor-meta-desc').value,       '');
  assert.strictEqual(doc.getElementById('editor-meta-type').value,       'mission');
  assert.strictEqual(doc.getElementById('editor-meta-difficulty').value, 'beginner');
});

test('meta: typing in the description input updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const desc = doc.getElementById('editor-meta-desc');
  desc.value = 'Drive to the red zone.';
  desc._fire('input', { target: desc });
  assert.strictEqual(app.editorState.description, 'Drive to the red zone.');
  assert.strictEqual(app.editorState.dirty, true);
});

test('meta: changing type updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const sel = doc.getElementById('editor-meta-type');
  sel.value = 'obstacle_course';
  sel._fire('change', { target: sel });
  assert.strictEqual(app.editorState.type, 'obstacle_course');
});

test('meta: changing difficulty updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const sel = doc.getElementById('editor-meta-difficulty');
  sel.value = 'advanced';
  sel._fire('change', { target: sel });
  assert.strictEqual(app.editorState.difficulty_tier, 'advanced');
});

test('meta: loadFromMission populates the form', () => {
  const { ctx, doc, app } = setup();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s.description = 'Existing';
  s.difficulty_tier = 'intermediate';
  s.type = 'mission';
  const mission = ctx.MISSIONS.loader.load(ctx.MISSIONS.editor.state.serializeToMission(s));
  app.enterEditor(mission);
  assert.strictEqual(doc.getElementById('editor-meta-desc').value, 'Existing');
  assert.strictEqual(doc.getElementById('editor-meta-difficulty').value, 'intermediate');
});

test('meta: show_zone_labels checkbox updates state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const cb = doc.getElementById('editor-meta-show-labels');
  assert.ok(cb, 'should have a show-labels checkbox');
  cb.checked = true;
  cb._fire('change', { target: cb });
  assert.strictEqual(app.editorState.show_zone_labels, true);
});

test('meta: show_zone_labels reflected from state on enter', () => {
  const { doc, app } = setup();
  app.enterEditor();
  // Default is false
  const cb = doc.getElementById('editor-meta-show-labels');
  assert.strictEqual(cb.checked, false);
});
