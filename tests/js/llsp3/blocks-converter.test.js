'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_blocks',
  ]).ctx;
}

test('shadowFor: returns the documented shadow for flippermove_setMovementPair PAIR input', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermove_setMovementPair', 'PAIR');
  assert.strictEqual(s.opcode, 'flippermove_movement-port-selector');
  assert.strictEqual(s.fieldName, 'field_flippermove_movement-port-selector');
  assert.strictEqual(s.defaultValue, 'AB');
});

test('shadowFor: returns the documented shadow for flippermove_move DIRECTION input', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermove_move', 'DIRECTION');
  assert.strictEqual(s.opcode, 'flippermove_custom-icon-direction');
  assert.strictEqual(s.fieldName, 'field_flippermove_custom-icon-direction');
  assert.strictEqual(s.defaultValue, 'forward');
});

test('shadowFor: numeric value-inputs default to math_number', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermove_move', 'VALUE');
  assert.strictEqual(s.opcode, 'math_number');
  assert.strictEqual(s.fieldName, 'NUM');
  assert.strictEqual(s.defaultValue, '10');
});

test('shadowFor: unknown input falls back to math_number "10"', () => {
  const ctx = env();
  const s = ctx.LLSP3.blocks.shadowFor('flippermotor_motorTurnForDirection', 'NONEXISTENT');
  assert.strictEqual(s.opcode, 'math_number');
  assert.strictEqual(s.defaultValue, '10');
});

test('genSb3Id: produces 20-char unique ids', () => {
  const ctx = env();
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(ctx.LLSP3.blocks.genSb3Id());
  assert.strictEqual(ids.size, 100);
  for (const id of ids) assert.strictEqual(id.length, 20);
});
