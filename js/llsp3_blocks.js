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

  // ── sb3 blocks → Blockly serialization ───────────────────────────────────
  function sb3BlocksToBlocklyState(sb3Blocks) {
    const tops = Object.entries(sb3Blocks)
      .filter(([_, b]) => b.topLevel === true)
      .map(([id, _]) => buildBlocklyBlock(sb3Blocks, id));
    return { blocks: { languageVersion: 0, blocks: tops } };
  }

  function buildBlocklyBlock(sb3, id) {
    const sb = sb3[id];
    const blkly = {
      type: sb.opcode,
      id,
    };
    if (sb.topLevel) {
      blkly.x = sb.x || 0;
      blkly.y = sb.y || 0;
    }

    const fields = {};
    for (const [k, v] of Object.entries(sb.fields || {})) fields[k] = v[0];
    if (Object.keys(fields).length) blkly.fields = fields;

    const inputs = {};
    for (const [name, value] of Object.entries(sb.inputs || {})) {
      const built = decodeInput(sb3, value);
      if (built) inputs[name] = built;
    }
    if (Object.keys(inputs).length) blkly.inputs = inputs;

    if (sb.next) {
      blkly.next = { block: buildBlocklyBlock(sb3, sb.next) };
      delete blkly.next.block.x;
      delete blkly.next.block.y;
    }
    return blkly;
  }

  function decodeInput(sb3, value) {
    // value is one of:
    //   [1, idOrPrimitive]       — shadow only
    //   [2, blockId]             — block only
    //   [3, blockId, shadowId]   — block-with-shadow
    const tag = value[0];
    const a = value[1];
    const b = value[2];

    function decodeShadowSlot(slot) {
      if (Array.isArray(slot)) {
        // Inline primitive: [4, "10"] etc.
        const ptype = slot[0];
        const pval  = slot[1];
        if (ptype === 4 || ptype === 5 || ptype === 6 || ptype === 7 || ptype === 8) {
          return { type: 'math_number', fields: { NUM: pval } };
        }
        if (ptype === 9)  return { type: 'colour_picker', fields: { COLOUR: pval } };
        if (ptype === 10) return { type: 'text', fields: { TEXT: pval } };
        if (ptype === 11) return { type: 'event_broadcast_menu', fields: { BROADCAST_OPTION: pval } };
        return { type: 'math_number', fields: { NUM: String(pval) } };
      }
      const blk = buildBlocklyBlock(sb3, slot);
      delete blk.x; delete blk.y;
      return blk;
    }

    if (tag === 1) return { shadow: decodeShadowSlot(a) };
    if (tag === 2) return { block: decodeShadowSlot(a) };
    if (tag === 3) return { block: decodeShadowSlot(a), shadow: decodeShadowSlot(b) };
    return null;
  }

  // ── sb3 envelope ─────────────────────────────────────────────────────────
  const META = {
    semver: '3.0.0',
    vm: '0.2.0-prerelease.20200512204241',
    agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
  };

  function defaultStage() {
    return {
      isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {},
      blocks: {}, comments: {}, currentCostume: 0,
      costumes: [{
        assetId: 'd41d8cd98f00b204e9800998ecf8427e',
        name: 'backdrop1',
        bitmapResolution: 1,
        md5ext: 'd41d8cd98f00b204e9800998ecf8427e.svg',
        dataFormat: 'svg',
        rotationCenterX: 47, rotationCenterY: 55,
      }],
      sounds: [], volume: 0, tempo: 60,
      videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null,
    };
  }

  function defaultSpriteName() {
    let n = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < 20; i++) n += alphabet[Math.floor(Math.random() * alphabet.length)];
    return n;
  }

  function defaultSprite(blocks) {
    return {
      isStage: false, name: defaultSpriteName(),
      variables: {}, lists: {}, broadcasts: {},
      blocks, comments: {}, currentCostume: 0,
      costumes: [{
        assetId: 'd41d8cd98f00b204e9800998ecf8427e',
        name: defaultSpriteName(),
        bitmapResolution: 1,
        md5ext: 'd41d8cd98f00b204e9800998ecf8427e.svg',
        dataFormat: 'svg',
        rotationCenterX: 240, rotationCenterY: 180,
      }],
      sounds: [{
        assetId: '1b8b032b06360a6cf7c31d86bddd144b',
        name: 'Cat Meow 1',
        dataFormat: 'wav',
        rate: 48000, sampleCount: 60000,
        md5ext: '1b8b032b06360a6cf7c31d86bddd144b.wav',
      }],
      volume: 100, visible: true, x: 0, y: 0, size: 100, direction: 90,
      draggable: false, rotationStyle: 'all around',
    };
  }

  function deriveExtensions(blocks) {
    const set = new Set();
    for (const b of Object.values(blocks)) {
      const m = /^([a-z]+)_/.exec(b.opcode || '');
      if (m && m[1].startsWith('flipper')) set.add(m[1]);
    }
    return Array.from(set).sort();
  }

  async function writeSb3(blocks, extensionsOverride) {
    const project = {
      targets: [defaultStage(), defaultSprite(blocks)],
      monitors: [],
      extensions: extensionsOverride || deriveExtensions(blocks),
      meta: META,
    };
    const zip = new (global.JSZip)();
    zip.file('project.json', JSON.stringify(project));
    zip.file(LLSP3.assets.SOUND_CAT_MEOW_1_FILENAME,
             LLSP3.assets.base64ToUint8(LLSP3.assets.SOUND_CAT_MEOW_1_BASE64));
    zip.file(LLSP3.assets.EMPTY_SVG_FILENAME, LLSP3.assets.EMPTY_SVG);
    return await zip.generateAsync({ type: 'uint8array' });
  }

  async function readSb3(bytes) {
    const zip = await (global.JSZip).loadAsync(bytes);
    const projectEntry = zip.file('project.json');
    if (!projectEntry) throw new Error('scratch.sb3 missing project.json');
    const project = JSON.parse(await projectEntry.async('string'));

    const allBlocks = {};
    for (const t of project.targets || []) {
      if (t.isStage) continue;
      Object.assign(allBlocks, t.blocks || {});
    }
    return { blocks: allBlocks, extensions: project.extensions || [] };
  }

  LLSP3.blocks = {
    shadowFor, genSb3Id,
    blocklyStateToSb3Blocks, sb3BlocksToBlocklyState,
    writeSb3, readSb3, deriveExtensions,
    SHADOW_CONTRACT,
  };
})(typeof window !== 'undefined' ? window : globalThis);
