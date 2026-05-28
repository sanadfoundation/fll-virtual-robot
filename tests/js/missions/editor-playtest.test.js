'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_playtest',
  ]).ctx;
}

function setupStorage() {
  const store = new Map();
  return {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    _store: store,
  };
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const storage = setupStorage();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.playtest.attach(app, doc, storage);
  return { ctx, doc, app, storage };
}

function authoredState(ctx) {
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({
    id: 'a', title: 'Reach',  points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id },
  });
  return s;
}

test('playtest: valid state switches to play mode and saves temp', () => {
  const { ctx, doc, app, storage } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  assert.ok(storage.getItem('mission_playtest_temp'), 'temp slot should be written');
});

test('playtest: invalid state does NOT switch mode; surfaces error', () => {
  const { ctx, doc, app, storage } = setup();
  app.enterEditor();  // blank state with no steps
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(storage.getItem('mission_playtest_temp'), null);
  // The editor toolbar should have an error indicator.
  const tag = doc.getElementById('header-editor-controls').querySelector('.editor-error');
  assert.ok(tag, 'expected an inline error element');
  assert.match(tag.textContent, /at least one step/);
});

test('playtest: returning from play preserves in-memory edit state', () => {
  const { ctx, doc, app, storage } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  const titleBefore = app.editorState.title;
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  // Simulate "Back to Editor" — playtest module should expose a return method.
  ctx.MISSIONS.editor.playtest.returnToEditor();
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(app.editorState.title, titleBefore);
});

test('playtest: clicking exit while a playtest is active calls returnToEditor', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  // The existing Exit Mission button (Plan 1) should now trigger return.
  doc.getElementById('mm-exit')._click();
  assert.strictEqual(app.mode, 'editor');
});

test('playtest: mm-exit label changes when entering play from editor', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(authoredState(ctx));
  const exitBefore = doc.getElementById('mm-exit').textContent;
  doc.getElementById('btn-editor-playtest')._click();
  assert.notStrictEqual(doc.getElementById('mm-exit').textContent, exitBefore);
  assert.match(doc.getElementById('mm-exit').textContent, /Back to Editor/);
});
