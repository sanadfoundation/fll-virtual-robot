'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence', 'mission_library',
    'mission_ui', 'mission_app',
  ]).ctx;
}

function dom() {
  const ids = {};
  const make = () => ({
    children: [], style: {}, dataset: {}, textContent: '', innerHTML: '', hidden: false,
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                 contains(c){return this._s.has(c);}, toggle(c, on){ on ? this._s.add(c) : this._s.delete(c); } },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(n, cb){ (this._l = this._l || {})[n] = cb; },
    _click() { this._l && this._l.click && this._l.click(); },
    setAttribute(){}, getAttribute(){ return null; },
  });
  return {
    getElementById(id) { return ids[id] = ids[id] || make(); },
    createElement() { return make(); },
    ids,
  };
}

function stubSim() {
  const contactSubs = new Set();
  return {
    robot: { x: 0, y: 0, heading: 0 },
    getStateSnapshot() {
      return { robot: this.robot, obstacles: { '1': { x: 1700, y: 943 } }, sensors: {} };
    },
    onObstacleContact(cb) { contactSubs.add(cb); return () => contactSubs.delete(cb); },
    _fireContact(id) { for (const cb of contactSubs) cb(id); },
    placeRobot(x, y, heading) { this.robot = { x, y, heading }; },
  };
}

const TEST_MISSION = {
  schema_version: 1, id: 'red-zone-then-push', title: 'Red Zone', type: 'mission',
  difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 350, y: 163, heading: 90 },
    zones:     [{ id: 'red', shape: 'rect', x: 1900, y: 243, w: 200, h: 200, color: 'red' }],
    obstacles: [{ id: '1',   shape: 'rect', x: 1700, y: 943, w: 100, h: 100, label: '1' }],
  },
  steps: [
    { id: 'reach-red', title: 'Reach the red zone', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
  ],
  scoring: { kind: 'step_sum' },
};

function fetchOk(payload) {
  return async () => ({ ok: true, json: async () => payload });
}

test('bootMissions: no hash → app stays in sandbox, panel hidden', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '' }, fetch: fetchOk(TEST_MISSION),
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(doc.getElementById('mission-map').hidden, true);
});

test('bootMissions: #mission=<id> → fetches mission, switches to Play, renders panel', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;

  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (url === 'missions/red-zone-then-push/mission.json') {
      return { ok: true, json: async () => TEST_MISSION };
    }
    return { ok: false, status: 404 };
  };

  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '#mission=red-zone-then-push' }, fetch,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });

  assert.deepStrictEqual(calls, ['missions/red-zone-then-push/mission.json']);
  assert.strictEqual(app.mode, 'play');
  assert.strictEqual(doc.getElementById('mission-map').hidden, false);
  assert.strictEqual(doc.getElementById('mm-title').textContent, 'Red Zone');
});

test('bootMissions: clicking Exit Mission returns to sandbox', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;
  const fetch = async () => ({ ok: true, json: async () => TEST_MISSION });
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '#mission=red-zone-then-push' }, fetch,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  doc.getElementById('mm-exit')._click();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(doc.getElementById('mission-map').hidden, true);
});

test('bootMissions: tick after sim state change updates mission progress', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;
  const fetch = async () => ({ ok: true, json: async () => TEST_MISSION });
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '#mission=red-zone-then-push' }, fetch,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    autoStart: true,  // skip waiting for the user's Run click during tests
  });

  // Move the robot into the red zone and tick once.
  sim.placeRobot(2000, 343, 90);
  app._tickOnce();

  assert.strictEqual(doc.getElementById('mm-score-current').textContent, '10');
});
