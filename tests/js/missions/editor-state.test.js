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

test('addStep: appends a step with id, title, default points=10, default condition', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.addStep(s);
  assert.strictEqual(next.steps.length, 1);
  const step = next.steps[0];
  assert.match(step.id, /^s-/);
  assert.strictEqual(step.points, 10);
  assert.strictEqual(typeof step.title, 'string');
  // Default condition references no real zone yet; the loader will reject
  // until the author edits — that's fine pre-Playtest.
  assert.ok(step.condition, 'expected a default condition placeholder');
});

test('editStep: updates the named step fields', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);
  const id = next.steps[0].id;
  next = ctx.MISSIONS.editor.state.editStep(next, id, {
    title: 'Reach red', points: 25, hint: 'Drive east',
  });
  assert.strictEqual(next.steps[0].title, 'Reach red');
  assert.strictEqual(next.steps[0].points, 25);
  assert.strictEqual(next.steps[0].hint, 'Drive east');
});

test('deleteStep: removes the step and scrubs requires references on remaining steps', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);  // step 1
  next = ctx.MISSIONS.editor.state.addStep(next);    // step 2
  const [a, b] = next.steps;
  next = ctx.MISSIONS.editor.state.editStep(next, b.id, { requires: [a.id] });
  next = ctx.MISSIONS.editor.state.deleteStep(next, a.id);
  assert.strictEqual(next.steps.length, 1);
  assert.deepStrictEqual(next.steps[0].requires || [], []);
});

test('reorderStep: moves the named step to the given index', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);
  next = ctx.MISSIONS.editor.state.addStep(next);
  next = ctx.MISSIONS.editor.state.addStep(next);
  const [a, b, c] = next.steps;
  next = ctx.MISSIONS.editor.state.reorderStep(next, c.id, 0);
  assert.deepStrictEqual(next.steps.map(x => x.id), [c.id, a.id, b.id]);
});

test('editStep: updating the condition replaces it whole', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.addStep(s);
  const id = next.steps[0].id;
  const newCond = { kind: 'contact', obstacle: 'whatever' };
  next = ctx.MISSIONS.editor.state.editStep(next, id, { condition: newCond });
  assert.deepStrictEqual(next.steps[0].condition, newCond);
});

// ─── setMeta: scoring auto-swap on type change ─────────────────────────────

test('setMeta: changing type to obstacle_course rewrites scoring.kind to objective_minus_penalties', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  // s.type starts as 'mission' with scoring.kind = 'step_sum'.
  assert.strictEqual(s.type, 'mission');
  assert.strictEqual(s.scoring.kind, 'step_sum');
  const next = ctx.MISSIONS.editor.state.setMeta(s, { type: 'obstacle_course' });
  assert.strictEqual(next.type, 'obstacle_course');
  assert.strictEqual(next.scoring.kind, 'objective_minus_penalties');
});

test('setMeta: obstacle_course default scoring has a goal_zone slot (so the loader is happy)', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.setMeta(s, { type: 'obstacle_course' });
  // goal_zone is optional but the structure must exist for the picker to fill in.
  assert.ok('goal_zone' in next.scoring, 'expected scoring.goal_zone to be present');
});

test('setMeta: changing type back to mission restores step_sum scoring', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  let next = ctx.MISSIONS.editor.state.setMeta(s,    { type: 'obstacle_course' });
  next     = ctx.MISSIONS.editor.state.setMeta(next, { type: 'mission' });
  assert.strictEqual(next.scoring.kind, 'step_sum');
});

test('setMeta: changing description does NOT touch scoring', () => {
  const { ctx, s } = FIELD_OPS_BASE();
  const next = ctx.MISSIONS.editor.state.setMeta(s, { description: 'hello' });
  assert.deepStrictEqual(next.scoring, s.scoring);
});

test('setZoneLabel: sets label on the matching zone', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  const id = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.setZoneLabel(s, id, 'Goal A');
  assert.strictEqual(s.field.zones[0].label, 'Goal A');
  assert.strictEqual(s.dirty, true);
});

test('setZoneLabel: no-op on unknown id', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  const before = JSON.stringify(s.field.zones[0]);
  s = ctx.MISSIONS.editor.state.setZoneLabel(s, 'bad-id', 'Oops');
  assert.strictEqual(JSON.stringify(s.field.zones[0]), before);
});

test('setZoneLabel: does not affect other zones', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 500, y: 500 });
  const id0 = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.setZoneLabel(s, id0, 'Zone A');
  assert.strictEqual(s.field.zones[0].label, 'Zone A');
  assert.strictEqual(s.field.zones[1].label, undefined);
});
