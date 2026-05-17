'use strict';

// Fixture-driven Blockly behaviour runner. Per audit 2026-05-13 §6.2 and the
// 2026-05-17 re-evaluation §6 item 3.
//
// generators-smoke.test.js only asserts that every generator returns a
// non-empty string. The two existing end-to-end Blockly tests
// (yaw-program-issue-9.test.js, event-hats-runtime.test.js) prove the
// pattern: build a program from real generators, run it via new AsyncFunction
// against a real RobotSimulator, assert on observable state.
//
// This file generalises that pattern: a single PROGRAM_FIXTURES array drives
// one node:test per entry. Adding a new behaviour test = one fixture row.
//
// The kinematic-physics stub from tests/js/kinematic-physics.js lets motion
// commands actually move the robot in the test environment.

const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');
const { installKinematicPhysics } = require('../kinematic-physics');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGenerators() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env;
}

// Render a single block by calling its generator with a synthetic block stub
// providing the named fields and (optionally) child-input statements.
function renderBlock(Blockly, type, fields = {}, inputs = {}) {
  const gen = Blockly.JavaScript[type];
  if (typeof gen !== 'function') {
    throw new Error(`No generator registered for block type '${type}'`);
  }
  const block = {
    getFieldValue: (name) => (name in fields ? fields[name] : null),
    getInputTargetBlock: (name) => inputs[name] || null,
  };
  const result = gen(block);
  if (Array.isArray(result)) return result[0];
  return String(result || '');
}

// Render a list of blocks (each `{type, fields}`) and concatenate.
function renderProgram(Blockly, blocks) {
  return blocks.map((b) => renderBlock(Blockly, b.type, b.fields || {}, b.inputs || {})).join('\n');
}

// Blockly's generateBlocklyJS() seeds program-scope state variables that
// individual generators reference (e.g. _motorSpeed, _moveSpeed, _distMoved).
// Mirror that preamble here so fixture code runs as if it had been driven
// from the real toolbox.
const BLOCKLY_PREAMBLE = [
  `var _moveSpeed     = 50;`,
  `var _motorSpeed    = 75;`,
  `var _movePairL     = 'A';`,
  `var _movePairR     = 'B';`,
  `var _moveRotMM     = ${(Math.PI * 56).toFixed(4)};`,
  `var _distMoved     = 0;`,
  `var _timerMs       = 0;`,
  `var _stopMethod    = '0';`,
  `var _moveAccel     = '3000 3000';`,
  `var _motorStop     = {};`,
  `var _motorAccel    = {};`,
  `var _motorRelOffset= {};`,
  `var _hats     = [];`,
  `var _mainBody = null;`,
  `var _hatBusy  = {};`,
  `var _hatPrev  = {};`,
  `var _hatFired = {};`,
  `var _t0       = 0;`,
].join('\n');

// Execute generated Blockly JS against a fresh sim. The async wrapper mirrors
// the runBlockly() flow in main.js: emitted code uses `await window.sim._*`,
// so the program body must be an async function. The runner pre-pairs A/B
// so motor_pair commands route correctly (the real flow does this through
// flippermove_setMovementPair generators; tests skip that detail).
async function runBlocklyProgram(programCode) {
  const sim = createSim();
  installKinematicPhysics(sim);
  sim.isRunning = true;
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });

  const win = { sim };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const fn = new AsyncFunction('window', BLOCKLY_PREAMBLE + '\n' + programCode);
  await fn(win);
  return sim;
}

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// Each fixture proves a specific Blockly block category drives the simulator
// to a documented end state. Adding a new fixture = one row.

const PROGRAM_FIXTURES = [
  {
    name: 'movement: move forward 10 rotations moves the robot forward',
    blocks: [
      {
        type: 'flippermove_move',
        fields: { DIRECTION: 'forward', VALUE: '10', UNIT: 'rotations' },
      },
    ],
    assert(sim) {
      // Spawn (350, 163) heading 90° (math y-up north). Forward = +y direction.
      assert.ok(sim.robot.y > 163 + 100,
        `forward motion should move +y; spawned at y=163, ended at y=${sim.robot.y}`);
    },
  },
  {
    name: 'motor: run motor A for 1 rotation accumulates ~360° on port A',
    blocks: [
      {
        type: 'flippermotor_motorTurnForDirection',
        fields: { PORT: 'A', DIRECTION: 'clockwise', VALUE: '1', UNIT: 'rotations' },
      },
    ],
    assert(sim) {
      const pos = sim.robot.motors.A;
      assert.ok(Math.abs(Math.abs(pos) - 360) < 60,
        `port A encoder should be ~±360° after 1 rotation, got ${pos}`);
    },
  },
  {
    name: 'motor stop: stopping motor A leaves the program running',
    blocks: [
      { type: 'flippermotor_motorStartDirection',
        fields: { PORT: 'A', DIRECTION: 'clockwise' } },
      { type: 'flippermotor_motorStop',
        fields: { PORT: 'A' } },
    ],
    assert(sim) {
      // Pre-fix: flippermotor_motorStop emitted window.sim.stop() which set
      // isRunning=false. Post-fix: motor_stop scopes to the named port.
      assert.strictEqual(sim.isRunning, true,
        'motor stop should NOT kill the whole sim (regression for the audit bug)');
    },
  },
];

// ── Driver ──────────────────────────────────────────────────────────────────

for (const fixture of PROGRAM_FIXTURES) {
  test(`blockly fixture: ${fixture.name}`, async () => {
    const { Blockly } = setupGenerators();
    const code = renderProgram(Blockly, fixture.blocks);
    const sim = await runBlocklyProgram(code);
    fixture.assert(sim);
  });
}
