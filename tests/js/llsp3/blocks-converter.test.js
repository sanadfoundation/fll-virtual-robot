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

test('blocklyStateToSb3Blocks: simple two-block chain (whenProgramStarts → setMovementPair)', () => {
  const ctx = env();

  const state = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flipperevents_whenProgramStarts',
          id: 'A1',
          x: -459, y: -252,
          next: {
            block: {
              type: 'flippermove_setMovementPair',
              id: 'B1',
              fields: {},
              inputs: {
                PAIR: { shadow: { type: 'flippermove_movement-port-selector', id: 'C1',
                  fields: { 'field_flippermove_movement-port-selector': 'AB' } } },
              },
            }
          }
        }
      ]
    }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  assert.strictEqual(typeof out, 'object');

  const hat = Object.values(out).find(b => b.opcode === 'flipperevents_whenProgramStarts');
  assert.ok(hat, 'hat block emitted');
  assert.strictEqual(hat.topLevel, true);
  assert.strictEqual(hat.parent, null);
  assert.strictEqual(hat.x, -459);
  assert.strictEqual(hat.y, -252);

  const move = Object.values(out).find(b => b.opcode === 'flippermove_setMovementPair');
  assert.ok(move, 'move block emitted');
  assert.strictEqual(move.topLevel, false);
  assert.ok(move.parent, 'move has a parent');

  const moveId = Object.keys(out).find(k => out[k] === move);
  assert.strictEqual(hat.next, moveId);

  assert.ok(move.inputs.PAIR);
  assert.strictEqual(move.inputs.PAIR[0], 1, 'shadow-only input encoded as 1');
});

test('blocklyStateToSb3Blocks: inline math_number shadow becomes [1, math_number_block_id]', () => {
  const ctx = env();
  const state = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flippermove_move',
          id: 'M1',
          x: 0, y: 0,
          fields: { UNIT: 'rotations' },
          inputs: {
            DIRECTION: { shadow: { type: 'flippermove_custom-icon-direction', id: 'D1',
              fields: { 'field_flippermove_custom-icon-direction': 'forward' } } },
            VALUE:     { shadow: { type: 'math_number', id: 'V1',
              fields: { NUM: '10' } } },
          },
        }
      ]
    }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const move = Object.values(out).find(b => b.opcode === 'flippermove_move');
  assert.ok(move);
  assert.strictEqual(move.inputs.VALUE[0], 1);
  const shadowId = move.inputs.VALUE[1];
  assert.ok(typeof shadowId === 'string');
  assert.strictEqual(out[shadowId].opcode, 'math_number');
  assert.deepStrictEqual(out[shadowId].fields.NUM, ['10', null]);
});
