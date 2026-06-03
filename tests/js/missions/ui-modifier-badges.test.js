'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function makeEl(tag) {
  const el = {
    tag, children: [], style: {}, attrs: {},
    textContent: '', hidden: false,
    classList: { _set: new Set(), add(c) { this._set.add(c); }, contains(c) { return this._set.has(c); } },
    get innerHTML() { return ''; },
    set innerHTML(v) { if (v === '' || v == null) this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] || null; },
    addEventListener() {},
  };
  return el;
}

function makeDom() {
  const ids = {};
  function el(id) { return (ids[id] = ids[id] || makeEl('div')); }
  return {
    getElementById(id) { return el(id); },
    createElement(tag)  { return makeEl(tag); },
    ids,
  };
}

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_ui',
  ]).ctx;
}

const BASE_MISSION = {
  schema_version: 1, id: 'bm', title: 'BM', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 's1', title: 'S1', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'red' } }],
  scoring: { kind: 'step_sum' },
};

function setup(missionOverrides) {
  const ctx = env();
  const doc = makeDom();
  const ui = ctx.MISSIONS.ui.mount(doc);
  const e  = new ctx.MISSIONS.engine.ChallengeEngine();
  const mission = ctx.MISSIONS.loader.load({ ...BASE_MISSION, ...(missionOverrides || {}) });
  e.load(mission);
  ui.render(mission, e);
  return { doc, ui };
}

test('ui: no modifier badges rendered when both disabled', () => {
  const { doc } = setup();
  const el = doc.getElementById('mm-modifiers');
  assert.ok(el, 'mm-modifiers element must exist');
  assert.strictEqual(el.children.length, 0);
});

test('ui: poke badge rendered when poke enabled', () => {
  const { doc } = setup({
    modifiers: { poke: { enabled: true, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
                 friction: { enabled: false, multiplier: 1.0 } },
  });
  const el = doc.getElementById('mm-modifiers');
  const badges = Array.from(el.children);
  assert.ok(badges.some(b => b.textContent.includes('Poke')), 'Poke badge must be present');
  assert.ok(badges.some(b => b.textContent.includes('0.4')), 'Severity value must appear');
});

test('ui: friction badge rendered when friction enabled', () => {
  const { doc } = setup({
    modifiers: { poke: { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
                 friction: { enabled: true, multiplier: 0.7 } },
  });
  const el = doc.getElementById('mm-modifiers');
  const badges = Array.from(el.children);
  assert.ok(badges.some(b => b.textContent.includes('Friction')), 'Friction badge must be present');
  assert.ok(badges.some(b => b.textContent.includes('0.7')), 'Multiplier value must appear');
});

test('ui: both badges rendered when both enabled', () => {
  const { doc } = setup({
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 10, severity: 0.5 },
                 friction: { enabled: true, multiplier: 0.8 } },
  });
  const el = doc.getElementById('mm-modifiers');
  assert.strictEqual(el.children.length, 2);
});
