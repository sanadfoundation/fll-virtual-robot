'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_app', 'mission_editor_app',
  ]).ctx;
}

test('app: enterEditor() switches mode to "editor" and seeds a blank state', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  app.enterEditor();
  assert.strictEqual(app.mode, 'editor');
  assert.ok(app.editorState, 'editorState should be initialised');
  assert.strictEqual(app.editorState.title, 'Untitled Mission');
});

test('app: enterEditor(mission) seeds editor state from an existing mission', () => {
  const ctx = env();
  // Build a self-consistent mission via the editor state path.
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  const mission = ctx.MISSIONS.loader.load(raw);

  const app = ctx.MISSIONS.app.create();
  app.enterEditor(mission);
  assert.strictEqual(app.editorState.title, mission.title);
  assert.strictEqual(app.editorState.field.zones.length, 1);
});

test('app: exitEditor() returns to sandbox and clears editor state', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  app.enterEditor();
  app.exitEditor();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(app.editorState, null);
});

test('editor-app.mount(): sets body[data-mode] and unhides editor surfaces', () => {
  const ctx = env();
  const doc = makeEditorDoc();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);

  app.enterEditor();
  assert.strictEqual(doc.body.dataset.mode, 'editor');
  assert.strictEqual(doc.getElementById('editor-toolbar').hidden, false);
  assert.strictEqual(doc.getElementById('editor-right-panel').hidden, false);

  app.exitEditor();
  assert.notStrictEqual(doc.body.dataset.mode, 'editor');
  assert.strictEqual(doc.getElementById('editor-toolbar').hidden, true);
});

test('editor-app.attach: wires Exit button to app.exitEditor', () => {
  const ctx = env();
  const doc = makeEditorDoc();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);

  app.enterEditor();
  doc.getElementById('btn-editor-exit')._click();
  assert.strictEqual(app.mode, 'sandbox');
});

test('editor-app.attach: title input mirrors editor state', () => {
  const ctx = env();
  const doc = makeEditorDoc();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);

  app.enterEditor();
  const input = doc.getElementById('editor-title-input');
  assert.strictEqual(input.value, 'Untitled Mission');

  input.value = 'New name';
  input._fire('input', { target: input });
  assert.strictEqual(app.editorState.title, 'New name');
  assert.strictEqual(app.editorState.dirty, true);
});
