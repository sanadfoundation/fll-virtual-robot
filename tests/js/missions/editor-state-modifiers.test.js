'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
  ]).ctx;
}

test('editor-state: createBlank returns new poke/friction modifiers shape', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  assert.deepStrictEqual(s.modifiers.poke,     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 });
  assert.deepStrictEqual(s.modifiers.friction, { enabled: false, multiplier: 1.0 });
});

test('editor-state: clone deep-copies the poke object', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const c = ctx.MISSIONS.editor.state._clone(s);
  c.modifiers.poke.enabled = true;
  assert.strictEqual(s.modifiers.poke.enabled, false, 'original must not be mutated');
});

test('editor-state: setModifiers enables poke', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const next = ctx.MISSIONS.editor.state.setModifiers(s, { poke: { enabled: true } });
  assert.strictEqual(next.modifiers.poke.enabled, true);
  assert.strictEqual(next.modifiers.poke.interval_min_s, 8, 'unchanged fields preserved');
  assert.strictEqual(next.dirty, true);
});

test('editor-state: setModifiers updates friction multiplier', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const next = ctx.MISSIONS.editor.state.setModifiers(s, { friction: { multiplier: 0.7 } });
  assert.strictEqual(next.modifiers.friction.multiplier, 0.7);
  assert.strictEqual(next.modifiers.friction.enabled, false, 'unchanged fields preserved');
});

test('editor-state: serializeToMission includes modifiers', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s = ctx.MISSIONS.editor.state.setModifiers(s, { poke: { enabled: true, severity: 0.8 } });
  const mission = ctx.MISSIONS.loader.load(ctx.MISSIONS.editor.state.serializeToMission(s));
  assert.strictEqual(mission.modifiers.poke.enabled, true);
  assert.strictEqual(mission.modifiers.poke.severity, 0.8);
});
