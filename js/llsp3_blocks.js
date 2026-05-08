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

  LLSP3.blocks = { shadowFor, SHADOW_CONTRACT };
})(typeof window !== 'undefined' ? window : globalThis);
