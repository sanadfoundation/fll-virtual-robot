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
