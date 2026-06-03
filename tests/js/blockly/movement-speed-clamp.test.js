'use strict';

// flippermove_movementSpeed generator must clamp its input to [-100, 100].
// The real SPIKE API rejects speeds outside that range; allowing >100 produces
// physically-impossible motion in the simulator.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGeneratorsWithSpeed(speedLiteral) {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  // Override valueToCode so val(block, 'SPEED', ...) returns our literal.
  env.Blockly.JavaScript.valueToCode = (block, name) =>
    name === 'SPEED' ? String(speedLiteral) : '';
  return env;
}

// Eval the RHS of `_moveSpeed = <expr>;` produced by the generator.
function evalEmittedSpeed(code) {
  const rhs = code.trim().replace(/^_moveSpeed\s*=\s*/, '').replace(/;\s*$/, '');
  // eslint-disable-next-line no-new-func
  return new Function('Math', `return ${rhs};`)(Math);
}

const block = { getFieldValue: () => null, getInputTargetBlock: () => null };

test('flippermove_movementSpeed clamps speed above 100 to 100', () => {
  const { Blockly } = setupGeneratorsWithSpeed(150);
  const code = Blockly.JavaScript['flippermove_movementSpeed'](block);
  assert.strictEqual(evalEmittedSpeed(code), 100,
    `Expected 100 for input 150. Code: ${code}`);
});

test('flippermove_movementSpeed clamps speed below -100 to -100', () => {
  const { Blockly } = setupGeneratorsWithSpeed(-150);
  const code = Blockly.JavaScript['flippermove_movementSpeed'](block);
  assert.strictEqual(evalEmittedSpeed(code), -100,
    `Expected -100 for input -150. Code: ${code}`);
});

test('flippermove_movementSpeed passes through value within bounds', () => {
  const { Blockly } = setupGeneratorsWithSpeed(75);
  const code = Blockly.JavaScript['flippermove_movementSpeed'](block);
  assert.strictEqual(evalEmittedSpeed(code), 75,
    `Expected 75 to pass through unchanged. Code: ${code}`);
});
