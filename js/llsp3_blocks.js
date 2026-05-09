// js/llsp3_blocks.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  // ── Shadow contract table (authoritative) ────────────────────────────────
  // Spike Prime selector shadow blocks for parent inputs. Cross-checked
  // against astrospark/flippertools strings.json and
  // alexandrehardy/lego-spike-simulator src/lib/blockly/blocks.ts.
  //
  // Most selector shadows store their selection in a field named
  // `field_<opcode>`. The single exception is `flipperlight_menu_orientation`,
  // whose field is plain `orientation`.
  //
  // Several Spike blocks expose dropdowns that are real Blockly field_dropdowns
  // on the parent (no shadow): UNIT/COMPARATOR/EVENT/OPTION fields on most
  // blocks, plus several whole event blocks (whenButton, whenGesture,
  // whenOrientation, buttonIsPressed). Those are NOT in this table — they
  // stay as field_dropdown when emitted.
  const SHADOW_CONTRACT = {
    // ── flippermotor ──────────────────────────────────────────────────────
    'flippermotor_motorTurnForDirection|PORT':
      { opcode: 'flippermotor_multiple-port-selector',
        fieldName: 'field_flippermotor_multiple-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorTurnForDirection|DIRECTION':
      { opcode: 'flippermotor_custom-icon-direction',
        fieldName: 'field_flippermotor_custom-icon-direction',
        defaultValue: 'clockwise' },
    'flippermotor_motorGoDirectionToPosition|PORT':
      { opcode: 'flippermotor_multiple-port-selector',
        fieldName: 'field_flippermotor_multiple-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorGoDirectionToPosition|POSITION':
      { opcode: 'flippermotor_custom-angle',
        fieldName: 'field_flippermotor_custom-angle',
        defaultValue: '0' },
    'flippermotor_motorStartDirection|PORT':
      { opcode: 'flippermotor_multiple-port-selector',
        fieldName: 'field_flippermotor_multiple-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorStartDirection|DIRECTION':
      { opcode: 'flippermotor_custom-icon-direction',
        fieldName: 'field_flippermotor_custom-icon-direction',
        defaultValue: 'clockwise' },
    'flippermotor_motorStop|PORT':
      { opcode: 'flippermotor_multiple-port-selector',
        fieldName: 'field_flippermotor_multiple-port-selector',
        defaultValue: 'A' },
    'flippermotor_motorSetSpeed|PORT':
      { opcode: 'flippermotor_multiple-port-selector',
        fieldName: 'field_flippermotor_multiple-port-selector',
        defaultValue: 'A' },
    // Getters use the *single*-motor selector, not the multi-port one.
    'flippermotor_absolutePosition|PORT':
      { opcode: 'flippermotor_single-motor-selector',
        fieldName: 'field_flippermotor_single-motor-selector',
        defaultValue: 'A' },
    'flippermotor_speed|PORT':
      { opcode: 'flippermotor_single-motor-selector',
        fieldName: 'field_flippermotor_single-motor-selector',
        defaultValue: 'A' },

    // ── flippermove ───────────────────────────────────────────────────────
    'flippermove_move|DIRECTION':
      { opcode: 'flippermove_custom-icon-direction',
        fieldName: 'field_flippermove_custom-icon-direction',
        defaultValue: 'forward' },
    'flippermove_startMove|DIRECTION':
      { opcode: 'flippermove_custom-icon-direction',
        fieldName: 'field_flippermove_custom-icon-direction',
        defaultValue: 'forward' },
    'flippermove_setMovementPair|PAIR':
      { opcode: 'flippermove_movement-port-selector',
        fieldName: 'field_flippermove_movement-port-selector',
        defaultValue: 'AB' },

    // ── flipperevents ─────────────────────────────────────────────────────
    'flipperevents_whenColor|PORT':
      { opcode: 'flipperevents_color-sensor-selector',
        fieldName: 'field_flipperevents_color-sensor-selector',
        defaultValue: 'A' },
    'flipperevents_whenColor|OPTION':
      { opcode: 'flipperevents_color-selector',
        fieldName: 'field_flipperevents_color-selector',
        defaultValue: '9' },
    'flipperevents_whenPressed|PORT':
      { opcode: 'flipperevents_force-sensor-selector',
        fieldName: 'field_flipperevents_force-sensor-selector',
        defaultValue: 'A' },
    'flipperevents_whenTilted|VALUE':
      { opcode: 'flipperevents_custom-tilted',
        fieldName: 'field_flipperevents_custom-tilted',
        defaultValue: '1' },

    // ── flippersensors ────────────────────────────────────────────────────
    'flippersensors_isPressed|PORT':
      { opcode: 'flippersensors_force-sensor-selector',
        fieldName: 'field_flippersensors_force-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_force|PORT':
      { opcode: 'flippersensors_force-sensor-selector',
        fieldName: 'field_flippersensors_force-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_isDistance|PORT':
      { opcode: 'flippersensors_distance-sensor-selector',
        fieldName: 'field_flippersensors_distance-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_distance|PORT':
      { opcode: 'flippersensors_distance-sensor-selector',
        fieldName: 'field_flippersensors_distance-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_isColor|PORT':
      { opcode: 'flippersensors_color-sensor-selector',
        fieldName: 'field_flippersensors_color-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_isColor|VALUE':
      { opcode: 'flippersensors_color-selector',
        fieldName: 'field_flippersensors_color-selector',
        defaultValue: '9' },
    'flippersensors_color|PORT':
      { opcode: 'flippersensors_color-sensor-selector',
        fieldName: 'field_flippersensors_color-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_isReflectivity|PORT':
      { opcode: 'flippersensors_color-sensor-selector',
        fieldName: 'field_flippersensors_color-sensor-selector',
        defaultValue: 'A' },
    'flippersensors_reflectivity|PORT':
      { opcode: 'flippersensors_color-sensor-selector',
        fieldName: 'field_flippersensors_color-sensor-selector',
        defaultValue: 'A' },

    // ── flipperlight ──────────────────────────────────────────────────────
    'flipperlight_centerButtonLight|COLOR':
      { opcode: 'flipperlight_color-selector-vertical',
        fieldName: 'field_flipperlight_color-selector-vertical',
        defaultValue: '9' },
    'flipperlight_lightDisplayRotate|DIRECTION':
      { opcode: 'flipperlight_custom-icon-direction',
        fieldName: 'field_flipperlight_custom-icon-direction',
        defaultValue: 'clockwise' },
    'flipperlight_lightDisplaySetOrientation|ORIENTATION':
      // EXCEPTION: field is plain `orientation`, NOT field_<opcode>.
      // Confirmed in flippertools strings.json.
      { opcode: 'flipperlight_menu_orientation',
        fieldName: 'orientation',
        defaultValue: '1' },
    'flipperlight_ultrasonicLightUp|PORT':
      { opcode: 'flipperlight_distance-sensor-selector',
        fieldName: 'field_flipperlight_distance-sensor-selector',
        defaultValue: 'A' },
    'flipperlight_ultrasonicLightUp|VALUE':
      { opcode: 'flipperlight_led-selector',
        fieldName: 'field_flipperlight_led-selector',
        defaultValue: '100 100 100 100' },
    // Spike serializes lightDisplayText TEXT as an inline text-shadow input,
    // but our Blockly model holds it as a field_input (no quote glyphs). On
    // export we promote field → input shadow; on import we demote inline
    // text primitive → field via tryDemoteInputToField.
    'flipperlight_lightDisplayText|TEXT':
      { opcode: 'text', fieldName: 'TEXT', defaultValue: 'Hello' },

    // ── flippersound ──────────────────────────────────────────────────────
    'flippersound_playSoundUntilDone|SOUND':
      { opcode: 'flippersound_sound-selector',
        fieldName: 'field_flippersound_sound-selector',
        defaultValue: '{"name":"Cat Meow 1","location":"device"}' },
    'flippersound_playSound|SOUND':
      { opcode: 'flippersound_sound-selector',
        fieldName: 'field_flippersound_sound-selector',
        defaultValue: '{"name":"Cat Meow 1","location":"device"}' },
  };

  const NUMERIC_DEFAULT = { opcode: 'math_number', fieldName: 'NUM', defaultValue: '10' };
  const STRING_DEFAULT  = { opcode: 'text',        fieldName: 'TEXT', defaultValue: '' };

  // Inputs whose default shadow should be `text` rather than `math_number`.
  const STRING_INPUT_KEYS = new Set([
    'flipperlight_lightDisplayImageOnForTime|MATRIX',
    'flipperlight_lightDisplayImageOn|MATRIX',
    'flipperlight_ultrasonicLightUp|VALUE',
  ]);

  function shadowFor(opcode, inputName) {
    const key = `${opcode}|${inputName}`;
    if (SHADOW_CONTRACT[key]) return SHADOW_CONTRACT[key];
    if (STRING_INPUT_KEYS.has(key)) return STRING_DEFAULT;
    return NUMERIC_DEFAULT;
  }

  // Trimmed against the chars seen in Spike-app-emitted block IDs in
  // tests/fixtures/llsp3/block-project.llsp3. Excludes: < > = & @ '
  // The "<" / ">" exclusion matters: Spike's parser appears to silently
  // reject blocks whose IDs contain HTML-special characters, dropping the
  // entire stack from the rendered project. Keep the alphabet conservative.
  const SB3_ID_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-!#$%()*+,.:;?[]^`{|}~';

  function genSb3Id() {
    let id = '';
    for (let i = 0; i < 20; i++) {
      id += SB3_ID_ALPHABET[Math.floor(Math.random() * SB3_ID_ALPHABET.length)];
    }
    return id;
  }

  // Map Blockly-shadow shapes to Scratch 3 inline primitive type codes.
  // Returns null if the shadow is not eligible for inline-primitive compression
  // (i.e. has a nested block, has multiple fields, or is a non-primitive type).
  const PRIMITIVE_TYPE_BY_OPCODE = {
    math_number:           [4, 'NUM'],
    math_positive_number:  [5, 'NUM'],
    math_whole_number:     [6, 'NUM'],
    math_integer:          [7, 'NUM'],
    math_angle:            [8, 'NUM'],
    colour_picker:         [9, 'COLOUR'],
    text:                  [10, 'TEXT'],
    // event_broadcast_menu (11) needs a (name, id) tuple — defer to verbose form.
  };

  function tryInlinePrimitive(shadow) {
    if (!shadow || typeof shadow !== 'object') return null;
    if (shadow.next) return null;
    if (shadow.inputs && Object.keys(shadow.inputs).length) return null;
    const entry = PRIMITIVE_TYPE_BY_OPCODE[shadow.type];
    if (!entry) return null;
    const [typeCode, fieldName] = entry;
    const value = shadow.fields && shadow.fields[fieldName];
    if (value === undefined || value === null) return null;
    return [typeCode, String(value)];
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
      fields: {},  // populated below; promoted entries skip this
      shadow: !!blkly.shadow,
      topLevel: !!topLevel,
    };
    if (topLevel) {
      node.x = (blkly.x === undefined ? 0 : blkly.x);
      node.y = (blkly.y === undefined ? 0 : blkly.y);
    }
    out[id] = node;

    const blklyFields = blkly.fields || {};
    const blklyInputs = blkly.inputs || {};
    const handledFieldNames = new Set();

    // (1) For every SHADOW_CONTRACT entry whose parent opcode matches this
    //     block, emit a promoted input. Use the serialized field value when
    //     present, otherwise the contract default. (Blockly omits default-
    //     valued fields from serialization, so always-emit is necessary.)
    for (const key of Object.keys(SHADOW_CONTRACT)) {
      const sep = key.indexOf('|');
      if (sep < 0) continue;
      if (key.slice(0, sep) !== blkly.type) continue;
      const fieldName = key.slice(sep + 1);

      // Don't clobber an explicitly provided input.
      if (blklyInputs[fieldName] !== undefined) continue;

      const contract = SHADOW_CONTRACT[key];
      const value = blklyFields[fieldName] !== undefined
        ? blklyFields[fieldName]
        : contract.defaultValue;

      // Spike's strict sb3 validator drops the verbose (separate-block) form
      // for trivial primitive shadows, so prefer the inline encoding when the
      // contract opcode is a known primitive (text, math_number, ...).
      const inlineEntry = PRIMITIVE_TYPE_BY_OPCODE[contract.opcode];
      if (inlineEntry) {
        node.inputs[fieldName] = [1, [inlineEntry[0], String(value)]];
      } else {
        const synthId = genSb3Id();
        out[synthId] = {
          opcode: contract.opcode,
          next: null, parent: id,
          inputs: {},
          fields: { [contract.fieldName]: [String(value), null] },
          shadow: true, topLevel: false,
        };
        node.inputs[fieldName] = [1, synthId];
      }
      handledFieldNames.add(fieldName);
    }

    // (2) Remaining Blockly fields → emit as sb3 fields (these are real
    //     field_dropdown values that Spike also stores as fields).
    for (const [fieldName, fieldValue] of Object.entries(blklyFields)) {
      if (handledFieldNames.has(fieldName)) continue;
      // Scratch 3 spec: field values must be strings, regardless of whether
      // the field is conceptually numeric. Coerce here.
      node.fields[fieldName] = [
        (fieldValue === null || fieldValue === undefined) ? fieldValue : String(fieldValue),
        null,
      ];
    }

    // Inputs: process any explicit Blockly inputs (these may include
    // already-shadowed selectors AND value-typed slots like math_number).
    for (const [name, inp] of Object.entries(blkly.inputs || {})) {
      node.inputs[name] = encodeInput(out, blkly.type, name, inp, id);
    }

    if (blkly.next && blkly.next.block) {
      const nextId = emitBlock(out, blkly.next.block, id, /* topLevel */ false);
      node.next = nextId;
    }
    return id;
  }

  function encodeInput(out, parentOpcode, inputName, inp, parentId) {
    // Try to compress trivial shadow + no nested block to inline primitive.
    // Spike Prime strict-validates the Scratch 3 sb3 format and silently drops
    // blocks/stacks that use the verbose (separate-block) form for trivial
    // primitive shadows.
    if (inp.shadow && !inp.block) {
      const inline = tryInlinePrimitive(inp.shadow);
      if (inline) return [1, inline];
    }

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
    // For numeric/text contract defaults, use the inline-primitive form.
    const contract = shadowFor(parentOpcode, inputName);
    const inlineEntry = PRIMITIVE_TYPE_BY_OPCODE[contract.opcode];
    if (inlineEntry) {
      return [1, [inlineEntry[0], String(contract.defaultValue)]];
    }
    // Otherwise emit a separate shadow block referencing the contract.
    const synthId = genSb3Id();
    out[synthId] = {
      opcode: contract.opcode,
      next: null, parent: parentId,
      inputs: {},
      fields: { [contract.fieldName]: [String(contract.defaultValue), null] },
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

    // Fields (start from sb3 fields; we'll add demoted inputs below).
    const fields = {};
    for (const [k, v] of Object.entries(sb.fields || {})) fields[k] = v[0];

    // Inputs: demote contract-matching shadow-only inputs back to Blockly
    // fields when the shadow opcode matches the contract.
    const inputs = {};
    for (const [name, value] of Object.entries(sb.inputs || {})) {
      const contract = SHADOW_CONTRACT[`${sb.opcode}|${name}`];
      const demoted = contract && tryDemoteInputToField(sb3, value, contract);
      if (demoted !== undefined) {
        fields[name] = demoted;
        continue;
      }
      const built = decodeInput(sb3, value);
      if (built) inputs[name] = built;
    }
    if (Object.keys(fields).length) blkly.fields = fields;
    if (Object.keys(inputs).length) blkly.inputs = inputs;

    if (sb.next) {
      blkly.next = { block: buildBlocklyBlock(sb3, sb.next) };
      delete blkly.next.block.x;
      delete blkly.next.block.y;
    }
    return blkly;
  }

  function tryDemoteInputToField(sb3, value, contract) {
    // Demotion applies to shadow-only inputs (tag 1) in either form:
    //   [1, "<id>"]              — separate shadow block
    //   [1, [<ptype>, "<val>"]]  — inline primitive (math_number / text / ...)
    if (!Array.isArray(value)) return undefined;
    if (value[0] !== 1) return undefined;
    const slot = value[1];
    if (Array.isArray(slot)) {
      const ptype = slot[0];
      const pval  = slot[1];
      if (contract.opcode === 'text' && ptype === 10) return String(pval);
      if (contract.opcode === 'math_number' && (ptype === 4 || ptype === 5 || ptype === 6 || ptype === 7 || ptype === 8)) return String(pval);
      return undefined;
    }
    if (typeof slot !== 'string') return undefined;
    const shadow = sb3[slot];
    if (!shadow || shadow.opcode !== contract.opcode) return undefined;
    const fieldEntry = (shadow.fields || {})[contract.fieldName];
    if (!fieldEntry) return undefined;
    return fieldEntry[0];
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
