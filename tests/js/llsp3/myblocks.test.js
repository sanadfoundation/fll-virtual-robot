'use strict';

// Round-trip tests for SPIKE My Blocks (Scratch procedure system) → Blockly
// custom block types. Golden fixture is `myblocks-project.llsp3`, exported
// from the real LEGO SPIKE editor with one definition that has a %s and a
// %b parameter and a body that uses both.

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const { makeLlsp3Env, REPO_ROOT } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python',
    'myblocks_proccode',
    'llsp3_blocks', 'llsp3_io',
  ]).ctx;
}

const FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/myblocks-project.llsp3'),
);

async function loadFixtureBlocks() {
  const ctx = env();
  const loaded = await ctx.LLSP3.io.read(FIXTURE);
  assert.strictEqual(loaded.type, 'word-blocks');
  const sb3In = await ctx.LLSP3.blocks.readSb3(loaded.sb3);
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3In.blocks);
  return { ctx, sb3: sb3In, state };
}

// ── Import: SB3 → Blockly state ──────────────────────────────────────────────

test('import: procedures_definition becomes myblocks_definition with argspec from prototype', async () => {
  const { state } = await loadFixtureBlocks();
  const tops = state.blocks.blocks;
  const def = tops.find(b => b.type === 'myblocks_definition');
  assert.ok(def, `expected myblocks_definition in tops; got ${tops.map(t => t.type).join(', ')}`);
  // argspec is preserved verbatim from the prototype mutation
  assert.ok(Array.isArray(def.extraState && def.extraState.argspec),
    'argspec lives on extraState (Blockly v10 mutation API)');
  assert.deepStrictEqual(def.extraState.argspec, [
    { kind: 'label', text: 'rotate ' },
    { kind: 'arg', argKind: 'string_number', name: 'angle', argId: 'oJtKVLw;*^_DF6:w%AP=', defaultValue: '' },
    { kind: 'label', text: ' ' },
    { kind: 'arg', argKind: 'boolean', name: 'direction', argId: 'n40A72a2vW}cpot;{0`x', defaultValue: 'false' },
    { kind: 'label', text: ' my function' },
  ]);
  // procId carries the original definition block id so calls find it later
  assert.strictEqual(def.extraState.procId, '/m:4E^ZSloU*%2,iVkd@');
});

test('import: procedures_call becomes myblocks_call sharing the definition\'s procId', async () => {
  const { state } = await loadFixtureBlocks();
  // The call is in the body of the whenProgramStarts hat — walk the chain
  // to find it.
  const whenStart = state.blocks.blocks.find(b => b.type === 'flipperevents_whenProgramStarts');
  assert.ok(whenStart, 'whenProgramStarts hat is at top level');
  const call = whenStart.next && whenStart.next.block;
  assert.ok(call, 'next block after whenProgramStarts');
  assert.strictEqual(call.type, 'myblocks_call');
  assert.strictEqual(call.extraState.procId, '/m:4E^ZSloU*%2,iVkd@');
  // Call carries the same argspec (so its UI can render slot order)
  assert.strictEqual(call.extraState.argspec.length, 5);
});

test('import: procedures_call inputs are keyed ARG0/ARG1 by argspec position', async () => {
  const { state } = await loadFixtureBlocks();
  const whenStart = state.blocks.blocks.find(b => b.type === 'flipperevents_whenProgramStarts');
  const call = whenStart.next.block;
  // ARG0 = %s (angle) — fixture stores it as a `text` primitive ([10, "100"]),
  // not a `math_number`. Scratch's %s slots accept either; LEGO's editor
  // emitted text. Round-trip preserves the original shadow type.
  assert.ok(call.inputs && call.inputs.ARG0, 'ARG0 input present');
  const shadow0 = call.inputs.ARG0.shadow;
  assert.strictEqual(shadow0 && shadow0.type, 'text');
  assert.strictEqual(shadow0.fields.TEXT, '100');
  // ARG1 = %b (direction) — fixture has a connected isTilted block
  assert.ok(call.inputs.ARG1, 'ARG1 input present');
  assert.strictEqual(call.inputs.ARG1.block.type, 'flippersensors_isTilted');
});

test('import: argument_reporter_string_number in body becomes myblocks_arg_string_number', async () => {
  const { state } = await loadFixtureBlocks();
  const def = state.blocks.blocks.find(b => b.type === 'myblocks_definition');
  // Body's first statement is the motor block; its VALUE input holds the
  // string_number arg reporter.
  const motor = def.next.block;
  assert.strictEqual(motor.type, 'flippermotor_motorTurnForDirection');
  const valueInput = motor.inputs && motor.inputs.VALUE;
  assert.ok(valueInput, 'motor VALUE input wired');
  const reporter = valueInput.block;
  assert.ok(reporter, 'VALUE has a block, not just shadow');
  assert.strictEqual(reporter.type, 'myblocks_arg_string_number');
  // The displayed name field carries the arg name (resolved by name lookup
  // against the enclosing definition's argumentnames)
  assert.strictEqual(reporter.fields.VALUE, 'angle');
  // argId is resolved via the enclosing definition's argspec
  assert.strictEqual(reporter.extraState && reporter.extraState.argId, 'oJtKVLw;*^_DF6:w%AP=');
});

test('import: argument_reporter_boolean in body becomes myblocks_arg_boolean', async () => {
  const { state } = await loadFixtureBlocks();
  const def = state.blocks.blocks.find(b => b.type === 'myblocks_definition');
  // Body chain: motor → control_if_else; the if's CONDITION is the boolean
  // reporter.
  const motor = def.next.block;
  const ifBlock = motor.next && motor.next.block;
  assert.strictEqual(ifBlock && ifBlock.type, 'control_if_else');
  const condition = ifBlock.inputs && ifBlock.inputs.CONDITION;
  assert.ok(condition, 'CONDITION input wired');
  const reporter = condition.block;
  assert.strictEqual(reporter.type, 'myblocks_arg_boolean');
  assert.strictEqual(reporter.fields.VALUE, 'direction');
  assert.strictEqual(reporter.extraState && reporter.extraState.argId, 'n40A72a2vW}cpot;{0`x');
});

test('import: procedures_prototype does not appear as a top-level block', async () => {
  // The prototype lives inside the definition's custom_block input as a
  // shadow; it must never escape to a top-level block.
  const { state } = await loadFixtureBlocks();
  const protoTops = state.blocks.blocks.filter(b => b.type === 'procedures_prototype');
  assert.strictEqual(protoTops.length, 0, 'prototype is not a top-level block');
});

// ── Export: Blockly state → SB3 ──────────────────────────────────────────────

test('export: myblocks_definition emits procedures_definition + shadow prototype with proccode', async () => {
  const { ctx } = await loadFixtureBlocks();
  // Hand-crafted minimal state mirroring the imported shape
  const state = {
    blocks: { languageVersion: 0, blocks: [
      { type: 'myblocks_definition', x: 10, y: 20,
        extraState: {
          procId: 'def-uuid',
          argspec: [
            { kind: 'label', text: 'do ' },
            { kind: 'arg', argKind: 'string_number', name: 'n', argId: 'arg-x', defaultValue: '' },
          ],
        },
      },
    ]},
  };
  const sb3 = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const defs = Object.entries(sb3).filter(([, b]) => b.opcode === 'procedures_definition');
  assert.strictEqual(defs.length, 1);
  const [, def] = defs[0];
  assert.ok(def.inputs && def.inputs.custom_block, 'definition has custom_block input');
  const protoId = def.inputs.custom_block[1];
  const proto = sb3[protoId];
  assert.ok(proto, 'prototype block emitted');
  assert.strictEqual(proto.opcode, 'procedures_prototype');
  assert.strictEqual(proto.shadow, true);
  assert.ok(proto.mutation, 'prototype has mutation');
  assert.strictEqual(proto.mutation.proccode, 'do %s');
  assert.strictEqual(proto.mutation.argumentnames, '["n"]');
  assert.strictEqual(proto.mutation.argumentdefaults, '[""]');
  assert.strictEqual(proto.mutation.argumentids, '["arg-x"]');
});

test('export: myblocks_call emits procedures_call with matching proccode and argumentids', async () => {
  const { ctx } = await loadFixtureBlocks();
  const state = {
    blocks: { languageVersion: 0, blocks: [
      { type: 'myblocks_call', x: 0, y: 0,
        extraState: {
          procId: 'def-uuid',
          argspec: [
            { kind: 'label', text: 'do ' },
            { kind: 'arg', argKind: 'string_number', name: 'n', argId: 'arg-x', defaultValue: '' },
          ],
        },
        inputs: {
          ARG0: { shadow: { type: 'math_number', fields: { NUM: '42' } } },
        },
      },
    ]},
  };
  const sb3 = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const calls = Object.entries(sb3).filter(([, b]) => b.opcode === 'procedures_call');
  assert.strictEqual(calls.length, 1);
  const [, call] = calls[0];
  assert.strictEqual(call.mutation.proccode, 'do %s');
  assert.strictEqual(call.mutation.argumentids, '["arg-x"]');
  // Call inputs are keyed by argumentid (NOT ARG0) per Scratch convention
  assert.ok(call.inputs && call.inputs['arg-x'], 'call input keyed by argumentid');
});

test('export: body reporters become argument_reporter_string_number / _boolean with VALUE = name', async () => {
  const { ctx } = await loadFixtureBlocks();
  const state = {
    blocks: { languageVersion: 0, blocks: [
      { type: 'myblocks_arg_string_number', fields: { VALUE: 'angle' }, x: 0, y: 0,
        extraState: { argId: 'arg-x' } },
      { type: 'myblocks_arg_boolean', fields: { VALUE: 'flag' }, x: 0, y: 0,
        extraState: { argId: 'arg-y' } },
    ]},
  };
  const sb3 = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const opcodes = Object.values(sb3).map(b => b.opcode).sort();
  assert.deepStrictEqual(opcodes, [
    'argument_reporter_boolean', 'argument_reporter_string_number',
  ]);
  const string_number = Object.values(sb3).find(b => b.opcode === 'argument_reporter_string_number');
  assert.deepStrictEqual(string_number.fields.VALUE, ['angle', null]);
  const boolean = Object.values(sb3).find(b => b.opcode === 'argument_reporter_boolean');
  assert.deepStrictEqual(boolean.fields.VALUE, ['flag', null]);
});

// ── Full round-trip ──────────────────────────────────────────────────────────

test('round-trip: golden fixture survives load → state → export → re-load', async () => {
  const { ctx, sb3, state } = await loadFixtureBlocks();
  const reEncoded = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const state2 = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(reEncoded);

  // Definition's argspec survives identical
  const def1 = state.blocks.blocks.find(b => b.type === 'myblocks_definition');
  const def2 = state2.blocks.blocks.find(b => b.type === 'myblocks_definition');
  assert.deepStrictEqual(def1.extraState.argspec, def2.extraState.argspec);

  // The call's procId still matches the definition's
  const hat1 = state.blocks.blocks.find(b => b.type === 'flipperevents_whenProgramStarts');
  const call1 = hat1.next.block;
  const hat2 = state2.blocks.blocks.find(b => b.type === 'flipperevents_whenProgramStarts');
  const call2 = hat2.next.block;
  assert.strictEqual(call2.extraState.procId, call1.extraState.procId);

  // Body reporters preserve their argId binding
  const motor1 = def1.next.block;
  const motor2 = def2.next.block;
  assert.strictEqual(motor2.inputs.VALUE.block.extraState.argId,
                     motor1.inputs.VALUE.block.extraState.argId);
});
