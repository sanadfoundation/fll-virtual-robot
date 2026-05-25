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
  const PILL_FILL       = '#d0454d';
  const PILL_FILL_HOVER = '#e75b63';  // ~10% lighter — discoverability cue
  const PILL_TEXT       = '#ffffff';
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
      // Discoverability: 'pointer' cursor + slight brighten on hover so the
      // user sees that the pill responds to clicks. 'pointer' (the click-finger
      // cursor) is the right signal here because the click synthesizes a new
      // block — there's no drag-in-flight to suggest with 'grab'. (Touch-
      // device users miss this hover signal — see CLAUDE.md for the trade-off.)
      this.fieldGroup_.style.cursor = 'pointer';
      this.fieldGroup_.addEventListener('mouseenter', () => {
        if (this.pillEl_) this.pillEl_.setAttribute('fill', PILL_FILL_HOVER);
      });
      this.fieldGroup_.addEventListener('mouseleave', () => {
        if (this.pillEl_) this.pillEl_.setAttribute('fill', PILL_FILL);
      });
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
      // Cursor re-applied here (and not just in initView) because Blockly
      // can re-attach / restyle fieldGroup_ across renders, dropping the
      // inline style we set at init time.
      if (this.fieldGroup_ && this.fieldGroup_.style.cursor !== 'pointer') {
        this.fieldGroup_.style.cursor = 'pointer';
      }
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
        // Non-editable label — the definition's name/labels are set once in
        // the Make-a-block modal and locked thereafter. FieldLabelSerializable
        // (rather than plain FieldLabel) preserves the value through XML/
        // state round-trip even though click won't open an editor.
        input.appendField(new Blockly.FieldLabelSerializable(tok.text || ''), 'LABEL' + labelIdx++);
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
      input.appendField(new Blockly.FieldLabelSerializable('block name'), 'LABEL0');
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

  // Primitive literal block types whose only purpose is to carry a single
  // field value. When an edit removes the arg they were plugged into, these
  // are auto-disposed rather than left as free blocks — they're not useful
  // standalone, and the user can't reconnect them anywhere meaningful.
  // Variables, expressions, sensor reporters, etc. survive intact.
  const PRIMITIVE_LITERAL_TYPES = new Set([
    'math_number', 'math_positive_number', 'math_whole_number',
    'math_integer', 'math_angle',
    'text', 'colour_picker',
  ]);

  // Apply an edit (new argspec) to an existing definition: update the def
  // block itself, walk its body to rename or disconnect arg reporters, and
  // re-sync every call site. Connection rule at call sites:
  //   - slot i unchanged (same argId at same index) → connection preserved
  //   - slot i removed/moved → previous block disconnected; if it's a
  //     primitive literal (math_number / text / colour) it's also disposed
  //     so the workspace doesn't accumulate orphaned literals (LEGO leaves
  //     real blocks; literals it auto-removes — verified against the
  //     official editor).
  // Empty %s slots get a fresh math_number shadow so the call block stays
  // click-and-type editable.
  function applyEditToDefinition(workspace, def, newArgspec) {
    if (!workspace || !def) return;
    // Snapshot OLD argspec arg tokens BEFORE we overwrite def.argspec_ in
    // step 2. Step 3's call-site sync needs the OLD argId-per-slot mapping
    // to identify what was plugged in where; reading def.argspec_ at that
    // point would return the NEW spec we just installed.
    const oldArgTokens = (def.argspec_ || []).filter(t => t.kind === 'arg');
    const newNameByArgId = {};
    const newArgIds = new Set();
    for (const t of newArgspec) {
      if (t.kind === 'arg' && t.argId) {
        newArgIds.add(t.argId);
        newNameByArgId[t.argId] = t.name || '';
      }
    }

    // 1. Walk the def's body — update reporter names for surviving argIds,
    //    disconnect reporters whose argId no longer exists. Done BEFORE we
    //    re-init the def block (otherwise getDescendants would be empty
    //    because removeInput on the def detaches the whole next chain).
    if (def.getDescendants) {
      // Collect reporters first so we don't mutate the descendants array
      // while iterating (dispose modifies the workspace state).
      const reporters = def.getDescendants(false).filter(
        b => b.type === 'myblocks_arg_string_number' ||
             b.type === 'myblocks_arg_boolean');
      for (const child of reporters) {
        const argId = child.argId_;
        if (argId && newArgIds.has(argId)) {
          // Arg survives — update displayed name (cheap if unchanged).
          const newName = newNameByArgId[argId];
          if (newName && child.getFieldValue('VALUE') !== newName) {
            child.setFieldValue(newName, 'VALUE');
          }
        } else {
          // Arg was removed — dispose the reporter. Leaving it (even
          // disconnected) is dead code; if it were connected anywhere it'd
          // emit an undefined identifier at codegen.
          try { child.dispose(true, false); } catch (_e) {}
        }
      }
    }

    // 2. Update def block itself — applyArgspecToDefinition rebuilds inputs.
    def.argspec_ = JSON.parse(JSON.stringify(newArgspec));
    applyArgspecToDefinition(def);

    // 3. Update each call site. Connections are matched by argId (not slot
    //    index) so:
    //      - Renamed arg (same id) → value follows. No visible change.
    //      - Reordered (ids preserved, positions changed) → values follow
    //        their ids to the new slot. User's work survives.
    //      - Removed arg (id gone) → orphaned value. Literals are disposed
    //        (math_number, text, colour_picker etc.); anything else
    //        (variables, expressions, sensor reporters) remains as a free
    //        block on the workspace per LEGO's spec.
    //      - Added arg → new slot gets a math_number shadow as default.
    // (oldArgTokens was captured at the top of this function before step 2
    // overwrote def.argspec_; reading it from def here would now return the
    // NEW spec, breaking the argId match.)
    const calls = workspace.getAllBlocks(false).filter(
      b => b.type === 'myblocks_call' && b.procId_ === def.procId_);
    for (const call of calls) {
      // Snapshot connected blocks by argId. We include shadows in the
      // snapshot — Blockly's connection.disconnect() sometimes leaves the
      // shadow as a real-looking free block on the workspace, and we want
      // to clean those up too when their arg is removed. Disposing an
      // already-auto-disposed shadow is a no-op (wrapped in try/catch).
      // Real blocks (non-shadow) get reconnected by argId or stay free.
      const snapshotByArgId = {};
      const snapshotIsShadow = {};
      const oldArgInputs = call.inputList.filter(i => i.name && i.name.startsWith('ARG'));
      for (let i = 0; i < oldArgInputs.length; i++) {
        const inp = oldArgInputs[i];
        const target = inp.connection && inp.connection.targetBlock();
        if (inp.connection && inp.connection.targetConnection) {
          try { inp.connection.disconnect(); } catch (_e) {}
        }
        const argId = oldArgTokens[i] && oldArgTokens[i].argId;
        if (target && argId) {
          snapshotByArgId[argId] = target;
          snapshotIsShadow[argId] = target.isShadow();
        }
      }
      call.argspec_ = JSON.parse(JSON.stringify(newArgspec));
      applyArgspecToCall(call);

      const newArgInputs = call.inputList.filter(i => i.name && i.name.startsWith('ARG'));
      const newArgTokens = newArgspec.filter(t => t.kind === 'arg');
      // Re-attach by argId — match handles rename + reorder identically.
      // Skip shadows: they don't represent user-supplied values; the new
      // slot already has its own shadow set up via setShadowState below.
      for (let i = 0; i < newArgInputs.length; i++) {
        const tok = newArgTokens[i];
        if (!tok || !tok.argId) continue;
        const saved = snapshotByArgId[tok.argId];
        if (!saved || snapshotIsShadow[tok.argId]) continue;
        const out = saved.outputConnection;
        if (out && newArgInputs[i].connection) {
          try { newArgInputs[i].connection.connect(out); } catch (_e) {}
          delete snapshotByArgId[tok.argId];
        }
      }
      // Anything left in snapshotByArgId either:
      //  - belonged to a removed arg (id has no new slot), OR
      //  - was a shadow whose slot still exists (no longer needed — the new
      //    setShadowState below will install a fresh shadow).
      // In both cases: dispose if literal primitive, leave free otherwise.
      for (const argId of Object.keys(snapshotByArgId)) {
        const blk = snapshotByArgId[argId];
        if (PRIMITIVE_LITERAL_TYPES.has(blk.type)) {
          try { blk.dispose(true, false); } catch (_e) {}
        }
      }
      // Empty %s slots get a math_number shadow (Blockly v10's canonical
      // way to declare a default value). Boolean slots stay shadowless —
      // Scratch's model has no boolean literal.
      for (let i = 0; i < newArgInputs.length; i++) {
        const inp = newArgInputs[i];
        if (!inp.connection || inp.connection.targetConnection) continue;
        const tok = newArgTokens[i];
        if (!tok || tok.argKind !== 'string_number') continue;
        try {
          inp.connection.setShadowState({
            type: 'math_number',
            fields: { NUM: String(tok.defaultValue || '0') },
          });
        } catch (_e) { /* shadow attach is best-effort */ }
      }
    }
  }

  MyBlocks.applyArgspecToDefinition = applyArgspecToDefinition;
  MyBlocks.applyArgspecToCall       = applyArgspecToCall;
  MyBlocks.syncCallsToDefinition    = syncCallsToDefinition;
  MyBlocks.applyEditToDefinition    = applyEditToDefinition;

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
    customContextMenu(options) {
      // Prepend "Edit My Block…" so users can re-open the modal pre-filled
      // with this definition's current argspec. Save propagates changes
      // through every call site + body reporter (see applyEditToDefinition
      // above for the policy: matches LEGO — value blocks at removed slots
      // remain free on the workspace, not trashed).
      const def = this;
      if (!MyBlocks.openMyBlocksModal) return;
      options.unshift({
        text: 'Edit My Block…',
        enabled: true,
        callback: () => {
          MyBlocks.openMyBlocksModal(Blockly, {
            initialState: {
              procId: def.procId_,
              argspec: def.argspec_ || [],
            },
          }).then((result) => {
            if (!result) return;
            applyEditToDefinition(def.workspace, def, result.argspec);
            const tb = def.workspace.getToolbox && def.workspace.getToolbox();
            if (tb && tb.refreshSelection) tb.refreshSelection();
          });
        },
      });
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
