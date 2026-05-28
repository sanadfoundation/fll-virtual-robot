'use strict';

// TDD tests for js/mission_field_swap.js.
// Uses the same makeMissionsEnv UMD-loading pattern as library.test.js,
// loading mission_field_swap.js into an isolated window-like context.

const test   = require('node:test');
const assert = require('node:assert');

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  const wrapped = '(function (window, self, globalThis) {\n' + code + '\n})';
  const fn = vm.runInThisContext(wrapped, { filename: relPath });
  fn(ctx, ctx, ctx);
}

function makeEnv() {
  const ctx = { MISSIONS: {} };
  loadInto(ctx, 'js/mission_field_swap.js');
  return ctx;
}

// ── zoneToFieldObject ─────────────────────────────────────────────────────────

test('zoneToFieldObject: maps {x,y,w,h,color} to a rect field object', () => {
  const { MISSIONS } = makeEnv();
  const fo = MISSIONS.fieldSwap.zoneToFieldObject({ x: 100, y: 200, w: 50, h: 60, color: 'red' });
  assert.strictEqual(fo.type, 'rect');
  assert.strictEqual(fo.x, 100);
  assert.strictEqual(fo.y, 200);
  assert.strictEqual(fo.w, 50);
  assert.strictEqual(fo.h, 60);
  assert.strictEqual(fo.sensorColor, 'red');
  assert.strictEqual(fo.lw, 2);
  assert.strictEqual(fo.fill,   'rgba(220,100,100,0.2)');
  assert.strictEqual(fo.stroke, '#cc4444');
});

test('zoneToFieldObject: each supported color maps to the right fill and stroke', () => {
  const { MISSIONS } = makeEnv();
  const zfo = MISSIONS.fieldSwap.zoneToFieldObject;
  const cases = [
    { color: 'red',    fill: 'rgba(220,100,100,0.2)',  stroke: '#cc4444' },
    { color: 'green',  fill: 'rgba(100,220,150,0.2)',  stroke: '#30c060' },
    { color: 'blue',   fill: 'rgba(100,150,220,0.2)',  stroke: '#3070c0' },
    { color: 'yellow', fill: 'rgba(255,200,100,0.2)',  stroke: '#f0a830' },
    { color: 'orange', fill: 'rgba(231,126,34,0.22)',  stroke: '#d06010' },
    { color: 'purple', fill: 'rgba(155,89,182,0.2)',   stroke: '#8030c0' },
  ];
  for (const { color, fill, stroke } of cases) {
    const fo = zfo({ x: 0, y: 0, w: 10, h: 10, color });
    assert.strictEqual(fo.fill,   fill,   `fill mismatch for ${color}`);
    assert.strictEqual(fo.stroke, stroke, `stroke mismatch for ${color}`);
  }
});

test('zoneToFieldObject: unknown color falls back to grey', () => {
  const { MISSIONS } = makeEnv();
  const fo = MISSIONS.fieldSwap.zoneToFieldObject({ x: 0, y: 0, w: 10, h: 10, color: 'chartreuse' });
  assert.strictEqual(fo.fill,   'rgba(200,200,200,0.2)');
  assert.strictEqual(fo.stroke, '#888');
});

// ── lineToFieldObject ─────────────────────────────────────────────────────────

test('lineToFieldObject: maps {x1,y1,x2,y2,color,thickness} to a line field object', () => {
  const { MISSIONS } = makeEnv();
  const fo = MISSIONS.fieldSwap.lineToFieldObject({ x1: 10, y1: 20, x2: 100, y2: 200, color: 'black', thickness: 6 });
  assert.strictEqual(fo.type, 'line');
  assert.strictEqual(fo.x1, 10);
  assert.strictEqual(fo.y1, 20);
  assert.strictEqual(fo.x2, 100);
  assert.strictEqual(fo.y2, 200);
  assert.strictEqual(fo.sensorColor, 'black');
  assert.strictEqual(fo.lw, 6);
  assert.strictEqual(fo.stroke, '#222');
});

test('lineToFieldObject: defaults lw to 4 when thickness is missing', () => {
  const { MISSIONS } = makeEnv();
  const fo = MISSIONS.fieldSwap.lineToFieldObject({ x1: 0, y1: 0, x2: 1, y2: 1, color: 'red' });
  assert.strictEqual(fo.lw, 4);
});

test('lineToFieldObject: line-color to stroke mapping for all named colors', () => {
  const { MISSIONS } = makeEnv();
  const lfo = MISSIONS.fieldSwap.lineToFieldObject;
  const cases = [
    { color: 'black',  stroke: '#222'     },
    { color: 'red',    stroke: '#cc4444'  },
    { color: 'green',  stroke: '#30c060'  },
    { color: 'blue',   stroke: '#3070c0'  },
    { color: 'yellow', stroke: '#d0a830'  },
    { color: 'orange', stroke: '#d06010'  },
  ];
  for (const { color, stroke } of cases) {
    const fo = lfo({ x1: 0, y1: 0, x2: 1, y2: 1, color });
    assert.strictEqual(fo.stroke, stroke, `stroke mismatch for line color ${color}`);
  }
});

// ── applyMissionField ─────────────────────────────────────────────────────────

test('applyMissionField: zones become rect field objects in fieldObjects', () => {
  const { MISSIONS } = makeEnv();
  const mf = {
    zones: [{ x: 10, y: 20, w: 50, h: 60, color: 'blue' }],
  };
  const { fieldObjects } = MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, null);
  assert.strictEqual(fieldObjects.length, 1);
  assert.strictEqual(fieldObjects[0].type, 'rect');
  assert.strictEqual(fieldObjects[0].sensorColor, 'blue');
});

test('applyMissionField: lines are appended after zones in fieldObjects', () => {
  const { MISSIONS } = makeEnv();
  const mf = {
    zones: [{ x: 0, y: 0, w: 10, h: 10, color: 'red' }],
    lines: [{ x1: 0, y1: 0, x2: 100, y2: 100, color: 'black', thickness: 4 }],
  };
  const { fieldObjects } = MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, null);
  assert.strictEqual(fieldObjects.length, 2);
  assert.strictEqual(fieldObjects[0].type, 'rect');
  assert.strictEqual(fieldObjects[1].type, 'line');
});

test('applyMissionField: calls physics.removeBody for each existing obstacle with a body', () => {
  const { MISSIONS } = makeEnv();
  const removedBodies = [];
  const physics = {
    removeBody: (b) => removedBodies.push(b),
    addObstacleBox: () => ({}),
    addWallBox: () => ({}),
  };
  const fakeBody1 = {};
  const fakeBody2 = {};
  const prev = {
    obstacles: [
      { body: fakeBody1, cfg: {} },
      { body: null, cfg: {} },      // no body — should not call removeBody
      { body: fakeBody2, cfg: {} },
    ],
    walls: [],
  };
  MISSIONS.fieldSwap.applyMissionField({}, prev, physics);
  assert.deepStrictEqual(removedBodies, [fakeBody1, fakeBody2]);
});

test('applyMissionField: calls physics.removeBody for each existing wall with a body', () => {
  const { MISSIONS } = makeEnv();
  const removedBodies = [];
  const physics = {
    removeBody: (b) => removedBodies.push(b),
    addObstacleBox: () => ({}),
    addWallBox: () => ({}),
  };
  const wallBody = {};
  const prev = {
    obstacles: [],
    walls: [{ body: wallBody, cfg: {} }],
  };
  MISSIONS.fieldSwap.applyMissionField({}, prev, physics);
  assert.deepStrictEqual(removedBodies, [wallBody]);
});

test('applyMissionField: returned obstacles have cfg from input and body from addObstacleBox', () => {
  const { MISSIONS } = makeEnv();
  const createdBody = { id: 'obs-body' };
  const physics = {
    removeBody: () => {},
    addObstacleBox: (hx, hy, pos) => createdBody,
    addWallBox: () => ({}),
  };
  const mf = { obstacles: [{ x: 100, y: 200, w: 80, h: 80, fill: '#f00', stroke: '#a00', label: 'A' }] };
  const { obstacles } = MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, physics);
  assert.strictEqual(obstacles.length, 1);
  assert.strictEqual(obstacles[0].cfg.x, 100);
  assert.strictEqual(obstacles[0].cfg.y, 200);
  assert.strictEqual(obstacles[0].cfg.w, 80);
  assert.strictEqual(obstacles[0].cfg.h, 80);
  assert.strictEqual(obstacles[0].body, createdBody);
});

test('applyMissionField: addObstacleBox called with w/2, h/2, {x, y}', () => {
  const { MISSIONS } = makeEnv();
  const calls = [];
  const physics = {
    removeBody: () => {},
    addObstacleBox: (hx, hy, pos) => { calls.push({ hx, hy, pos }); return {}; },
    addWallBox: () => ({}),
  };
  const mf = { obstacles: [{ x: 50, y: 60, w: 80, h: 40 }] };
  MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, physics);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].hx, 40);
  assert.strictEqual(calls[0].hy, 20);
  assert.deepStrictEqual(calls[0].pos, { x: 50, y: 60 });
});

test('applyMissionField: returned walls have cfg from input and body from addWallBox', () => {
  const { MISSIONS } = makeEnv();
  const wallBody = { id: 'wall-body' };
  const physics = {
    removeBody: () => {},
    addObstacleBox: () => ({}),
    addWallBox: (hx, hy, pos) => wallBody,
  };
  const mf = { walls: [{ x: 10, y: 20, w: 100, h: 30 }] };
  const { walls } = MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, physics);
  assert.strictEqual(walls.length, 1);
  assert.strictEqual(walls[0].cfg.x, 10);
  assert.strictEqual(walls[0].cfg.y, 20);
  assert.strictEqual(walls[0].body, wallBody);
});

test('applyMissionField: addWallBox called with w/2, h/2, {x, y}', () => {
  const { MISSIONS } = makeEnv();
  const calls = [];
  const physics = {
    removeBody: () => {},
    addObstacleBox: () => ({}),
    addWallBox: (hx, hy, pos) => { calls.push({ hx, hy, pos }); return {}; },
  };
  const mf = { walls: [{ x: 300, y: 400, w: 200, h: 60 }] };
  MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, physics);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].hx, 100);
  assert.strictEqual(calls[0].hy, 30);
  assert.deepStrictEqual(calls[0].pos, { x: 300, y: 400 });
});

test('applyMissionField: works with physics = null (bodies are null, no calls attempted)', () => {
  const { MISSIONS } = makeEnv();
  const mf = {
    obstacles: [{ x: 0, y: 0, w: 10, h: 10 }],
    walls:     [{ x: 0, y: 0, w: 10, h: 10 }],
  };
  let result;
  assert.doesNotThrow(() => {
    result = MISSIONS.fieldSwap.applyMissionField(mf, { obstacles: [], walls: [] }, null);
  });
  assert.strictEqual(result.obstacles[0].body, null);
  assert.strictEqual(result.walls[0].body, null);
});

test('applyMissionField: works with missing zones/obstacles/lines/walls keys', () => {
  const { MISSIONS } = makeEnv();
  let result;
  assert.doesNotThrow(() => {
    result = MISSIONS.fieldSwap.applyMissionField({}, { obstacles: [], walls: [] }, null);
  });
  assert.deepStrictEqual(result.fieldObjects, []);
  assert.deepStrictEqual(result.obstacles, []);
  assert.deepStrictEqual(result.walls, []);
});

// ── restoreDefaultObstacles ───────────────────────────────────────────────────

test('restoreDefaultObstacles: calls removeBody for each existing obstacle body and wall body', () => {
  const { MISSIONS } = makeEnv();
  const removed = [];
  const physics = {
    removeBody: (b) => removed.push(b),
    addObstacleBox: () => ({}),
  };
  const obsBody = {};
  const wallBody = {};
  const prev = {
    obstacles: [{ body: obsBody, cfg: {} }],
    walls:     [{ body: wallBody, cfg: {} }],
  };
  MISSIONS.fieldSwap.restoreDefaultObstacles([], prev, physics);
  assert.ok(removed.includes(obsBody), 'obstacle body should be removed');
  assert.ok(removed.includes(wallBody), 'wall body should be removed');
});

test('restoreDefaultObstacles: returns obstacles array from default configs via addObstacleBox', () => {
  const { MISSIONS } = makeEnv();
  const createdBody = { id: 'sandbox-body' };
  const physics = {
    removeBody: () => {},
    addObstacleBox: () => createdBody,
  };
  const defaults = [
    { x: 100, y: 200, w: 80, h: 80, fill: '#e67e22', stroke: '#a04d10', label: '1' },
  ];
  const { obstacles } = MISSIONS.fieldSwap.restoreDefaultObstacles(defaults, { obstacles: [], walls: [] }, physics);
  assert.strictEqual(obstacles.length, 1);
  assert.strictEqual(obstacles[0].cfg, defaults[0]);
  assert.strictEqual(obstacles[0].body, createdBody);
});

test('restoreDefaultObstacles: returns walls: []', () => {
  const { MISSIONS } = makeEnv();
  const physics = { removeBody: () => {}, addObstacleBox: () => ({}) };
  const { walls } = MISSIONS.fieldSwap.restoreDefaultObstacles([], { obstacles: [], walls: [] }, physics);
  assert.deepStrictEqual(walls, []);
});

test('restoreDefaultObstacles: works with physics = null', () => {
  const { MISSIONS } = makeEnv();
  const defaults = [{ x: 0, y: 0, w: 10, h: 10, fill: '#f00', stroke: '#a00', label: '1' }];
  let result;
  assert.doesNotThrow(() => {
    result = MISSIONS.fieldSwap.restoreDefaultObstacles(defaults, { obstacles: [], walls: [] }, null);
  });
  assert.strictEqual(result.obstacles[0].body, null);
  assert.deepStrictEqual(result.walls, []);
});
