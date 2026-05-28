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

function base() {
  const ctx = env();
  return { ctx, s: ctx.MISSIONS.editor.state.createBlank() };
}

// ─── addLine ────────────────────────────────────────────────────────────────

test('addLine: appends a line with unique id, given coordinates, default color black, default thickness 4', () => {
  const { ctx, s } = base();
  const next = ctx.MISSIONS.editor.state.addLine(s, { x1: 100, y1: 200, x2: 300, y2: 400 });
  assert.strictEqual(next.field.lines.length, 1);
  const l = next.field.lines[0];
  assert.strictEqual(typeof l.id, 'string');
  assert.ok(l.id.length > 0, 'id must not be empty');
  assert.strictEqual(l.x1, 100);
  assert.strictEqual(l.y1, 200);
  assert.strictEqual(l.x2, 300);
  assert.strictEqual(l.y2, 400);
  assert.strictEqual(l.color, 'black');
  assert.strictEqual(l.thickness, 4);
  assert.strictEqual(next.dirty, true);
});

test('addLine: returns fresh id on each call (no collisions across three calls)', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s,    { x1: 0, y1: 0, x2: 1, y2: 1 });
  next = ctx.MISSIONS.editor.state.addLine(next, { x1: 0, y1: 0, x2: 1, y2: 1 });
  next = ctx.MISSIONS.editor.state.addLine(next, { x1: 0, y1: 0, x2: 1, y2: 1 });
  const ids = next.field.lines.map(l => l.id);
  assert.strictEqual(new Set(ids).size, 3, `expected 3 unique ids, got ${JSON.stringify(ids)}`);
});

// ─── moveLineEndpoint ───────────────────────────────────────────────────────

test('moveLineEndpoint(state, id, "a", {x,y}) updates only x1,y1 for that line', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 10, y1: 20, x2: 30, y2: 40 });
  const id = next.field.lines[0].id;
  next = ctx.MISSIONS.editor.state.moveLineEndpoint(next, id, 'a', { x: 99, y: 88 });
  const l = next.field.lines[0];
  assert.strictEqual(l.x1, 99);
  assert.strictEqual(l.y1, 88);
  assert.strictEqual(l.x2, 30, 'x2 must be unchanged');
  assert.strictEqual(l.y2, 40, 'y2 must be unchanged');
});

test('moveLineEndpoint(state, id, "b", {x,y}) updates only x2,y2 for that line', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 10, y1: 20, x2: 30, y2: 40 });
  const id = next.field.lines[0].id;
  next = ctx.MISSIONS.editor.state.moveLineEndpoint(next, id, 'b', { x: 77, y: 66 });
  const l = next.field.lines[0];
  assert.strictEqual(l.x1, 10, 'x1 must be unchanged');
  assert.strictEqual(l.y1, 20, 'y1 must be unchanged');
  assert.strictEqual(l.x2, 77);
  assert.strictEqual(l.y2, 66);
});

test('moveLineEndpoint: non-existent id is a no-op (does not throw)', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 10, y1: 20, x2: 30, y2: 40 });
  assert.doesNotThrow(() => {
    next = ctx.MISSIONS.editor.state.moveLineEndpoint(next, 'no-such-id', 'a', { x: 0, y: 0 });
  });
  // Original line is untouched
  assert.strictEqual(next.field.lines[0].x1, 10);
});

// ─── setLineProps ───────────────────────────────────────────────────────────

test('setLineProps: {color:"red"} updates color only; thickness and coords untouched', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 1, y1: 2, x2: 3, y2: 4 });
  const id = next.field.lines[0].id;
  next = ctx.MISSIONS.editor.state.setLineProps(next, id, { color: 'red' });
  const l = next.field.lines[0];
  assert.strictEqual(l.color, 'red');
  assert.strictEqual(l.thickness, 4,  'thickness must be unchanged');
  assert.strictEqual(l.x1, 1, 'x1 must be unchanged');
});

test('setLineProps: {thickness:8} updates thickness only; color and coords untouched', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 1, y1: 2, x2: 3, y2: 4 });
  const id = next.field.lines[0].id;
  next = ctx.MISSIONS.editor.state.setLineProps(next, id, { thickness: 8 });
  const l = next.field.lines[0];
  assert.strictEqual(l.thickness, 8);
  assert.strictEqual(l.color, 'black', 'color must be unchanged');
  assert.strictEqual(l.x1, 1, 'x1 must be unchanged');
});

test('setLineProps: unknown patch keys are ignored (no throw, other props stable)', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 1, y1: 2, x2: 3, y2: 4 });
  const id = next.field.lines[0].id;
  assert.doesNotThrow(() => {
    next = ctx.MISSIONS.editor.state.setLineProps(next, id, { flavor: 'banana' });
  });
  assert.strictEqual(next.field.lines[0].color, 'black');
});

// ─── deleteLine ─────────────────────────────────────────────────────────────

test('deleteLine: removes the named line; other lines are untouched', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s,    { x1: 0, y1: 0, x2: 1, y2: 1 });
  next = ctx.MISSIONS.editor.state.addLine(next, { x1: 5, y1: 5, x2: 6, y2: 6 });
  const [a, b] = next.field.lines;
  next = ctx.MISSIONS.editor.state.deleteLine(next, a.id);
  assert.strictEqual(next.field.lines.length, 1);
  assert.strictEqual(next.field.lines[0].id, b.id);
});

test('deleteLine: non-existent id is a no-op (does not throw)', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addLine(s, { x1: 0, y1: 0, x2: 1, y2: 1 });
  assert.doesNotThrow(() => {
    next = ctx.MISSIONS.editor.state.deleteLine(next, 'no-such-id');
  });
  assert.strictEqual(next.field.lines.length, 1);
});

// ─── addWall ────────────────────────────────────────────────────────────────

test('addWall: appends a wall with unique id, given position, default size 200×80', () => {
  const { ctx, s } = base();
  const next = ctx.MISSIONS.editor.state.addWall(s, { x: 400, y: 300 });
  assert.strictEqual(next.field.walls.length, 1);
  const w = next.field.walls[0];
  assert.strictEqual(typeof w.id, 'string');
  assert.ok(w.id.length > 0, 'id must not be empty');
  assert.strictEqual(w.shape, 'rect');
  assert.strictEqual(w.x, 400);
  assert.strictEqual(w.y, 300);
  assert.strictEqual(w.w, 200);
  assert.strictEqual(w.h, 80);
  assert.strictEqual(next.dirty, true);
});

// ─── moveWall ───────────────────────────────────────────────────────────────

test('moveWall: updates only position; size and id are untouched', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addWall(s, { x: 10, y: 20 });
  const id = next.field.walls[0].id;
  next = ctx.MISSIONS.editor.state.moveWall(next, id, { x: 500, y: 600 });
  const w = next.field.walls[0];
  assert.strictEqual(w.x, 500);
  assert.strictEqual(w.y, 600);
  assert.strictEqual(w.w, 200, 'w must be unchanged');
  assert.strictEqual(w.h, 80,  'h must be unchanged');
});

// ─── resizeWall ─────────────────────────────────────────────────────────────

test('resizeWall: updates only size; position is untouched', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addWall(s, { x: 10, y: 20 });
  const id = next.field.walls[0].id;
  next = ctx.MISSIONS.editor.state.resizeWall(next, id, { w: 350, h: 50 });
  const w = next.field.walls[0];
  assert.strictEqual(w.w, 350);
  assert.strictEqual(w.h, 50);
  assert.strictEqual(w.x, 10, 'x must be unchanged');
  assert.strictEqual(w.y, 20, 'y must be unchanged');
});

// ─── deleteWall ─────────────────────────────────────────────────────────────

test('deleteWall: removes the named wall; non-existent id is a no-op', () => {
  const { ctx, s } = base();
  let next = ctx.MISSIONS.editor.state.addWall(s,    { x: 0, y: 0 });
  next = ctx.MISSIONS.editor.state.addWall(next, { x: 100, y: 100 });
  const [a, b] = next.field.walls;
  // Delete a; b should remain.
  next = ctx.MISSIONS.editor.state.deleteWall(next, a.id);
  assert.strictEqual(next.field.walls.length, 1);
  assert.strictEqual(next.field.walls[0].id, b.id);
  // Delete non-existent id — should not throw.
  assert.doesNotThrow(() => {
    next = ctx.MISSIONS.editor.state.deleteWall(next, 'no-such-id');
  });
  assert.strictEqual(next.field.walls.length, 1);
});
