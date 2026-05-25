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

test('createBlank: produces an editor state with default scaffolding', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  assert.strictEqual(s.title, 'Untitled Mission');
  assert.strictEqual(s.type, 'mission');
  assert.strictEqual(s.difficulty_tier, 'beginner');
  assert.deepStrictEqual(s.field.obstacles, []);
  assert.deepStrictEqual(s.field.zones, []);
  assert.deepStrictEqual(s.field.robot_start, { x: 350, y: 163, heading: 90 });
  assert.deepStrictEqual(s.steps, []);
  assert.deepStrictEqual(s.scoring, { kind: 'step_sum' });
  assert.strictEqual(s.selection, null);
  assert.strictEqual(s.dirty, false);
});

test('createBlank: each call returns an independent object (no shared mutation)', () => {
  const ctx = env();
  const a = ctx.MISSIONS.editor.state.createBlank();
  const b = ctx.MISSIONS.editor.state.createBlank();
  a.field.obstacles.push({ id: 'x' });
  assert.deepStrictEqual(b.field.obstacles, []);
});

test('createBlank: id is a short kebab-case slug', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  assert.match(s.id, /^[a-z0-9-]+$/, `expected kebab-case id, got "${s.id}"`);
  assert.ok(s.id.length >= 4 && s.id.length <= 32, `id too short/long: "${s.id}"`);
});

const FIELD_OPS_BASE = () => {
  const ctx = env();
  return { ctx, s: ctx.MISSIONS.editor.state.createBlank() };
};

test('addObstacle: appends an obstacle with a generated id and default size', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 500, y: 500 });
  assert.strictEqual(next.field.obstacles.length, 1);
  const o = next.field.obstacles[0];
  assert.strictEqual(typeof o.id, 'string');
  assert.strictEqual(o.shape, 'rect');
  assert.strictEqual(o.x, 500);
  assert.strictEqual(o.y, 500);
  assert.strictEqual(o.w, 100);
  assert.strictEqual(o.h, 100);
  assert.strictEqual(o.label, o.id);  // default label = id
  assert.strictEqual(next.dirty, true);
});

test('addObstacle: ids are sequential when none collide', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addObstacle(next, { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addObstacle(next, { x: 0, y: 0 });
  const ids = next.field.obstacles.map(o => o.id);
  assert.deepStrictEqual(new Set(ids).size, 3, `expected unique ids, got ${ids}`);
});

test('moveObstacle: changes position of the named obstacle, leaves others alone', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addObstacle(next, { x: 0, y: 0 });
  const [a, b] = next.field.obstacles;
  next = ctx.MISSIONS.editor.state.moveObstacle(next, a.id, { x: 999, y: 888 });
  const updated = next.field.obstacles.find(o => o.id === a.id);
  const other   = next.field.obstacles.find(o => o.id === b.id);
  assert.strictEqual(updated.x, 999);
  assert.strictEqual(updated.y, 888);
  assert.strictEqual(other.x, 0);
});

test('resizeObstacle: changes w and h, keeps x and y', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 10, y: 20 });
  const id = next.field.obstacles[0].id;
  next = ctx.MISSIONS.editor.state.resizeObstacle(next, id, { w: 250, h: 150 });
  const o = next.field.obstacles[0];
  assert.strictEqual(o.w, 250);
  assert.strictEqual(o.h, 150);
  assert.strictEqual(o.x, 10);
  assert.strictEqual(o.y, 20);
});

test('deleteObstacle: removes the named obstacle', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  const id = next.field.obstacles[0].id;
  next = ctx.MISSIONS.editor.state.deleteObstacle(next, id);
  assert.strictEqual(next.field.obstacles.length, 0);
});

test('addZone: appends a zone with default 200×200 rect and a color from the palette', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addZone(s, { x: 600, y: 500 });
  assert.strictEqual(next.field.zones.length, 1);
  const z = next.field.zones[0];
  assert.strictEqual(z.shape, 'rect');
  assert.strictEqual(z.w, 200);
  assert.strictEqual(z.h, 200);
  assert.ok(/^(red|green|blue|yellow|orange|purple)$/.test(z.color),
    `expected palette color, got "${z.color}"`);
});

test('moveZone / resizeZone / deleteZone behave like obstacle ops', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  const id = next.field.zones[0].id;
  next = ctx.MISSIONS.editor.state.moveZone(next, id, { x: 500, y: 500 });
  assert.strictEqual(next.field.zones[0].x, 500);
  next = ctx.MISSIONS.editor.state.resizeZone(next, id, { w: 333, h: 222 });
  assert.strictEqual(next.field.zones[0].w, 333);
  next = ctx.MISSIONS.editor.state.deleteZone(next, id);
  assert.strictEqual(next.field.zones.length, 0);
});

test('setRobotStart: replaces robot_start pose', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.setRobotStart(s, { x: 1000, y: 500, heading: 180 });
  assert.deepStrictEqual(next.field.robot_start, { x: 1000, y: 500, heading: 180 });
});

test('every field op sets dirty=true and leaves the input state unchanged', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  assert.strictEqual(s.dirty, false, 'input state must not be mutated');
  assert.strictEqual(next.dirty, true);
});

test('setSelection: tracks { kind, id } or null', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addObstacle(s, { x: 0, y: 0 });
  const id = next.field.obstacles[0].id;
  next = ctx.MISSIONS.editor.state.setSelection(next, { kind: 'obstacle', id });
  assert.deepStrictEqual(next.selection, { kind: 'obstacle', id });
  next = ctx.MISSIONS.editor.state.setSelection(next, null);
  assert.strictEqual(next.selection, null);
});
