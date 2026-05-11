'use strict';

// Pins the Blockly emissions for the yaw API. After issue #9, the resetYaw
// block must delegate to sim.resetYaw() and the orientationAxis('yaw')
// reporter must read sim.getYaw() — neither may touch robot.heading directly.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGenerators() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env;
}

function makeBlock(overrides = {}) {
  return {
    getFieldValue(name) {
      if (name in overrides) return overrides[name];
      return 'A';
    },
    getInputTargetBlock() { return null; },
  };
}

test('flippersensors_resetYaw emits sim.resetYaw() (not robot.heading slam)', () => {
  const { Blockly } = setupGenerators();
  const code = Blockly.JavaScript['flippersensors_resetYaw'](makeBlock());
  const codeStr = Array.isArray(code) ? code[0] : code;
  assert.ok(codeStr.includes('window.sim.resetYaw()'),
    `expected window.sim.resetYaw(), got: ${codeStr}`);
  assert.ok(!codeStr.includes('robot.heading'),
    `must not write robot.heading, got: ${codeStr}`);
});

test('flippersensors_orientationAxis(yaw) emits sim.getYaw()', () => {
  const { Blockly } = setupGenerators();
  const result = Blockly.JavaScript['flippersensors_orientationAxis'](makeBlock({ AXIS: 'yaw' }));
  const codeStr = Array.isArray(result) ? result[0] : result;
  assert.ok(codeStr.includes('window.sim.getYaw()'),
    `expected window.sim.getYaw(), got: ${codeStr}`);
  assert.ok(!codeStr.includes('robot.heading'),
    `must not read robot.heading directly, got: ${codeStr}`);
});

test('flippersensors_orientationAxis(pitch) still returns 0 (sim is 2D)', () => {
  const { Blockly } = setupGenerators();
  const result = Blockly.JavaScript['flippersensors_orientationAxis'](makeBlock({ AXIS: 'pitch' }));
  const codeStr = Array.isArray(result) ? result[0] : result;
  assert.strictEqual(codeStr, '0');
});
