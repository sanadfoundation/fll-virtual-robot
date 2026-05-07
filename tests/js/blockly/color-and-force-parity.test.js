'use strict';

// Tests for two Bucket 1 fixes from docs/audit/api-gap-report.md:
//   1.1 — Blockly color enum matches the LEGO word-block doc enum
//         (0=Black, 1=Violet, 3=Blue, 4=Light Blue, 6=Green, 7=Yellow,
//          9=Red, 10=White, -1=no color).
//   1.7 — Blockly force-sensor generators emit a _assertSensorAvailable
//         guard so the runtime errors match Python's RuntimeError when
//         no force sensor is configured.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGenerators() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env;
}

function makeFieldBlock(fields) {
  return {
    getFieldValue: (name) => fields[name] ?? '',
    getInputTargetBlock: () => null,
  };
}

function codeOf(result) {
  return Array.isArray(result) ? result[0] : result;
}

// ── 1.1 — Color enum mapping ───────────────────────────────────────────────

// Sim emits these tokens from _colorAtPosition / COLOR_MAP. The Blockly
// generator must compare against the right token for each documented index.
// Indexes 2 (Purple), 5 (Turquoise), 8 (Orange) are not exposed in word blocks
// and so don't need a mapping here.
const DOC_COLOR_INDEX_TO_SIM_TOKEN = {
  '-1': 'none',
  '0':  'black',
  '1':  'magenta',     // LEGO calls it Violet; sim token is 'magenta'
  '3':  'blue',
  '4':  'cyan',        // LEGO calls it Light Blue; sim token is 'cyan'
  '6':  'green',
  '7':  'yellow',
  '9':  'red',
  '10': 'white',
};

test('flippersensors_isColor: every doc index emits the right sim token', () => {
  const { Blockly } = setupGenerators();
  const fn = Blockly.JavaScript['flippersensors_isColor'];
  assert.ok(typeof fn === 'function', 'flippersensors_isColor not registered');

  for (const [idx, expected] of Object.entries(DOC_COLOR_INDEX_TO_SIM_TOKEN)) {
    const block = makeFieldBlock({ PORT: 'E', VALUE: idx });
    const code  = codeOf(fn(block));
    assert.ok(
      code.includes(`=== '${expected}'`),
      `value ${idx}: expected sim token '${expected}', got: ${code}`,
    );
  }
});

test('flippersensors_isColor: index 7 maps to yellow (was green in pre-fix bug)', () => {
  const { Blockly } = setupGenerators();
  const code = codeOf(
    Blockly.JavaScript['flippersensors_isColor'](makeFieldBlock({ VALUE: '7' })),
  );
  assert.ok(code.includes("=== 'yellow'"),
    `index 7 must map to 'yellow' per docs (Yellow=7), got: ${code}`);
  assert.ok(!code.includes("=== 'green'"),
    `index 7 must NOT map to 'green' (that was the pre-fix bug)`);
});

test('flippersensors_isColor: index 9 maps to red (was yellow in pre-fix bug)', () => {
  const { Blockly } = setupGenerators();
  const code = codeOf(
    Blockly.JavaScript['flippersensors_isColor'](makeFieldBlock({ VALUE: '9' })),
  );
  assert.ok(code.includes("=== 'red'"),
    `index 9 must map to 'red' per docs (Red=9), got: ${code}`);
});

test('flippersensors_color reporter: inverse mapping matches doc enum', () => {
  // The reporter emits an inline object literal; assert it has every
  // documented (token, index) pair.
  const { Blockly } = setupGenerators();
  const code = codeOf(Blockly.JavaScript['flippersensors_color'](makeFieldBlock({})));
  const expectedPairs = [
    ['black',   0],
    ['magenta', 1],
    ['blue',    3],
    ['cyan',    4],
    ['green',   6],
    ['yellow',  7],
    ['red',     9],
    ['white',  10],
    ['none',   -1],
  ];
  for (const [token, idx] of expectedPairs) {
    assert.ok(
      code.includes(`${token}:${idx}`),
      `inverse mapping must include ${token}:${idx}, got: ${code}`,
    );
  }
});

test('flippersensors_color reporter: pre-fix wrong pairs are gone', () => {
  const { Blockly } = setupGenerators();
  const code = codeOf(Blockly.JavaScript['flippersensors_color'](makeFieldBlock({})));
  // Pre-fix bug had violet:1 (not magenta), green:7 (not green:6), yellow:9.
  assert.ok(!code.includes('violet:1'),
    'inverse mapping must use sim token "magenta" not "violet" for value 1');
  assert.ok(!code.includes('green:7'),
    'inverse mapping must put green at 6, yellow at 7');
  assert.ok(!code.includes('yellow:9'),
    'inverse mapping must put yellow at 7, red at 9');
});

// ── 1.7 — Force-sensor parity guard ────────────────────────────────────────

test('flippersensors_isPressed emits _assertSensorAvailable("force_sensor")', () => {
  const { Blockly } = setupGenerators();
  const fn = Blockly.JavaScript['flippersensors_isPressed'];
  for (const opt of ['pressed', 'hard-pressed', 'released']) {
    const code = codeOf(fn(makeFieldBlock({ PORT: 'A', OPTION: opt })));
    assert.ok(
      code.includes("_assertSensorAvailable('force_sensor')"),
      `OPTION=${opt}: missing force_sensor guard, got: ${code}`,
    );
  }
});

test('flippersensors_force emits _assertSensorAvailable("force_sensor")', () => {
  const { Blockly } = setupGenerators();
  const fn = Blockly.JavaScript['flippersensors_force'];
  for (const unit of ['newton', '%']) {
    const code = codeOf(fn(makeFieldBlock({ PORT: 'A', UNIT: unit })));
    assert.ok(
      code.includes("_assertSensorAvailable('force_sensor')"),
      `UNIT=${unit}: missing force_sensor guard, got: ${code}`,
    );
  }
});
