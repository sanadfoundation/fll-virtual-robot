// js/myblocks_blocks.js
//
// SPIKE My Blocks — custom Blockly block types + mutator support.
//
// Five conceptual block types map to four user-facing Blockly registrations:
//   myblocks_definition      — the hat that starts a custom-block body
//   myblocks_call            — the call-site stack block
//   myblocks_arg_string_number — round arg-reporter (in the body)
//   myblocks_arg_boolean     — hex arg-reporter (in the body)
//
// The fifth (`procedures_prototype` in Scratch's model) is synthesised only
// at LLSP3 export time and consumed at import time; we don't keep it as a
// live Blockly block.
//
// State model: every definition and every call carries an `argspec_` (ordered
// list of {kind:'label'|'arg', ...} tokens) and a `procId_` (uuid). Calls and
// the definition link by procId, *not* by name — renaming labels doesn't
// orphan call sites. Body arg-reporters link to the enclosing definition by
// argId (an id minted per arg slot), so renaming an arg in the definition
// just rewrites the displayed name in all reporters, no collision risk.
//
// The pure helpers (slugifyName, derivedNameFromArgspec, genId, seedArgspec,
// makeArgToken) are exported on `window.MyBlocks` so the proccode helpers
// and the modal can use them without going through Blockly.
'use strict';
(function (global) {
  const MyBlocks = (global.MyBlocks = global.MyBlocks || {});

  // 20-char alphabetic id, matching the scratch-blocks/SB3 id alphabet shape
  // (real sb3 ids include more punctuation, but we never expose ours to the
  // outside world — round-trip remaps them).
  const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  function genId() {
    let s = '';
    for (let i = 0; i < 20; i++) {
      s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    return s;
  }

  // Turn a user-typed display name into a JS-identifier-safe slug. Used for
  // the generated `async function <slug>(...)`. Pure: same input → same
  // output, regardless of state.
  function slugifyName(name) {
    const raw = String(name || '').trim().toLowerCase();
    if (raw === '') return 'my_block';
    let s = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (s === '') s = '_';
    if (/^[0-9]/.test(s)) s = '_' + s;
    return s;
  }

  // Compute the human-readable display name from an argspec by joining only
  // the label tokens. We strip arg slots — they're not part of the procedure
  // identifier from the user's perspective. If there are no labels (rare; an
  // argspec that's all args) fall back to a default so we never name a
  // procedure '' or stringify to undefined.
  function derivedNameFromArgspec(argspec) {
    const labels = (argspec || [])
      .filter(t => t.kind === 'label')
      .map(t => String(t.text || ''));
    const joined = labels.join(' ').replace(/\s+/g, ' ').trim();
    return joined === '' ? 'my_block' : joined;
  }

  // Initial argspec for a fresh definition — one editable label that reads
  // "block name", matching SPIKE's modal placeholder.
  function seedArgspec() {
    return [{ kind: 'label', text: 'block name' }];
  }

  // Factory for the three things the modal can add: a number/text arg, a
  // boolean arg, or a label. Mirrors SPIKE's three modal option cards.
  function makeArgToken(kind, text) {
    if (kind === 'label') {
      return { kind: 'label', text: text !== undefined ? String(text) : 'label text' };
    }
    if (kind === 'boolean') {
      return { kind: 'arg', argKind: 'boolean', name: 'boolean',
               argId: genId(), defaultValue: 'false' };
    }
    // 'number' (the modal label is "Add an input — number or text")
    return { kind: 'arg', argKind: 'string_number', name: 'number',
             argId: genId(), defaultValue: '' };
  }

  // Click-to-spawn helper for the definition hat's arg pills. Given an
  // argspec and a 0-based "arg slot index" (counting only arg tokens,
  // skipping labels), produces the descriptor a custom field's mousedown
  // handler uses to mint a fresh body reporter on the workspace.
  function spawnDescriptorForArg(argspec, slotIdx) {
    if (!Array.isArray(argspec) || !Number.isInteger(slotIdx) || slotIdx < 0) return null;
    let i = 0;
    for (const tok of argspec) {
      if (tok.kind !== 'arg') continue;
      if (i === slotIdx) {
        return {
          type: tok.argKind === 'boolean' ? 'myblocks_arg_boolean' : 'myblocks_arg_string_number',
          argId: tok.argId || '',
          name:  tok.name  || '',
        };
      }
      i++;
    }
    return null;
  }

  MyBlocks.genId                 = genId;
  MyBlocks.slugifyName           = slugifyName;
  MyBlocks.derivedNameFromArgspec= derivedNameFromArgspec;
  MyBlocks.seedArgspec           = seedArgspec;
  MyBlocks.makeArgToken          = makeArgToken;
  MyBlocks.spawnDescriptorForArg = spawnDescriptorForArg;

  // ── Blockly block registrations ────────────────────────────────────────────
  // Only run when Blockly is on the page (i.e. in the browser, not in Node
  // unit tests). The pure helpers above stay available either way.
  if (typeof global.Blockly === 'undefined') return;
  const Blockly = global.Blockly;

  // Colour matches the existing C_MYBLOCKS in blockly_config.js. Imported
  // here as a literal so this module is loadable independently.
  const C_MYBLOCKS = '#ff5d64';

  // FieldArgPillSpawn: clickable arg-name pill on the definition hat,
  // drawn with the SPIKE-style oval (string_number) or hexagon (boolean)
  // background. On click, mints a fresh body reporter for this arg at the
  // user's click coordinate (drag-from-hat replacement — same destination,
  // one click instead of one continuous gesture).
  //
  // Visual: darker-pink (#d0454d) shape with white text — matching the
  // LEGO editor's hat pill style. Shape redrawn on every render_ so it
  // tracks text-width changes (e.g. after a rename).
  const PILL_FILL = '#d0454d';
  const PILL_TEXT = '#ffffff';
  // Horizontal padding inside the pill. Wider than typical Blockly fields
  // because the hex/oval ends visually eat ~height/2 each side, so the
  // *usable* center for short single-letter names ("j", "k") collapses
  // without generous breathing room.
  const PILL_PAD_X = 16;
  // Minimum pill width — even a 1-character name gets a recognizable shape
  // (roughly 2× height so the oval reads as a "pill", not a circle).
  const PILL_MIN_W = 40;

  class FieldArgPillSpawn extends Blockly.FieldLabelSerializable {
    constructor(text, slotIdx, argKind) {
      super(text);
      this.slotIdx_ = slotIdx;
      this.argKind_ = argKind || 'string_number';
      this.EDITABLE = true;       // so Blockly registers a click handler
      this.SERIALIZABLE = true;   // we want the displayed name persisted
      this.pillEl_ = null;
    }

    initView() {
      // Prepend a <path> for the pill background so it sits BEHIND the text.
      this.pillEl_ = Blockly.utils.dom.createSvgElement('path',
        { fill: PILL_FILL, stroke: 'none' }, this.fieldGroup_);
      super.initView();
      if (this.textElement_) {
        // Move text to end of children stack and recolor white.
        this.fieldGroup_.appendChild(this.textElement_);
        this.textElement_.setAttribute('fill', PILL_TEXT);
        this.textElement_.style.fill = PILL_TEXT;
      }
    }

    applyColour() {
      // Override Blockly's default colour application — we always want
      // white text on the dark-pink pill, regardless of block colour.
      if (this.textElement_) {
        this.textElement_.setAttribute('fill', PILL_TEXT);
        this.textElement_.style.fill = PILL_TEXT;
      }
    }

    render_() {
      super.render_();
      if (!this.pillEl_) return;
      // Width tracks the text + padding; height matches Blockly's field height.
      const textWidth = (this.textElement_ && this.textElement_.getComputedTextLength)
        ? this.textElement_.getComputedTextLength()
        : Math.max((this.getDisplayText_() || '').length * 7, 20);
      const height = (this.constants_ && this.constants_.FIELD_TEXT_HEIGHT) || 14;
      const w = Math.max(textWidth + PILL_PAD_X * 2, PILL_MIN_W);
      if (this.argKind_ === 'boolean') {
        // Hexagon (flat-top): chevron points at the left/right midpoints.
        const slant = height / 2;
        this.pillEl_.setAttribute('d',
          `M 0 ${height/2} L ${slant} 0 H ${w - slant} L ${w} ${height/2} L ${w - slant} ${height} H ${slant} Z`);
      } else {
        // Round-rect (oval cap): rounded ends of radius height/2.
        const r = height / 2;
        this.pillEl_.setAttribute('d',
          `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${height} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`);
      }
      if (this.textElement_) {
        this.textElement_.setAttribute('x', String(w / 2));
        this.textElement_.setAttribute('text-anchor', 'middle');
      }
      // Tell Blockly's layout engine our real width so it reserves the right space.
      this.size_.width = w;
    }

    showEditor_(opt_e) {
      const parent = this.sourceBlock_;
      if (!parent || parent.type !== 'myblocks_definition') return;
      const spec = parent.argspec_ || [];
      const desc = spawnDescriptorForArg(spec, this.slotIdx_);
      if (!desc) return;
      const ws = parent.workspace;
      if (!ws || ws.isFlyout) return;
      // Place the new reporter at the field's screen position, converted
      // to workspace coordinates. The user can drag from there into a slot.
      const pillRect = (this.fieldGroup_ && this.fieldGroup_.getBoundingClientRect)
        ? this.fieldGroup_.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0 };
      const wsXY = screenToWorkspace(ws, pillRect.left, pillRect.top);
      Blockly.serialization.blocks.append({
        type: desc.type,
        extraState: { argId: desc.argId, name: desc.name },
        fields:     { VALUE: desc.name },
        x: wsXY.x, y: wsXY.y,
      }, ws);
    }
  }

  function screenToWorkspace(ws, screenX, screenY) {
    // Blockly v10: workspace.getInverseScreenCTM() returns an SVG matrix
    // that maps screen → workspace coordinates. The CTM accounts for the
    // injection div offset, current scroll, and zoom level.
    if (!ws.getInverseScreenCTM) return { x: 0, y: 0 };
    const svg = ws.getParentSvg && ws.getParentSvg();
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    const m = ws.getInverseScreenCTM();
    const r = pt.matrixTransform(m);
    return { x: r.x, y: r.y };
  }

  function applyArgspecToDefinition(block) {
    // Wipe any pre-existing inputs (mutator re-init pattern).
    for (const inp of block.inputList.slice()) block.removeInput(inp.name);
    const spec = block.argspec_ || [];
    let input = block.appendDummyInput('ROW');
    let labelIdx = 0;
    let argIdx = 0;
    let added = false;
    for (const tok of spec) {
      if (tok.kind === 'label') {
        // Editable text — clicking opens Blockly's text-input popup. Each
        // label is a separate field so the user can rewrite any segment of
        // the proccode independently.
        input.appendField(new Blockly.FieldTextInput(tok.text || ''), 'LABEL' + labelIdx++);
      } else {
        // Click an arg pill to spawn a fresh body reporter for that arg at
        // the cursor — the drag-from-hat replacement (see CLAUDE.md). The
        // slot index counts only arg tokens, matching spawnDescriptorForArg.
        // The argKind drives shape: string_number → oval, boolean → hexagon.
        input.appendField(new FieldArgPillSpawn(tok.name || '', argIdx, tok.argKind), 'ARG' + argIdx);
        argIdx++;
      }
      added = true;
    }
    if (!added) {
      input.appendField(new Blockly.FieldLabel('block name'), 'LABEL0');
    }
  }

  function applyArgspecToCall(block) {
    for (const inp of block.inputList.slice()) block.removeInput(inp.name);
    const spec = block.argspec_ || [];
    let labelIdx = 0;
    let argIdx = 0;
    block.setInputsInline(true);
    let dummy = null;
    for (const tok of spec) {
      if (tok.kind === 'label') {
        if (!dummy) dummy = block.appendDummyInput('LABEL' + labelIdx++);
        dummy.appendField(new Blockly.FieldLabel(tok.text || ''));
      } else {
        const name = 'ARG' + argIdx++;
        if (tok.argKind === 'boolean') {
          block.appendValueInput(name).setCheck('Boolean');
        } else {
          block.appendValueInput(name).setCheck(['Number', 'String']);
        }
        dummy = null;
      }
    }
    if (argIdx === 0 && labelIdx === 0) {
      block.appendDummyInput('LABEL0').appendField(new Blockly.FieldLabel('block name'));
    }
  }

  // Sweep the workspace for all calls whose procId matches the given
  // definition and re-init their UI from the definition's argspec, preserving
  // any plugged-in value blocks at matching slot indices.
  function syncCallsToDefinition(workspace, def) {
    if (!workspace || !def) return;
    const procId = def.procId_;
    if (!procId) return;
    const calls = workspace.getAllBlocks(false).filter(
      b => b.type === 'myblocks_call' && b.procId_ === procId);
    for (const call of calls) {
      // Snapshot existing value-input connections by slot index.
      const oldConnections = [];
      const oldInputs = call.inputList.filter(i => i.name && i.name.startsWith('ARG'));
      for (const inp of oldInputs) {
        const target = inp.connection && inp.connection.targetBlock();
        oldConnections.push(target);
      }
      call.argspec_ = JSON.parse(JSON.stringify(def.argspec_ || []));
      applyArgspecToCall(call);
      // Re-attach. Slot indices align as long as args weren't reordered.
      const newInputs = call.inputList.filter(i => i.name && i.name.startsWith('ARG'));
      for (let i = 0; i < newInputs.length && i < oldConnections.length; i++) {
        const target = oldConnections[i];
        if (target && newInputs[i].connection) {
          const outConn = target.outputConnection;
          if (outConn) {
            try { newInputs[i].connection.connect(outConn); } catch (_e) { /* type mismatch */ }
          }
        }
      }
    }
  }

  MyBlocks.applyArgspecToDefinition = applyArgspecToDefinition;
  MyBlocks.applyArgspecToCall       = applyArgspecToCall;
  MyBlocks.syncCallsToDefinition    = syncCallsToDefinition;

  Blockly.Blocks['myblocks_definition'] = {
    init() {
      this.procId_ = genId();
      this.argspec_ = seedArgspec();
      // Colour MUST be set before fields are added: FieldTextInput's
      // applyColour reaches into renderer constants (FULL_BLOCK_FIELDS) that
      // aren't populated until initSvg, so doing setColour after the
      // FieldTextInput is appended crashes during init().
      this.setColour(C_MYBLOCKS);
      this.setNextStatement(true);
      this.setTooltip('Defines a custom block.');
      applyArgspecToDefinition(this);
    },
    saveExtraState() {
      return { procId: this.procId_ || '', argspec: this.argspec_ || [] };
    },
    loadExtraState(state) {
      this.procId_  = (state && state.procId)  || this.procId_ || genId();
      this.argspec_ = (state && state.argspec) || [];
      applyArgspecToDefinition(this);
    },
    // Blockly's flyout still drives drag via XML, and its XML→state bridge
    // doesn't convert lowercase mutation attributes to our camelCase keys
    // (procid → procId, argspec stays a string). Implement domToMutation so
    // drag-from-flyout populates extraState the same way as JSON load.
    mutationToDom() {
      const m = document.createElement('mutation');
      m.setAttribute('procid', this.procId_ || '');
      m.setAttribute('argspec', JSON.stringify(this.argspec_ || []));
      return m;
    },
    domToMutation(xml) {
      this.procId_ = xml.getAttribute('procid') || this.procId_ || genId();
      try { this.argspec_ = JSON.parse(xml.getAttribute('argspec') || '[]'); }
      catch (_e) { this.argspec_ = []; }
      applyArgspecToDefinition(this);
    },
  };

  Blockly.Blocks['myblocks_call'] = {
    init() {
      this.procId_ = '';
      this.argspec_ = [];
      // Colour must precede applyArgspecToCall — see note on
      // myblocks_definition above. FieldLabel doesn't have the same
      // applyColour issue but we set colour first for consistency.
      this.setColour(C_MYBLOCKS);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Runs a custom block.');
      applyArgspecToCall(this);
    },
    saveExtraState() {
      return { procId: this.procId_ || '', argspec: this.argspec_ || [] };
    },
    loadExtraState(state) {
      // Calls don't mint a procId — they inherit one from the matching
      // definition. Empty procId here just means "unlinked"; the workspace
      // change-listener (Phase C) reconnects when a matching def appears.
      this.procId_  = (state && state.procId)  || '';
      this.argspec_ = (state && state.argspec) || [];
      applyArgspecToCall(this);
    },
    mutationToDom() {
      const m = document.createElement('mutation');
      m.setAttribute('procid', this.procId_ || '');
      m.setAttribute('argspec', JSON.stringify(this.argspec_ || []));
      return m;
    },
    domToMutation(xml) {
      this.procId_ = xml.getAttribute('procid') || '';
      try { this.argspec_ = JSON.parse(xml.getAttribute('argspec') || '[]'); }
      catch (_e) { this.argspec_ = []; }
      applyArgspecToCall(this);
    },
  };

  // Body-side arg reporters. The displayed name lives in fields.VALUE and is
  // resolved at runtime by walking up to the enclosing definition and looking
  // up its argspec entry with the matching argId.
  Blockly.Blocks['myblocks_arg_string_number'] = {
    init() {
      this.argId_ = '';
      this.setColour(C_MYBLOCKS);
      this.setOutput(true, ['Number', 'String']);
      // FieldLabelSerializable (not FieldLabel) is required here: plain
      // FieldLabel creates its <text> element from the value at init time
      // and never refreshes it, so a post-init setValue (which is what
      // domToMutation / drag-from-flyout does) leaves the displayed label
      // blank. FieldLabelSerializable subclasses FieldLabel and properly
      // updates the DOM on setValue.
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'VALUE');
    },
    saveExtraState() {
      return { argId: this.argId_ || '', name: this.getFieldValue('VALUE') || '' };
    },
    loadExtraState(state) {
      this.argId_ = (state && state.argId) || '';
      if (state && state.name) this.setFieldValue(String(state.name), 'VALUE');
    },
    mutationToDom() {
      const m = document.createElement('mutation');
      m.setAttribute('argid', this.argId_ || '');
      m.setAttribute('name', this.getFieldValue('VALUE') || '');
      return m;
    },
    domToMutation(xml) {
      this.argId_ = xml.getAttribute('argid') || '';
      // The mutation also carries the displayed name so we don't depend on
      // <field> child ordering — Blockly v10 can clear the field if <mutation>
      // is processed AFTER <field> (the field setter happens but a subsequent
      // re-init wipes it). Re-applying here makes the order moot.
      const name = xml.getAttribute('name');
      if (name) this.setFieldValue(name, 'VALUE');
    },
  };

  Blockly.Blocks['myblocks_arg_boolean'] = {
    init() {
      this.argId_ = '';
      this.setColour(C_MYBLOCKS);
      this.setOutput(true, 'Boolean');
      // FieldLabelSerializable (not FieldLabel) is required here: plain
      // FieldLabel creates its <text> element from the value at init time
      // and never refreshes it, so a post-init setValue (which is what
      // domToMutation / drag-from-flyout does) leaves the displayed label
      // blank. FieldLabelSerializable subclasses FieldLabel and properly
      // updates the DOM on setValue.
      this.appendDummyInput().appendField(new Blockly.FieldLabelSerializable(''), 'VALUE');
    },
    saveExtraState() {
      return { argId: this.argId_ || '', name: this.getFieldValue('VALUE') || '' };
    },
    loadExtraState(state) {
      this.argId_ = (state && state.argId) || '';
      if (state && state.name) this.setFieldValue(String(state.name), 'VALUE');
    },
    mutationToDom() {
      const m = document.createElement('mutation');
      m.setAttribute('argid', this.argId_ || '');
      m.setAttribute('name', this.getFieldValue('VALUE') || '');
      return m;
    },
    domToMutation(xml) {
      this.argId_ = xml.getAttribute('argid') || '';
      // The mutation also carries the displayed name so we don't depend on
      // <field> child ordering — Blockly v10 can clear the field if <mutation>
      // is processed AFTER <field> (the field setter happens but a subsequent
      // re-init wipes it). Re-applying here makes the order moot.
      const name = xml.getAttribute('name');
      if (name) this.setFieldValue(name, 'VALUE');
    },
  };

})(typeof window !== 'undefined' ? window : globalThis);
