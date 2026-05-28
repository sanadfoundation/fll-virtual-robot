'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

// Minimal DOM stub mirroring tests/js/mocks/main-env.js patterns.
function makeEl(tag) {
  const el = {
    tag, children: [],
    classList: { _set: new Set(),
      add(c)    { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); },
    },
    style: {}, dataset: {}, attrs: {},
    textContent: '', innerHTML: '', hidden: false,
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] || null; },
    addEventListener(name, cb) { (this._listeners = this._listeners || {})[name] = cb; },
    _click() { this._listeners && this._listeners.click && this._listeners.click(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  return el;
}

function makeDom() {
  const ids = {};
  function el(id) { return ids[id] = ids[id] || makeEl('div'); }
  return {
    getElementById(id) { return el(id); },
    createElement(tag) { return makeEl(tag); },
    ids,
  };
}

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_ui',
  ]).ctx;
}

const MISSION = {
  schema_version: 1, id: 'ui', title: 'UI Test Mission', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [
      { id: 'red',  shape: 'rect', x: 0,   y: 0, w: 10, h: 10, color: 'red'  },
      { id: 'blue', shape: 'rect', x: 100, y: 0, w: 10, h: 10, color: 'blue' },
    ],
    obstacles: [],
  },
  steps: [
    { id: 's1', title: 'Reach red', points: 10, hint: 'Drive forward.',
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
    { id: 's2', title: 'Finish strong', points: 15, requires: ['s1'],
      condition: { kind: 'zone', subject: 'robot', zone: 'blue' } },
  ],
  scoring: { kind: 'step_sum' },
};

test('mountMissionMap: hides panel when no mission is active', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  ui.render(null, null);
  assert.strictEqual(dom.getElementById('mission-map').hidden, true);
});

test('render: populates title, meta, max-score and step rows for a mission', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  const mission = ctx.MISSIONS.loader.load(MISSION);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  ui.render(mission, engine);
  assert.strictEqual(dom.getElementById('mission-map').hidden, false);
  assert.strictEqual(dom.getElementById('mm-title').textContent, 'UI Test Mission');
  assert.strictEqual(dom.getElementById('mm-score-max').textContent, '/25');
  assert.strictEqual(dom.getElementById('mm-steps').children.length, 2);
});

test('updateProgress: ticks the completed step row to .done and updates score', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  const mission = ctx.MISSIONS.loader.load(MISSION);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  ui.render(mission, engine);

  engine.start(0);
  engine.tick({
    robot: { x: 5, y: 5, heading: 0 }, obstacles: {}, sensors: {},
  });
  ui.updateProgress(engine);

  assert.strictEqual(dom.getElementById('mm-score-current').textContent, '10');
  // Two children, first is the row container for s1; check its class.
  const firstRow = dom.getElementById('mm-steps').children[0];
  assert.ok(firstRow.classList.contains('done'));
});

test('hint reveal: clicking the hint button shows the hint text', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  const mission = ctx.MISSIONS.loader.load(MISSION);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  ui.render(mission, engine);

  const firstRow = dom.getElementById('mm-steps').children[0];
  // Find the hint button. UI nests it as the second child group; tests can
  // call ui._test_revealHint(stepId) to skip the DOM-walk and exercise the
  // logic seam directly.
  ui._test_revealHint('s1');
  // Render again to flush.
  ui.updateProgress(engine);
  const hasReveal = JSON.stringify(firstRow.children).includes('Drive forward');
  assert.ok(hasReveal, 'hint text should be rendered after reveal');
});
