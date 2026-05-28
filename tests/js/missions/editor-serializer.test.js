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

test('serializeToMission: blank state + one zone + one step produces a loader-valid mission', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  const zoneId = s.field.zones[0].id;
  s.steps.push({
    id: 'reach',
    title: 'Reach the zone',
    points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: zoneId },
  });
  s.title = 'Test Mission';

  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  assert.strictEqual(raw.schema_version, ctx.MISSIONS.schema.SCHEMA_VERSION);
  assert.strictEqual(raw.title, 'Test Mission');
  assert.ok(!('selection' in raw), 'selection must not appear in serialized output');
  assert.ok(!('dirty' in raw),     'dirty must not appear in serialized output');

  // The loader is the ultimate arbiter: if it accepts, we are valid.
  const mission = ctx.MISSIONS.loader.load(raw);
  assert.strictEqual(mission.id, s.id);
  assert.strictEqual(mission.steps[0].id, 'reach');
});

test('serializeToMission: empty step list on a mission-type fails loader (round-trip catches it)', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();  // no steps
  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  // The serializer itself doesn't validate — it's the loader that gates Playtest/Save.
  assert.throws(
    () => ctx.MISSIONS.loader.load(raw),
    /at least one step/);
});

test('serializeToMission: deep-copies field arrays so the loaded mission can be mutated without affecting editor state', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addObstacle(s, { x: 100, y: 100 });
  s.steps.push({
    id: 'a', title: 'a', points: 1,
    condition: { kind: 'contact', obstacle: s.field.obstacles[0].id },
  });
  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  raw.field.obstacles[0].x = 9999;
  assert.notStrictEqual(s.field.obstacles[0].x, 9999, 'editor state must not be mutated');
});

test('loadFromMission: takes a loaded mission and returns editor state', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.title = 'Round Trip';
  s.steps.push({
    id: 'reach', title: 'Reach', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id },
  });

  const raw = ctx.MISSIONS.editor.state.serializeToMission(s);
  const mission = ctx.MISSIONS.loader.load(raw);
  const editorState = ctx.MISSIONS.editor.state.loadFromMission(mission);

  assert.strictEqual(editorState.title, 'Round Trip');
  assert.strictEqual(editorState.field.zones.length, 1);
  assert.strictEqual(editorState.steps.length, 1);
  assert.strictEqual(editorState.selection, null);
  assert.strictEqual(editorState.dirty, false);
});

test('validate: valid state returns { ok: true, mission }', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({
    id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id },
  });
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.mission.id, s.id);
});

test('validate: empty steps on mission-type returns { ok: false, error }', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /at least one step/);
});

test('validate: condition referencing a deleted zone returns ok:false', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  const zid = s.field.zones[0].id;
  s.steps.push({
    id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: zid },
  });
  s = ctx.MISSIONS.editor.state.deleteZone(s, zid);
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unknown zone/);
});
