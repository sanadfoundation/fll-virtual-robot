// js/llsp3_blocks.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  // Shadow contract table.
  // Keyed by `${opcode}|${inputName}`. Each entry says: when this input is
  // unconnected (just a typed-in value or an icon picker), what shadow block
  // wraps it in the Scratch sb3?
  //
  // Sources for entries:
  //  1. tests/fixtures/llsp3/block-project.llsp3 → scratch.sb3 → project.json
  //  2. js/blockly_config.js block defs
  //  3. Spot-checks vs the alexandrehardy reference (license-clean: shape only)
  //
  // Catalogue exceptions as we find them. Anything not listed falls back to
  // a `math_number` shadow with default "10".
  const SHADOW_CONTRACT = {
    // ── flippermove ────────────────────────────────────────────────────────
    'flippermove_setMovementPair|PAIR':
      { opcode: 'flippermove_movement-port-selector',
        fieldName: 'field_flippermove_movement-port-selector',
        defaultValue: 'AB' },
    'flippermove_move|DIRECTION':
      { opcode: 'flippermove_custom-icon-direction',
        fieldName: 'field_flippermove_custom-icon-direction',
        defaultValue: 'forward' },
    'flippermove_startMove|DIRECTION':
      { opcode: 'flippermove_custom-icon-direction',
        fieldName: 'field_flippermove_custom-icon-direction',
        defaultValue: 'forward' },
    // ── flippermotor ───────────────────────────────────────────────────────
    'flippermotor_motorTurnForDirection|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorGoDirectionToPosition|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorStartDirection|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorStop|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorSetSpeed|PORT':
      { opcode: 'flippermotor_single-port-selector',
        fieldName: 'field_flippermotor_single-port-selector',
        defaultValue: 'A' },
    // ── flipperevents ──────────────────────────────────────────────────────
    'flipperevents_whenColor|VALUE':
      { opcode: 'flipperevents_color-selector',
        fieldName: 'field_flipperevents_color-selector',
        defaultValue: '3' },
    'flipperevents_whenPressed|VALUE':
      { opcode: 'flipperevents_press-selector',
        fieldName: 'field_flipperevents_press-selector',
        defaultValue: 'pressed' },
    // ── flippersound ───────────────────────────────────────────────────────
    'flippersound_playSoundUntilDone|SOUND':
      { opcode: 'flippersound_sound-selector',
        fieldName: 'field_flippersound_sound-selector',
        defaultValue: 'Cat Meow 1' },
    'flippersound_playSound|SOUND':
      { opcode: 'flippersound_sound-selector',
        fieldName: 'field_flippersound_sound-selector',
        defaultValue: 'Cat Meow 1' },
  };

  const NUMERIC_DEFAULT = { opcode: 'math_number', fieldName: 'NUM', defaultValue: '10' };
  const STRING_DEFAULT  = { opcode: 'text',        fieldName: 'TEXT', defaultValue: '' };

  // Inputs whose default shadow should be `text` rather than `math_number`.
  const STRING_INPUT_KEYS = new Set([
    'flipperlight_lightDisplayImageOnForTime|MATRIX',
    'flipperlight_lightDisplayImageOn|MATRIX',
    'flipperlight_lightDisplayText|TEXT',
    'flipperlight_ultrasonicLightUp|VALUE',
  ]);

  function shadowFor(opcode, inputName) {
    const key = `${opcode}|${inputName}`;
    if (SHADOW_CONTRACT[key]) return SHADOW_CONTRACT[key];
    if (STRING_INPUT_KEYS.has(key)) return STRING_DEFAULT;
    return NUMERIC_DEFAULT;
  }

  const SB3_ID_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-!#$%&()*+,.:;<=>?@[]^`{|}~';

  function genSb3Id() {
    let id = '';
    for (let i = 0; i < 20; i++) {
      id += SB3_ID_ALPHABET[Math.floor(Math.random() * SB3_ID_ALPHABET.length)];
    }
    return id;
  }

  // ── Blockly serialization → sb3 blocks ───────────────────────────────────
  // Blockly's `inputs` shape:  { INPUTNAME: { block: {...}, shadow: {...} } }
  // Blockly's `fields` shape:  { FIELDNAME: <value> }
  // Blockly's chain shape:     { ..., next: { block: {...} } }
  //
  // sb3's `inputs` shape:      { INPUTNAME: [N, blockId, shadowId?] }
  //   N=1 shadow only, N=2 block only, N=3 block-with-shadow
  // sb3's `fields` shape:      { FIELDNAME: [<value>, null] }

  function blocklyStateToSb3Blocks(state) {
    const out = {};
    const root = state && state.blocks && state.blocks.blocks;
    if (!Array.isArray(root)) return out;

    for (const top of root) {
      emitBlock(out, top, /* parentId */ null, /* topLevel */ true);
    }
    return out;
  }

  function emitBlock(out, blkly, parentId, topLevel) {
    const id = blkly.id || genSb3Id();
    const node = {
      opcode: blkly.type,
      next: null,
      parent: parentId,
      inputs: {},
      fields: convertFields(blkly.fields || {}),
      shadow: !!blkly.shadow,
      topLevel: !!topLevel,
    };
    if (topLevel) {
      node.x = (blkly.x === undefined ? 0 : blkly.x);
      node.y = (blkly.y === undefined ? 0 : blkly.y);
    }
    out[id] = node;

    for (const [name, inp] of Object.entries(blkly.inputs || {})) {
      node.inputs[name] = encodeInput(out, blkly.type, name, inp, id);
    }

    if (blkly.next && blkly.next.block) {
      const nextId = emitBlock(out, blkly.next.block, id, /* topLevel */ false);
      node.next = nextId;
    }
    return id;
  }

  function convertFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = [v, null];
    return out;
  }

  function encodeInput(out, parentOpcode, inputName, inp, parentId) {
    let shadowId = null;
    let blockId  = null;

    if (inp.shadow) {
      shadowId = emitBlock(out, { ...inp.shadow, shadow: true }, parentId, false);
    }
    if (inp.block) {
      blockId = emitBlock(out, inp.block, parentId, false);
    }

    if (shadowId && blockId) return [3, blockId, shadowId];
    if (blockId)             return [2, blockId];
    if (shadowId)            return [1, shadowId];

    // No block, no shadow — synthesize a default shadow from the contract.
    const contract = shadowFor(parentOpcode, inputName);
    const synthId = genSb3Id();
    out[synthId] = {
      opcode: contract.opcode,
      next: null, parent: parentId,
      inputs: {},
      fields: { [contract.fieldName]: [contract.defaultValue, null] },
      shadow: true, topLevel: false,
    };
    return [1, synthId];
  }

  LLSP3.blocks = { shadowFor, genSb3Id, blocklyStateToSb3Blocks, SHADOW_CONTRACT };
})(typeof window !== 'undefined' ? window : globalThis);
