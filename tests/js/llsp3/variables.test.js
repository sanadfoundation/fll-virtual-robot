'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_blocks', 'llsp3_python', 'llsp3_io',
  ]).ctx;
}

const FIXTURE_PID = path.resolve(__dirname, '..', '..', 'fixtures', 'llsp3', 'pid-project.llsp3');

// ── Empty SUBSTACK ──────────────────────────────────────────────────────────

test('sb3BlocksToBlocklyState: control_repeat_until with empty SUBSTACK does not crash', () => {
  const ctx = env();
  const sb3 = {
    'TOP': {
      opcode: 'control_repeat_until',
      topLevel: true, parent: null, next: null,
      x: 0, y: 0,
      inputs: {
        SUBSTACK:  [1, null],
        CONDITION: [1, [4, '0']],
      },
      fields: {}, shadow: false,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'control_repeat_until');
  assert.strictEqual(top.inputs && top.inputs.SUBSTACK, undefined,
    'empty SUBSTACK should produce no Blockly input slot');
});

test('sb3BlocksToBlocklyState: control_forever with empty SUBSTACK does not crash', () => {
  const ctx = env();
  const sb3 = {
    'TOP': {
      opcode: 'control_forever',
      topLevel: true, parent: null, next: null,
      x: 0, y: 0,
      inputs: { SUBSTACK: [2, null] },
      fields: {}, shadow: false,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'control_forever');
});

// ── Variable reporters as inline primitives [12, name, id] ──────────────────

test('sb3BlocksToBlocklyState: inline variable reference [12, name, id] becomes a data_variable block', () => {
  const ctx = env();
  const sb3 = {
    'OP': {
      opcode: 'operator_multiply',
      topLevel: true, parent: null, next: null,
      x: 0, y: 0,
      inputs: {
        NUM1: [3, [12, 'error', 'var-id-1'], [4, '']],
        NUM2: [1, [4, '2']],
      },
      fields: {}, shadow: false,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  const num1 = top.inputs.NUM1;
  assert.ok(num1.block, 'NUM1 has a block (the variable reporter)');
  assert.strictEqual(num1.block.type, 'data_variable');
  assert.strictEqual(num1.block.fields.VARIABLE.id, 'var-id-1');
  assert.strictEqual(num1.block.fields.VARIABLE.name, 'error');
});

// ── data_setvariableto block ────────────────────────────────────────────────

test('sb3BlocksToBlocklyState: data_setvariableto field VARIABLE [name, id] decodes to Blockly variable field', () => {
  const ctx = env();
  const sb3 = {
    'TOP': {
      opcode: 'data_setvariableto',
      topLevel: true, parent: null, next: null,
      x: 0, y: 0,
      inputs: { VALUE: [1, [10, '7']] },
      fields: { VARIABLE: ['k_p', 'var-id-2'] },
      shadow: false,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'data_setvariableto');
  assert.deepStrictEqual(top.fields.VARIABLE, { id: 'var-id-2', name: 'k_p' });
});

// ── Variables propagation through readSb3 ───────────────────────────────────

test('readSb3: extracts variables map from the sprite target', async () => {
  const ctx = env();
  const buf = fs.readFileSync(FIXTURE_PID);
  const project = await ctx.LLSP3.io.read(buf);
  const sb3 = await ctx.LLSP3.blocks.readSb3(project.sb3);
  assert.ok(sb3.variables, 'readSb3 returns a variables map');
  const names = Object.values(sb3.variables).map(v => v[0]).sort();
  assert.deepStrictEqual(names, ['correction', 'dist', 'error', 'k_p', 'pi', 'w_d']);
});

test('sb3BlocksToBlocklyState: emits variables[] at workspace top level', () => {
  const ctx = env();
  const blocks = {
    'TOP': {
      opcode: 'data_setvariableto',
      topLevel: true, parent: null, next: null,
      x: 0, y: 0,
      inputs: { VALUE: [1, [10, '1']] },
      fields: { VARIABLE: ['error', 'var-id-3'] },
      shadow: false,
    },
  };
  const variables = { 'var-id-3': ['error', '0'] };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(blocks, variables);
  assert.ok(Array.isArray(state.variables), 'state.variables is an array');
  const v = state.variables.find(v => v.id === 'var-id-3');
  assert.ok(v, 'variable registered in state');
  assert.strictEqual(v.name, 'error');
});

// ── Round-trip ──────────────────────────────────────────────────────────────

test('round-trip: Blockly state with variables → sb3 blocks → Blockly state', () => {
  const ctx = env();
  const original = {
    variables: [{ name: 'k_p', id: 'kp-id', type: '' }],
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'data_setvariableto',
        id: 'SETTER',
        x: 0, y: 0,
        fields: { VARIABLE: { id: 'kp-id', name: 'k_p' } },
        inputs: {
          VALUE: { shadow: { type: 'math_number', fields: { NUM: '0.5' } } },
        },
      }],
    },
  };

  const sb3Blocks = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(original);
  const setter = Object.values(sb3Blocks).find(b => b.opcode === 'data_setvariableto');
  assert.ok(setter, 'data_setvariableto block emitted');
  assert.deepStrictEqual(setter.fields.VARIABLE, ['k_p', 'kp-id'],
    'VARIABLE field encoded as [name, id]');

  // Also verify forward path can be inverted (need a variables map for sb3BlocksToBlocklyState)
  const variables = { 'kp-id': ['k_p', '0'] };
  const back = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3Blocks, variables);
  const top = back.blocks.blocks[0];
  assert.strictEqual(top.type, 'data_setvariableto');
  assert.deepStrictEqual(top.fields.VARIABLE, { id: 'kp-id', name: 'k_p' });
});

test('round-trip: data_variable inside an operator slot encodes as inline [12, name, id]', () => {
  const ctx = env();
  const state = {
    variables: [{ name: 'error', id: 'err-id', type: '' }],
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'operator_multiply',
        id: 'MUL',
        x: 0, y: 0,
        inputs: {
          NUM1: {
            block: { type: 'data_variable', fields: { VARIABLE: { id: 'err-id', name: 'error' } } },
            shadow: { type: 'math_number', fields: { NUM: '' } },
          },
          NUM2: { shadow: { type: 'math_number', fields: { NUM: '2' } } },
        },
      }],
    },
  };

  const sb3Blocks = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const mul = Object.values(sb3Blocks).find(b => b.opcode === 'operator_multiply');
  assert.ok(mul, 'operator_multiply emitted');
  const num1 = mul.inputs.NUM1;
  assert.strictEqual(num1[0], 3, 'NUM1 is [3, block, shadow]');
  assert.ok(Array.isArray(num1[1]), 'block slot is inline primitive');
  assert.strictEqual(num1[1][0], 12, 'inline primitive type is 12 (variable)');
  assert.strictEqual(num1[1][1], 'error');
  assert.strictEqual(num1[1][2], 'err-id');
});

// ── End-to-end: the PID file loads cleanly ──────────────────────────────────

test('readSb3 + sb3BlocksToBlocklyState: pid-project.llsp3 converts without error', async () => {
  const ctx = env();
  const buf = fs.readFileSync(FIXTURE_PID);
  const project = await ctx.LLSP3.io.read(buf);
  assert.strictEqual(project.type, 'word-blocks');

  const sb3 = await ctx.LLSP3.blocks.readSb3(project.sb3);
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3.blocks, sb3.variables);

  assert.ok(state.variables.length >= 6, 'all 6 variables registered');
  assert.ok(state.blocks.blocks.length >= 3, 'multiple top-level stacks');
});
