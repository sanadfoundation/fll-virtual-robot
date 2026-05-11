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
    Blockly.JavaScript['flippersensors_isColor'](makeFieldBlock({ PORT: 'E', VALUE: '7' })),
  );
  assert.ok(code.includes("=== 'yellow'"),
    `index 7 must map to 'yellow' per docs (Yellow=7), got: ${code}`);
  assert.ok(!code.includes("=== 'green'"),
    `index 7 must NOT map to 'green' (that was the pre-fix bug)`);
});

test('flippersensors_isColor: index 9 maps to red (was yellow in pre-fix bug)', () => {
  const { Blockly } = setupGenerators();
  const code = codeOf(
    Blockly.JavaScript['flippersensors_isColor'](makeFieldBlock({ PORT: 'E', VALUE: '9' })),
  );
  assert.ok(code.includes("=== 'red'"),
    `index 9 must map to 'red' per docs (Red=9), got: ${code}`);
});

test('flippersensors_color reporter: inverse mapping matches doc enum', () => {
  // The reporter emits an inline object literal; assert it has every
  // documented (token, index) pair. PORT=E is the canonical color-sensor port
  // — non-canonical ports route to the wrong-port warn path instead.
  const { Blockly } = setupGenerators();
  const code = codeOf(Blockly.JavaScript['flippersensors_color'](makeFieldBlock({ PORT: 'E' })));
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
  const code = codeOf(Blockly.JavaScript['flippersensors_color'](makeFieldBlock({ PORT: 'E' })));
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
  // PORT=C is the canonical force-sensor wiring. The _assertSensorAvailable
  // guard mirrors py/spike_bridge.py's RuntimeError when nothing is wired.
  const { Blockly } = setupGenerators();
  const fn = Blockly.JavaScript['flippersensors_isPressed'];
  for (const opt of ['pressed', 'hard-pressed', 'released']) {
    const code = codeOf(fn(makeFieldBlock({ PORT: 'C', OPTION: opt })));
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
    const code = codeOf(fn(makeFieldBlock({ PORT: 'C', UNIT: unit })));
    assert.ok(
      code.includes("_assertSensorAvailable('force_sensor')"),
      `UNIT=${unit}: missing force_sensor guard, got: ${code}`,
    );
  }
});

// ── Canonical-port validation: sensor reporters ────────────────────────────
// The simulator wires the colour sensor to E, the distance sensor to F, and
// the force sensor to C (mirror of PORT_CONFIG in js/simulator.js). Reporters
// whose PORT dropdown picks a different port emit a one-shot warn and return
// a safe sentinel — they can't be reading a sensor that doesn't exist.

// Pairs cover every reporter + a non-canonical port + the kind label its
// emitted warn-message uses + the safe sentinel that replaces the real read.
const WRONG_PORT_CASES = [
  { gen: 'flippersensors_isColor',        port: 'A', kind: 'colour-sensor',   canonical: 'E', safe: 'false' },
  { gen: 'flippersensors_color',          port: 'A', kind: 'colour-sensor',   canonical: 'E', safe: '-1' },
  { gen: 'flippersensors_isReflectivity', port: 'B', kind: 'colour-sensor',   canonical: 'E', safe: 'false' },
  { gen: 'flippersensors_reflectivity',   port: 'B', kind: 'colour-sensor',   canonical: 'E', safe: '0' },
  { gen: 'flippersensors_isPressed',      port: 'A', kind: 'force-sensor',    canonical: 'C', safe: 'false' },
  { gen: 'flippersensors_force',          port: 'A', kind: 'force-sensor',    canonical: 'C', safe: '0' },
  { gen: 'flippersensors_isDistance',     port: 'A', kind: 'distance-sensor', canonical: 'F', safe: 'false' },
  { gen: 'flippersensors_distance',       port: 'A', kind: 'distance-sensor', canonical: 'F', safe: '-1' },
];

for (const { gen, port, kind, canonical, safe } of WRONG_PORT_CASES) {
  test(`${gen}: non-canonical PORT=${port} emits warn-once + ${safe} fallback`, () => {
    const { Blockly } = setupGenerators();
    const fn = Blockly.JavaScript[gen];
    assert.ok(typeof fn === 'function', `${gen} not registered`);
    // Supply every field the reporter might read so generators don't crash on
    // undefined lookups for COMPARATOR / UNIT / OPTION etc.
    const code = codeOf(fn(makeFieldBlock({
      PORT: port, VALUE: '0', COMPARATOR: '<', UNIT: 'cm', OPTION: 'pressed',
    })));
    // The warn message names the kind, the wrong port, and the canonical port.
    assert.ok(code.includes(`no ${kind} on port ${port}`),
      `${gen}: warn message missing "no ${kind} on port ${port}", got: ${code}`);
    assert.ok(code.includes(`wired to port ${canonical}`),
      `${gen}: warn message missing "wired to port ${canonical}", got: ${code}`);
    // The wrong-port branch must not reach into window.sim — that's the whole
    // point. (Some generators reference window.sim only inside the canonical
    // branch; this assertion guards against accidentally inlining a real read
    // alongside the warn.)
    assert.ok(!code.includes('window.sim.getColorSensorColor()')
           && !code.includes('window.sim.getColorSensorReflection()')
           && !code.includes('window.sim.getForceSensorPressed()')
           && !code.includes('window.sim.getForceSensorValue()')
           && !code.includes('window.sim.getDistanceSensorValue()')
           && !code.includes('_assertSensorAvailable'),
      `${gen}: non-canonical path must not invoke real sensor accessors, got: ${code}`);
    // Sentinel is the trailing arm of the comma expression. Checking that the
    // safe literal appears anywhere is enough — the dedup-Set boilerplate
    // never re-uses 'false' / '-1' / '0' on its own.
    assert.ok(code.includes(safe),
      `${gen}: expected safe sentinel '${safe}', got: ${code}`);
    // Dedup primitive: a Set on window keyed by `${kind}:${port}`.
    assert.ok(code.includes('_sensorPortWarns'),
      `${gen}: missing dedup Set, got: ${code}`);
    assert.ok(code.includes(`${kind}:${port}`),
      `${gen}: dedup key should embed kind:port, got: ${code}`);
  });
}

test('canonical port still reads the real sensor (sanity)', () => {
  // Inverse of the wrong-port cases — when PORT matches PORT_CONFIG the
  // generator must keep emitting the real window.sim accessor.
  const { Blockly } = setupGenerators();
  const cases = [
    { gen: 'flippersensors_isColor',        port: 'E', needle: 'getColorSensorColor' },
    { gen: 'flippersensors_color',          port: 'E', needle: 'getColorSensorColor' },
    { gen: 'flippersensors_isReflectivity', port: 'E', needle: 'getColorSensorReflection' },
    { gen: 'flippersensors_reflectivity',   port: 'E', needle: 'getColorSensorReflection' },
    { gen: 'flippersensors_isPressed',      port: 'C', needle: 'getForceSensorPressed' },
    { gen: 'flippersensors_force',          port: 'C', needle: 'getForceSensorValue' },
    { gen: 'flippersensors_isDistance',     port: 'F', needle: 'getDistanceSensorValue' },
    { gen: 'flippersensors_distance',       port: 'F', needle: 'getDistanceSensorValue' },
  ];
  for (const { gen, port, needle } of cases) {
    const code = codeOf(Blockly.JavaScript[gen](makeFieldBlock({
      PORT: port, VALUE: '0', COMPARATOR: '<', UNIT: 'cm', OPTION: 'pressed',
    })));
    assert.ok(code.includes(needle),
      `${gen}@${port}: canonical path must call ${needle}, got: ${code}`);
    assert.ok(!code.includes('_sensorPortWarns'),
      `${gen}@${port}: canonical path must not emit wrong-port warn, got: ${code}`);
  }
});
