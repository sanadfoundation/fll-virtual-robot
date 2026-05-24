'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine', 'mission_app',
  ]).ctx;
}

const MISSION = {
  schema_version: 1, id: 'app', title: 'App', type: 'mission', difficulty_tier: 'beginner',
  field: { robot_start: { x: 0, y: 0, heading: 0 }, zones: [], obstacles: [] },
  steps: [{ id: 'a', title: 'A', points: 1, condition: { kind: 'contact', obstacle: '__never__' } }],
  scoring: { kind: 'step_sum' },
};

test('app: starts in sandbox mode', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(app.mission, null);
});

test('app: enterPlay(mission) loads mission and switches mode', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  // load a self-consistent mission first
  const ok = JSON.parse(JSON.stringify(MISSION));
  ok.field.obstacles = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, label: '__never__' }];
  app.enterPlay(ctx.MISSIONS.loader.load(ok));
  assert.strictEqual(app.mode, 'play');
  assert.strictEqual(app.mission.id, 'app');
});

test('app: exitMission returns to sandbox and clears mission', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  const ok = JSON.parse(JSON.stringify(MISSION));
  ok.field.obstacles = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, label: '__never__' }];
  app.enterPlay(ctx.MISSIONS.loader.load(ok));
  app.exitMission();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(app.mission, null);
});

test('app: subscribers receive mode-change events', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  const events = [];
  app.onChange(e => events.push(e.mode));
  const ok = JSON.parse(JSON.stringify(MISSION));
  ok.field.obstacles = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, label: '__never__' }];
  app.enterPlay(ctx.MISSIONS.loader.load(ok));
  app.exitMission();
  assert.deepStrictEqual(events, ['play', 'sandbox']);
});

test('app: parseHash extracts mission id from "#mission=<id>"', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.app.parseHash('#mission=foo'), 'foo');
  assert.strictEqual(ctx.MISSIONS.app.parseHash('#mission=red-zone-then-push'), 'red-zone-then-push');
  assert.strictEqual(ctx.MISSIONS.app.parseHash(''), null);
  assert.strictEqual(ctx.MISSIONS.app.parseHash('#other=x'), null);
});
