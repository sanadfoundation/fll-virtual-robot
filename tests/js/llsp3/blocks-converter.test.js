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

test('blocklyStateToSb3Blocks: trivial math_number shadow is compressed to inline primitive [1, [4, "<value>"]]', () => {
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
  // Trivial math_number shadow is compressed to a Scratch 3 inline primitive.
  assert.deepStrictEqual(move.inputs.VALUE, [1, [4, '10']]);
  // No separate math_number block should exist in the dictionary.
  const mn = Object.values(out).filter(b => b.opcode === 'math_number');
  assert.strictEqual(mn.length, 0, 'no separate math_number blocks for trivial shadows');
});

test('sb3BlocksToBlocklyState: round-trips a chain through forward+inverse converters', () => {
  const ctx = env();
  const original = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flipperevents_whenProgramStarts',
          id: 'TOP',
          x: 100, y: 200,
          next: {
            block: {
              type: 'flippermove_move',
              id: 'MOV',
              fields: { UNIT: 'rotations' },
              inputs: {
                DIRECTION: { shadow: { type: 'flippermove_custom-icon-direction', id: 'DIR',
                  fields: { 'field_flippermove_custom-icon-direction': 'forward' } } },
                VALUE: { shadow: { type: 'math_number', id: 'NUM',
                  fields: { NUM: '5' } } },
              },
            },
          },
        },
      ],
    },
  };

  const sb3Blocks = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(original);
  const back = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3Blocks);

  const top = back.blocks.blocks[0];
  assert.strictEqual(top.type, 'flipperevents_whenProgramStarts');
  assert.strictEqual(top.x, 100);
  assert.strictEqual(top.y, 200);
  assert.ok(top.next);

  const mov = top.next.block;
  assert.strictEqual(mov.type, 'flippermove_move');
  assert.strictEqual(mov.fields.UNIT, 'rotations');
  assert.strictEqual(mov.fields.DIRECTION, 'forward', 'DIRECTION demoted to Blockly field');
  assert.strictEqual(mov.inputs.DIRECTION, undefined, 'DIRECTION not in inputs after demotion');
  assert.strictEqual(mov.inputs.VALUE.shadow.type, 'math_number');
  assert.strictEqual(mov.inputs.VALUE.shadow.fields.NUM, '5');
});

test('blocklyStateToSb3Blocks: promotes fields matching SHADOW_CONTRACT to inputs-with-shadows', () => {
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_move',
      id: 'M1',
      x: 0, y: 0,
      fields: { DIRECTION: 'backward', UNIT: 'cm' },
      inputs: {
        VALUE: { shadow: { type: 'math_number', id: 'V1', fields: { NUM: '20' } } },
      },
    }] }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const move = Object.values(out).find(b => b.opcode === 'flippermove_move');
  assert.ok(move);

  // DIRECTION promoted: now an input pointing at a flippermove_custom-icon-direction shadow
  assert.ok(move.inputs.DIRECTION, 'DIRECTION promoted to input');
  assert.strictEqual(move.inputs.DIRECTION[0], 1);
  const dirShadowId = move.inputs.DIRECTION[1];
  assert.strictEqual(out[dirShadowId].opcode, 'flippermove_custom-icon-direction');
  assert.deepStrictEqual(out[dirShadowId].fields['field_flippermove_custom-icon-direction'], ['backward', null]);

  // UNIT not in SHADOW_CONTRACT — stays as a Blockly field
  assert.deepStrictEqual(move.fields.UNIT, ['cm', null]);
  assert.strictEqual(move.fields.DIRECTION, undefined, 'DIRECTION not in fields after promotion');

  // VALUE input still present and intact
  assert.ok(move.inputs.VALUE);
});

test('sb3BlocksToBlocklyState: demotes contract-matching inputs back to Blockly fields', () => {
  const ctx = env();
  const sb3Blocks = {
    'TOP': { opcode: 'flippermove_move', topLevel: true, parent: null, next: null,
             x: 0, y: 0, fields: { UNIT: ['cm', null] }, shadow: false,
             inputs: { DIRECTION: [1, 'D1'], VALUE: [1, 'V1'] } },
    'D1':  { opcode: 'flippermove_custom-icon-direction', topLevel: false, parent: 'TOP', next: null,
             inputs: {}, fields: { 'field_flippermove_custom-icon-direction': ['forward', null] },
             shadow: true },
    'V1':  { opcode: 'math_number', topLevel: false, parent: 'TOP', next: null,
             inputs: {}, fields: { NUM: ['10', null] }, shadow: true },
  };

  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3Blocks);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'flippermove_move');
  assert.strictEqual(top.fields.DIRECTION, 'forward', 'DIRECTION demoted to field');
  assert.strictEqual(top.fields.UNIT, 'cm', 'UNIT preserved as field');
  assert.strictEqual(top.inputs && top.inputs.DIRECTION, undefined, 'DIRECTION not in inputs');
  // VALUE has no SHADOW_CONTRACT entry — stays as input
  assert.ok(top.inputs.VALUE, 'VALUE remains as input (no contract match)');
});

test('blocklyStateToSb3Blocks: emits promoted shadows even when the field is omitted from serialization (Blockly drops default values)', () => {
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_move',
      id: 'M',
      x: 0, y: 0,
      // No fields at all — Blockly omitted DIRECTION because it was at the default.
      // (UNIT is also missing here for simplicity, even though the real bug
      // has UNIT present because the user changed it.)
    }] }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const move = Object.values(out).find(b => b.opcode === 'flippermove_move');
  assert.ok(move);

  // DIRECTION must be emitted as an input with the contract default ('forward')
  assert.ok(move.inputs.DIRECTION, 'DIRECTION emitted even though field was missing from serialization');
  const dirShadowId = move.inputs.DIRECTION[1];
  assert.strictEqual(out[dirShadowId].opcode, 'flippermove_custom-icon-direction');
  assert.deepStrictEqual(out[dirShadowId].fields['field_flippermove_custom-icon-direction'], ['forward', null]);
});

test('blocklyStateToSb3Blocks: motorStartDirection emits both PORT and DIRECTION shadows when fields are omitted', () => {
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermotor_motorStartDirection',
      id: 'MS',
      x: 0, y: 0,
    }] }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const ms = Object.values(out).find(b => b.opcode === 'flippermotor_motorStartDirection');
  assert.ok(ms);

  assert.ok(ms.inputs.PORT, 'PORT input emitted');
  assert.strictEqual(out[ms.inputs.PORT[1]].opcode, 'flippermotor_multiple-port-selector');
  assert.deepStrictEqual(
    out[ms.inputs.PORT[1]].fields['field_flippermotor_multiple-port-selector'],
    ['A', null]
  );

  assert.ok(ms.inputs.DIRECTION, 'DIRECTION input emitted');
  assert.strictEqual(out[ms.inputs.DIRECTION[1]].opcode, 'flippermotor_custom-icon-direction');
  assert.deepStrictEqual(
    out[ms.inputs.DIRECTION[1]].fields['field_flippermotor_custom-icon-direction'],
    ['clockwise', null]
  );
});

test('blocklyStateToSb3Blocks: explicit input wins over auto-promote (no double-emit)', () => {
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_setMovementPair',
      id: 'SP',
      x: 0, y: 0,
      // PAIR provided as an explicit input — the auto-promoter should skip it.
      inputs: {
        PAIR: { shadow: { type: 'flippermove_movement-port-selector', id: 'shad',
          fields: { 'field_flippermove_movement-port-selector': 'CD' } } },
      },
    }] }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const sp = Object.values(out).find(b => b.opcode === 'flippermove_setMovementPair');
  assert.ok(sp);

  assert.ok(sp.inputs.PAIR);
  const shadowId = sp.inputs.PAIR[1];
  // The shadow's value should be 'CD' from the explicit input, NOT 'AB' from the contract default.
  assert.deepStrictEqual(
    out[shadowId].fields['field_flippermove_movement-port-selector'],
    ['CD', null]
  );

  // Only one PAIR shadow should exist — count flippermove_movement-port-selector blocks.
  const shadowCount = Object.values(out).filter(b => b.opcode === 'flippermove_movement-port-selector').length;
  assert.strictEqual(shadowCount, 1, 'no double-emit');
});

test('encodeInput: trivial math_number shadow becomes inline primitive [1, [4, "<num>"]]', () => {
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_steer',
      id: 'S',
      x: 0, y: 0,
      fields: { UNIT: 'rotations' },
      inputs: {
        STEERING: { shadow: { type: 'math_number', id: 'M1', fields: { NUM: 50 } } },
        VALUE:    { shadow: { type: 'math_number', id: 'M2', fields: { NUM: 1 } } },
      },
    }] }
  };

  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const steer = Object.values(out).find(b => b.opcode === 'flippermove_steer');
  assert.ok(steer);

  // Inputs are inline primitives — no separate math_number block in `out`.
  assert.deepStrictEqual(steer.inputs.STEERING, [1, [4, '50']], 'STEERING inline primitive with string value');
  assert.deepStrictEqual(steer.inputs.VALUE,    [1, [4, '1']],  'VALUE inline primitive with string value');

  // No math_number blocks should exist in the dictionary.
  const mn = Object.values(out).filter(b => b.opcode === 'math_number');
  assert.strictEqual(mn.length, 0, 'no separate math_number blocks emitted for trivial shadows');
});

test('encodeInput: lightDisplayText TEXT field is promoted to inline [1, [10, "<text>"]]', () => {
  const ctx = env();
  // The Blockly model holds TEXT as a field_input (no quote glyphs); the
  // SHADOW_CONTRACT promotes it back to a text-shadow input on export so
  // Spike's strict sb3 validator accepts it.
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flipperlight_lightDisplayText',
      id: 'L',
      x: 0, y: 0,
      fields: { TEXT: 'Done!' },
    }] }
  };
  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const ld = Object.values(out).find(b => b.opcode === 'flipperlight_lightDisplayText');
  assert.deepStrictEqual(ld.inputs.TEXT, [1, [10, 'Done!']]);
  assert.strictEqual(ld.fields.TEXT, undefined, 'TEXT should be promoted to input, not stay as a field');
  const txt = Object.values(out).filter(b => b.opcode === 'text');
  assert.strictEqual(txt.length, 0);
});

test('decodeInput: lightDisplayText inline [1, [10, "<text>"]] demotes back to TEXT field', () => {
  const ctx = env();
  const sb3 = {
    L: {
      opcode: 'flipperlight_lightDisplayText',
      next: null, parent: null,
      inputs: { TEXT: [1, [10, 'Hello world']] },
      fields: {},
      shadow: false, topLevel: true,
      x: 0, y: 0,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'flipperlight_lightDisplayText');
  assert.strictEqual(top.fields && top.fields.TEXT, 'Hello world');
  assert.strictEqual(top.inputs && top.inputs.TEXT, undefined);
});

test('encodeInput: math_number shadow with nested block stays in verbose form', () => {
  // VALUE on flippermove_move accepts a value-block (sensor reading,
  // calculation). Verify the [3, blockId, shadowId] encoding survives.
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_move',
      id: 'M',
      x: 0, y: 0,
      fields: { DIRECTION: 'forward', UNIT: 'cm' },
      inputs: {
        VALUE: {
          shadow: { type: 'math_number', id: 'V1', fields: { NUM: 20 } },
          block:  { type: 'operator_add', id: 'A',
                    inputs: {
                      NUM1: { shadow: { type: 'math_number', id: 'V2', fields: { NUM: 1 } } },
                      NUM2: { shadow: { type: 'math_number', id: 'V3', fields: { NUM: 2 } } },
                    } },
        },
      },
    }] }
  };
  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const move = Object.values(out).find(b => b.opcode === 'flippermove_move');
  assert.strictEqual(move.inputs.VALUE[0], 3);
  assert.strictEqual(typeof move.inputs.VALUE[1], 'string', 'block id is string');
  assert.strictEqual(typeof move.inputs.VALUE[2], 'string', 'shadow id is string');
  assert.ok(Object.values(out).some(b => b.opcode === 'operator_add'));
});

test('encodeInput: flippermove_steer STEERING field is promoted to inline [1, [4, "<n>"]]', () => {
  // STEERING is a FieldSteering (custom field), but the .llsp3 wire form
  // stays Spike-compatible: an input with a math_number text-shadow.
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_steer',
      id: 'S',
      x: 0, y: 0,
      fields: { UNIT: 'rotations', STEERING: 50 },
      inputs: {
        VALUE: { shadow: { type: 'math_number', id: 'V1', fields: { NUM: 1 } } },
      },
    }] }
  };
  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  const steer = Object.values(out).find(b => b.opcode === 'flippermove_steer');
  assert.deepStrictEqual(steer.inputs.STEERING, [1, [4, '50']]);
  assert.strictEqual(steer.fields.STEERING, undefined, 'STEERING should be promoted to input, not stay as a field');
});

test('decodeInput: flippermove_steer inline STEERING demotes back to a field', () => {
  const ctx = env();
  const sb3 = {
    S: {
      opcode: 'flippermove_steer',
      next: null, parent: null,
      inputs: {
        STEERING: [1, [4, '-25']],
        VALUE:    [1, [4, '1']],
      },
      fields: { UNIT: ['rotations', null] },
      shadow: false, topLevel: true,
      x: 0, y: 0,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'flippermove_steer');
  assert.strictEqual(top.fields && top.fields.STEERING, '-25');
  assert.strictEqual(top.inputs && top.inputs.STEERING, undefined);
});

test('decodeInput: flippermove_steer STEERING with flippermove_rotation-wheel shadow demotes to field', () => {
  // Spike's native editor stores STEERING as a separate
  // `flippermove_rotation-wheel` shadow block, not as an inline math_number
  // primitive. The wheel value lives in `field_flippermove_rotation-wheel`.
  // Without normalization the unknown block leaks into Blockly's input slot
  // and load fails with "missing a(n) STEERING connection".
  const ctx = env();
  const sb3 = {
    S: {
      opcode: 'flippermove_steer',
      next: null, parent: null,
      inputs: {
        STEERING: [1, 'W'],
        VALUE:    [1, [4, '90']],
      },
      fields: { UNIT: ['degrees', null] },
      shadow: false, topLevel: true,
      x: 0, y: 0,
    },
    W: {
      opcode: 'flippermove_rotation-wheel',
      next: null, parent: 'S',
      inputs: {},
      fields: { 'field_flippermove_rotation-wheel': ['60', null] },
      shadow: true, topLevel: false,
    },
  };
  const state = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3);
  const top = state.blocks.blocks[0];
  assert.strictEqual(top.type, 'flippermove_steer');
  assert.strictEqual(top.fields && top.fields.STEERING, '60');
  assert.strictEqual(top.inputs && top.inputs.STEERING, undefined);
});

test('decodeInput: rotation-wheel labeled "right: N" / "left: N" / "straight" normalize correctly', () => {
  // The Spike rotation-wheel widget can store its value in any of several
  // textual forms — labeled, bare, or "straight". Verify each round-trips
  // to the right signed integer in the STEERING field.
  const ctx = env();
  const cases = [
    { raw: 'right: 65',   want: '65'   },
    { raw: 'left: 30',    want: '-30'  },
    { raw: 'straight',    want: '0'    },
    { raw: '60',          want: '60'   },
    { raw: '-25',         want: '-25'  },
    { raw: 'right: 12.5', want: '12.5' },
  ];
  for (const c of cases) {
    const sb3 = {
      S: { opcode: 'flippermove_steer', next: null, parent: null,
           inputs: { STEERING: [1, 'W'], VALUE: [1, [4, '1']] },
           fields: { UNIT: ['rotations', null] },
           shadow: false, topLevel: true, x: 0, y: 0 },
      W: { opcode: 'flippermove_rotation-wheel', next: null, parent: 'S',
           inputs: {}, fields: { 'field_flippermove_rotation-wheel': [c.raw, null] },
           shadow: true, topLevel: false },
    };
    const top = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks[0];
    assert.strictEqual(top.fields.STEERING, c.want,
      `rotation-wheel ${JSON.stringify(c.raw)} should map to ${c.want}`);
  }
});

test('decodeInput: flippermove_setDistance DISTANCE keeps a math_number shadow (input slot, not field)', () => {
  // setDistance DISTANCE is an input_value on the Blockly side — connecting a
  // variable should work. So Spike's `custom-set-move-distance-number` shadow
  // must be normalized to a math_number shadow that lives in the input slot,
  // not demoted to a field.
  const ctx = env();
  const sb3 = {
    D: { opcode: 'flippermove_setDistance', next: null, parent: null,
         inputs: { DISTANCE: [1, 'N'] },
         fields: { UNIT: ['cm', null] },
         shadow: false, topLevel: true, x: 0, y: 0 },
    N: { opcode: 'flippermove_custom-set-move-distance-number',
         next: null, parent: 'D', inputs: {},
         fields: { 'field_flippermove_custom-set-move-distance-number': ['17.5', null] },
         shadow: true, topLevel: false },
  };
  const top = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks[0];
  assert.strictEqual(top.type, 'flippermove_setDistance');
  assert.ok(top.inputs && top.inputs.DISTANCE, 'DISTANCE remains an input');
  assert.strictEqual(top.inputs.DISTANCE.shadow.type, 'math_number');
  assert.strictEqual(top.inputs.DISTANCE.shadow.fields.NUM, '17.5');
  assert.strictEqual(top.fields && top.fields.DISTANCE, undefined,
    'DISTANCE must NOT be demoted to a field');
});

test('decodeInput: flippersensors_isTilted VALUE with custom-tilted shadow demotes to field', () => {
  const ctx = env();
  const sb3 = {
    T: { opcode: 'flippersensors_isTilted', next: null, parent: null,
         inputs: { VALUE: [1, 'V'] }, fields: {},
         shadow: false, topLevel: true, x: 0, y: 0 },
    V: { opcode: 'flippersensors_custom-tilted', next: null, parent: 'T',
         inputs: {}, fields: { 'field_flippersensors_custom-tilted': ['3', null] },
         shadow: true, topLevel: false },
  };
  const top = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks[0];
  assert.strictEqual(top.fields && top.fields.VALUE, '3');
  assert.strictEqual(top.inputs && top.inputs.VALUE, undefined);
});

test('decodeInput: flippermoremotor PORT shadows demote to field', () => {
  // Sample one from each multi-port and single-motor family to confirm the
  // new contract entries land in the right slot.
  const ctx = env();
  const sb3 = {
    A: { opcode: 'flippermoremotor_motorGoToRelativePosition', next: null, parent: null,
         inputs: { PORT: [1, 'PA'], POSITION: [1, [4, '90']] },
         fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
    PA: { opcode: 'flippermoremotor_multiple-port-selector', next: null, parent: 'A',
          inputs: {}, fields: { 'field_flippermoremotor_multiple-port-selector': ['CE', null] },
          shadow: true, topLevel: false },
    B: { opcode: 'flippermoremotor_position', next: null, parent: null,
         inputs: { PORT: [1, 'PB'] },
         fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
    PB: { opcode: 'flippermoremotor_single-motor-selector', next: null, parent: 'B',
          inputs: {}, fields: { 'field_flippermoremotor_single-motor-selector': ['B', null] },
          shadow: true, topLevel: false },
  };
  const blocks = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks;
  const a = blocks.find(b => b.type === 'flippermoremotor_motorGoToRelativePosition');
  const b = blocks.find(b => b.type === 'flippermoremotor_position');
  assert.strictEqual(a.fields.PORT, 'CE');
  assert.strictEqual(b.fields.PORT, 'B');
});

test('decodeInput: event_broadcast_menu shadow becomes a text shadow on event_broadcast', () => {
  // Spike (and Scratch generally) emit broadcast names as either an inline
  // type-11 primitive or a separate event_broadcast_menu shadow. Our
  // event_broadcast block expects a text shadow in BROADCAST_INPUT; the
  // normalizer rewrites the menu form so it lands correctly.
  const ctx = env();
  const sb3 = {
    A: { opcode: 'event_broadcast', next: null, parent: null,
         inputs: { BROADCAST_INPUT: [1, 'M'] }, fields: {},
         shadow: false, topLevel: true, x: 0, y: 0 },
    M: { opcode: 'event_broadcast_menu', next: null, parent: 'A',
         inputs: {}, fields: { BROADCAST_OPTION: ['hello-world', null] },
         shadow: true, topLevel: false },
  };
  const top = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks[0];
  assert.strictEqual(top.type, 'event_broadcast');
  assert.ok(top.inputs && top.inputs.BROADCAST_INPUT, 'BROADCAST_INPUT remains an input');
  assert.strictEqual(top.inputs.BROADCAST_INPUT.shadow.type, 'text');
  assert.strictEqual(top.inputs.BROADCAST_INPUT.shadow.fields.TEXT, 'hello-world');
});

test('decodeInput: inline event_broadcast primitive (type 11) decodes as text', () => {
  // Same case but with the inline form `[1, [11, "name", "id"]]`.
  const ctx = env();
  const sb3 = {
    A: { opcode: 'event_broadcast', next: null, parent: null,
         inputs: { BROADCAST_INPUT: [1, [11, 'greet', 'gID']] }, fields: {},
         shadow: false, topLevel: true, x: 0, y: 0 },
  };
  const top = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks[0];
  assert.strictEqual(top.inputs.BROADCAST_INPUT.shadow.type, 'text');
  assert.strictEqual(top.inputs.BROADCAST_INPUT.shadow.fields.TEXT, 'greet');
});

test('decodeInput: ACCELERATION menu (exception field name `acceleration`) demotes to field', () => {
  // `flippermoremove_menu_acceleration` / `flippermoremotor_menu_acceleration`
  // store their value under the plain key `acceleration`, not the standard
  // `field_<opcode>` pattern (same exception as flipperlight_menu_orientation).
  const ctx = env();
  const sb3 = {
    A: { opcode: 'flippermoremove_movementSetAcceleration', next: null, parent: null,
         inputs: { ACCELERATION: [1, 'M'] }, fields: {},
         shadow: false, topLevel: true, x: 0, y: 0 },
    M: { opcode: 'flippermoremove_menu_acceleration', next: null, parent: 'A',
         inputs: {}, fields: { acceleration: ['3000 3000', null] },
         shadow: true, topLevel: false },
  };
  const top = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3).blocks.blocks[0];
  assert.strictEqual(top.fields && top.fields.ACCELERATION, '3000 3000');
  assert.strictEqual(top.inputs && top.inputs.ACCELERATION, undefined);
});

test('emitBlock: all field values are strings (Scratch 3 spec)', () => {
  const ctx = env();
  const state = {
    blocks: { languageVersion: 0, blocks: [{
      type: 'flippermove_move',
      id: 'M',
      x: 0, y: 0,
      fields: { DIRECTION: 'forward', UNIT: 'cm' },
      inputs: {
        VALUE: { shadow: { type: 'math_number', id: 'V', fields: { NUM: 20 } } },
      },
    }] }
  };
  const out = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(state);
  for (const b of Object.values(out)) {
    for (const [name, pair] of Object.entries(b.fields || {})) {
      assert.strictEqual(typeof pair[0], 'string',
        `field ${b.opcode}.${name} value should be string, got ${typeof pair[0]} (${pair[0]})`);
    }
  }
});
