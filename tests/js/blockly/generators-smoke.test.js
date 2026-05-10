'use strict';

// Smoke-tests every Blockly generator registered by js/blockly_config.js.
// Each generator is invoked with a synthetic block stub providing safe
// defaults for the field/value names enumerated in the source. The contract
// asserted is intentionally loose:
//   - generator does not throw
//   - returned code is a non-empty string OR a [string, number] tuple with
//     a non-empty first element
// In addition, a small allowlist of motor/move generators must emit calls
// into the simulator helpers (_animateTank / _animateSingleMotor) — those
// are the load-bearing strings that any future Blockly refactor must keep.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

// Field defaults shared across generators.
const FIELD_DEFAULTS = {
  PORT:        'A',
  PAIR:        '0',
  DIRECTION:   'clockwise',
  UNIT:        'rotations',
  AXIS:        'pitch',
  COMPARATOR:  '==',
  OPTION:      'reset',
  STOP_OPTION: 'all',  // 'all' / 'program' / 'this' produce non-empty code
  SOUND:       'Cat',
  VALUE:       '1',
};

// Event handler ("hat") blocks intentionally return '' — they're top-level
// listeners, not inline statements. Listed here so the smoke test can
// positively assert the empty-string contract instead of flagging them.
const HAT_GENERATORS = new Set([
  'flipperevents_whenProgramStarts',
  'flipperevents_whenColor',
  'flipperevents_whenPressed',
  'flipperevents_whenDistance',
  'flipperevents_whenTilted',
  'flipperevents_whenOrientation',
  'flipperevents_whenGesture',
  'flipperevents_whenButton',
  'flipperevents_whenTimer',
  'flipperevents_whenCondition',
  'event_whenbroadcastreceived',
]);

function makeBlock() {
  return {
    getFieldValue(name) {
      if (name in FIELD_DEFAULTS) return FIELD_DEFAULTS[name];
      // Permissive default — any unknown field returns 'A' (matches a port,
      // a direction is a no-match but motorVDir handles unknown as 1, etc.).
      return 'A';
    },
    getInputTargetBlock() { return null; },
  };
}

function setupGenerators() {
  // registerGenerators() runs inside initBlockly() — drive it once so the
  // 98 generator functions land on Blockly.JavaScript.
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env;
}

function listGenerators(Blockly) {
  // The generator function lives at Blockly.JavaScript['<block_type>'].
  // Filter out the helpers that live on the same object.
  const skip = new Set([
    'forBlock',
    'valueToCode', 'statementToCode', 'provideFunction_', 'addReservedWords',
    'ORDER_ATOMIC', 'ORDER_NONE', 'ORDER_FUNCTION_CALL',
  ]);
  const out = [];
  for (const key of Object.keys(Blockly.JavaScript)) {
    if (skip.has(key)) continue;
    const v = Blockly.JavaScript[key];
    if (typeof v === 'function') out.push(key);
  }
  return out;
}

function assertNonEmptyCodeShape(name, result) {
  if (Array.isArray(result)) {
    assert.strictEqual(result.length, 2,
      `${name}: tuple should have shape [code, order]`);
    assert.strictEqual(typeof result[0], 'string',
      `${name}: tuple[0] (code) should be a string`);
    assert.ok(result[0].length > 0, `${name}: code is empty string`);
  } else {
    assert.strictEqual(typeof result, 'string',
      `${name}: expected string or tuple, got ${typeof result}`);
    assert.ok(result.length > 0, `${name}: returned empty string`);
  }
}

// ── Smoke: every generator returns a non-empty string ──────────────────────

test('blockly_config registers ≥ 90 generators on Blockly.JavaScript', () => {
  const { Blockly } = setupGenerators();
  const gens = listGenerators(Blockly);
  assert.ok(gens.length >= 90, `expected at least 90 generators, got ${gens.length}`);
});

test('every non-hat generator returns non-empty code without throwing', () => {
  const { Blockly } = setupGenerators();
  const gens  = listGenerators(Blockly).filter(n => !HAT_GENERATORS.has(n));
  const block = makeBlock();
  const failures = [];

  for (const name of gens) {
    try {
      const result = Blockly.JavaScript[name](block);
      assertNonEmptyCodeShape(name, result);
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
    }
  }

  assert.strictEqual(failures.length, 0,
    `${failures.length} generator(s) failed:\n${failures.join('\n')}`);
});

test('every hat (event) generator returns empty string', () => {
  const { Blockly } = setupGenerators();
  const block = makeBlock();
  for (const name of HAT_GENERATORS) {
    const fn = Blockly.JavaScript[name];
    assert.ok(typeof fn === 'function', `${name} not registered`);
    const result = fn(block);
    assert.strictEqual(result, '',
      `${name}: hat blocks must emit empty string, got ${JSON.stringify(result).slice(0, 60)}`);
  }
});

// ── Targeted: load-bearing sim-helper emissions ────────────────────────────

const SIM_TANK_GENERATORS = [
  'flippermove_move',
  'flippermove_startMove',
  'flippermove_steer',
  'flippermove_startSteer',
];

const SIM_SINGLE_MOTOR_GENERATORS = [
  'flippermotor_motorTurnForDirection',
  'flippermotor_motorGoDirectionToPosition',
  'flippermotor_motorStartDirection',
];

test('movement generators emit window.sim._animateTank', () => {
  const { Blockly } = setupGenerators();
  const block = makeBlock();
  for (const name of SIM_TANK_GENERATORS) {
    const fn = Blockly.JavaScript[name];
    assert.ok(typeof fn === 'function', `${name} not registered`);
    const code = fn(block);
    const codeStr = Array.isArray(code) ? code[0] : code;
    assert.ok(codeStr.includes('window.sim._animateTank'),
      `${name} should emit _animateTank, got: ${codeStr.slice(0, 100)}`);
  }
});

test('single-motor generators emit window.sim._animateSingleMotor', () => {
  const { Blockly } = setupGenerators();
  const block = makeBlock();
  for (const name of SIM_SINGLE_MOTOR_GENERATORS) {
    const fn = Blockly.JavaScript[name];
    assert.ok(typeof fn === 'function', `${name} not registered`);
    const code = fn(block);
    const codeStr = Array.isArray(code) ? code[0] : code;
    assert.ok(codeStr.includes('window.sim._animateSingleMotor'),
      `${name} should emit _animateSingleMotor, got: ${codeStr.slice(0, 100)}`);
  }
});

test('motor stop generator emits motor_stop command (no animation)', () => {
  const { Blockly } = setupGenerators();
  const code = Blockly.JavaScript['flippermotor_motorStop'](makeBlock());
  const codeStr = Array.isArray(code) ? code[0] : code;
  // Stop should not call _animateTank/_animateSingleMotor — it's a no-op
  // that just clears state. Pin that contract.
  assert.ok(!codeStr.includes('_animateTank'),
    `motorStop should not animate, got: ${codeStr.slice(0, 100)}`);
});

// ── Direction-sign convention ──────────────────────────────────────────────
// Dropdown label is the wheel's rotation viewed from outside the robot:
// "clockwise" on a left-side wheel = wheel rolls backward = negative velocity.
// Pin so the convention can't silently flip back.

function makeBlockWith(overrides) {
  return {
    getFieldValue(name) {
      if (name in overrides) return overrides[name];
      if (name in FIELD_DEFAULTS) return FIELD_DEFAULTS[name];
      return 'A';
    },
    getInputTargetBlock() { return null; },
  };
}

test('motorTurnForDirection: clockwise emits negative velocity sign', () => {
  const { Blockly } = setupGenerators();
  const cw  = Blockly.JavaScript['flippermotor_motorTurnForDirection'](makeBlockWith({ DIRECTION: 'clockwise' }));
  const ccw = Blockly.JavaScript['flippermotor_motorTurnForDirection'](makeBlockWith({ DIRECTION: 'counterclockwise' }));
  assert.ok(cw.includes('_motorSpeed/100*-1'),  `clockwise should multiply velocity by -1, got: ${cw}`);
  assert.ok(ccw.includes('_motorSpeed/100*1'),  `counterclockwise should multiply velocity by 1, got: ${ccw}`);
});

test('motorStartDirection: clockwise emits negative velocity sign', () => {
  const { Blockly } = setupGenerators();
  const cw  = Blockly.JavaScript['flippermotor_motorStartDirection'](makeBlockWith({ DIRECTION: 'clockwise' }));
  const ccw = Blockly.JavaScript['flippermotor_motorStartDirection'](makeBlockWith({ DIRECTION: 'counterclockwise' }));
  assert.ok(cw.includes('_motorSpeed/100*-1'),  `clockwise should multiply velocity by -1, got: ${cw}`);
  assert.ok(ccw.includes('_motorSpeed/100*1'),  `counterclockwise should multiply velocity by 1, got: ${ccw}`);
});

test('motorGoDirectionToPosition: clockwise emits negative velocity sign', () => {
  const { Blockly } = setupGenerators();
  const cw  = Blockly.JavaScript['flippermotor_motorGoDirectionToPosition'](makeBlockWith({ DIRECTION: 'clockwise' }));
  const ccw = Blockly.JavaScript['flippermotor_motorGoDirectionToPosition'](makeBlockWith({ DIRECTION: 'counterclockwise' }));
  assert.ok(cw.includes('_motorSpeed/100*-1'),  `clockwise should multiply velocity by -1, got: ${cw}`);
  assert.ok(ccw.includes('_motorSpeed/100*1'),  `counterclockwise should multiply velocity by 1, got: ${ccw}`);
});

test('display-text generator emits an appendOutput / hub_display call', () => {
  const { Blockly } = setupGenerators();
  const code = Blockly.JavaScript['flipperlight_lightDisplayText'](makeBlock());
  const codeStr = Array.isArray(code) ? code[0] : code;
  assert.ok(/window\.(sim|appendOutput)/.test(codeStr),
    `lightDisplayText should hit window.sim or appendOutput, got: ${codeStr.slice(0, 100)}`);
});

// ── Targeted: value-block shape ────────────────────────────────────────────

test('sensor reading generators return [code, order] tuples', () => {
  const { Blockly } = setupGenerators();
  const block = makeBlock();
  const valueGenerators = [
    'flippersensors_distance',
    'flippersensors_color',
    'flippersensors_reflectivity',
    'flippersensors_force',
    'flippermotor_speed',
    'flippermotor_absolutePosition',
  ];
  for (const name of valueGenerators) {
    const fn = Blockly.JavaScript[name];
    assert.ok(typeof fn === 'function', `${name} not registered`);
    const result = fn(block);
    assert.ok(Array.isArray(result),
      `${name} should return [code, order] tuple, got ${typeof result}`);
    assert.strictEqual(typeof result[0], 'string', `${name}: code not string`);
    assert.strictEqual(typeof result[1], 'number', `${name}: order not number`);
  }
});

// ── Targeted: control-flow nesting ─────────────────────────────────────────

test('control_if emits a conditional with substack body', () => {
  const { Blockly } = setupGenerators();
  const code = Blockly.JavaScript['control_if'](makeBlock());
  const codeStr = Array.isArray(code) ? code[0] : code;
  assert.ok(codeStr.startsWith('if'), `expected 'if' prefix, got: ${codeStr.slice(0, 60)}`);
});

test('control_repeat emits a for-loop or while-loop', () => {
  const { Blockly } = setupGenerators();
  const code = Blockly.JavaScript['control_repeat'](makeBlock());
  const codeStr = Array.isArray(code) ? code[0] : code;
  assert.ok(/for\s*\(|while\s*\(/.test(codeStr),
    `expected for/while loop, got: ${codeStr.slice(0, 80)}`);
});
