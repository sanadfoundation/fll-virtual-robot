'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc }   = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_modifiers',
  ]).ctx;
}

const MODIFIER_IDS = [
  'editor-mod-poke-enabled', 'editor-mod-poke-interval-min',
  'editor-mod-poke-interval-max', 'editor-mod-poke-severity',
  'editor-mod-friction-enabled', 'editor-mod-friction-multiplier',
];

function setup() {
  const ctx = env();
  const doc = makeEditorDoc(MODIFIER_IDS);
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.modifiers.attach(app, doc);
  return { ctx, doc, app };
}

test('modifiers editor: enterEditor reflects default disabled state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const pokeToggle = doc.getElementById('editor-mod-poke-enabled');
  assert.ok(pokeToggle, 'poke toggle must exist');
  assert.strictEqual(pokeToggle.checked, false);
  const frictionToggle = doc.getElementById('editor-mod-friction-enabled');
  assert.ok(frictionToggle, 'friction toggle must exist');
  assert.strictEqual(frictionToggle.checked, false);
});

test('modifiers editor: toggling poke updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const toggle = doc.getElementById('editor-mod-poke-enabled');
  toggle.checked = true;
  toggle._fire('change', { target: toggle });
  assert.strictEqual(app.editorState.modifiers.poke.enabled, true);
  assert.strictEqual(app.editorState.dirty, true);
});

test('modifiers editor: changing severity updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const severity = doc.getElementById('editor-mod-poke-severity');
  severity.value = '0.8';
  severity._fire('input', { target: severity });
  assert.strictEqual(app.editorState.modifiers.poke.severity, 0.8);
});

test('modifiers editor: changing friction multiplier updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const slider = doc.getElementById('editor-mod-friction-multiplier');
  slider.value = '0.6';
  slider._fire('input', { target: slider });
  assert.strictEqual(app.editorState.modifiers.friction.multiplier, 0.6);
});

test('modifiers editor: loadFromMission populates fields', () => {
  const { ctx, doc, app } = setup();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s = ctx.MISSIONS.editor.state.setModifiers(s, {
    poke: { enabled: true, severity: 0.7 },
    friction: { enabled: true, multiplier: 0.6 },
  });
  const mission = ctx.MISSIONS.loader.load(ctx.MISSIONS.editor.state.serializeToMission(s));
  app.enterEditor(mission);
  assert.strictEqual(doc.getElementById('editor-mod-poke-enabled').checked, true);
  assert.strictEqual(doc.getElementById('editor-mod-poke-severity').value, '0.7');
  assert.strictEqual(doc.getElementById('editor-mod-friction-enabled').checked, true);
  assert.strictEqual(doc.getElementById('editor-mod-friction-multiplier').value, '0.6');
});
