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
