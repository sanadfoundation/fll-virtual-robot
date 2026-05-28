'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  // Current editor state, refreshed by the conditions module each time it
  // loads a workspace. The Blockly Extension below reads this at block-init
  // time to populate dynamic dropdown options BEFORE the serializer applies
  // saved field values (otherwise saved values get rejected as out-of-options).
  let _currentState = null;

  const BLOCK_DEFS = [
    {
      type: 'cond_zone',
      message0: 'robot is in zone %1',
      args0: [{ type: 'field_dropdown', name: 'ZONE', options: [['(none)', '']] }],
      output: 'Boolean',
      colour: 210,
      tooltip: 'True when the robot is inside the named zone.',
      extensions: ['cond_dynamic_dropdowns'],
    },
    {
      // Numeric sensor: distance (mm) and force (N) only. Color uses its own
      // block (cond_sensor_color) so the VALUE field can be a color-name
      // dropdown instead of a free-text input.
      type: 'cond_sensor',
      message0: 'sensor %1 %2 %3',
      args0: [
        { type: 'field_dropdown', name: 'PORT', options: [['Distance (D)', 'D'], ['Force (E)', 'E']] },
        { type: 'field_dropdown', name: 'OP', options: [['==','=='], ['!=','!='], ['<','<'], ['<=','<='], ['>','>'], ['>=','>=']] },
        { type: 'field_input', name: 'VALUE', text: '0' },
      ],
      output: 'Boolean',
      colour: 210,
    },
    {
      // Color sensor: port is fixed to C; VALUE is a dropdown of LEGO color
      // names. Only equality operators make sense for an enum-like value.
      type: 'cond_sensor_color',
      message0: 'color sensor (C) %1 %2',
      args0: [
        { type: 'field_dropdown', name: 'OP', options: [['==','=='], ['!=','!=']] },
        { type: 'field_dropdown', name: 'VALUE', options: [
          ['red',    'red'],
          ['green',  'green'],
          ['blue',   'blue'],
          ['yellow', 'yellow'],
          ['orange', 'orange'],
          ['purple', 'purple'],
          ['black',  'black'],
          ['white',  'white'],
          ['none',   'none'],
        ] },
      ],
      output: 'Boolean',
      colour: 210,
    },
    {
      type: 'cond_contact',
      message0: 'robot has contacted obstacle %1',
      args0: [{ type: 'field_dropdown', name: 'OBSTACLE', options: [['(none)', '']] }],
      output: 'Boolean',
      colour: 210,
      extensions: ['cond_dynamic_dropdowns'],
    },
    {
      type: 'cond_not',
      message0: 'not %1',
      args0: [{ type: 'input_value', name: 'OF', check: 'Boolean' }],
      output: 'Boolean',
      colour: 30,
    },
    {
      type: 'cond_all_of',
      message0: 'all of %1 and %2',
      args0: [
        { type: 'input_value', name: 'A', check: 'Boolean' },
        { type: 'input_value', name: 'B', check: 'Boolean' },
      ],
      output: 'Boolean',
      colour: 30,
      inputsInline: false,
    },
    {
      type: 'cond_any_of',
      message0: 'any of %1 or %2',
      args0: [
        { type: 'input_value', name: 'A', check: 'Boolean' },
        { type: 'input_value', name: 'B', check: 'Boolean' },
      ],
      output: 'Boolean',
      colour: 30,
      inputsInline: false,
    },
  ];

  function zoneOptions(state) {
    const zones = (state && state.field && state.field.zones) || [];
    if (zones.length === 0) return [['(no zones yet)', '']];
    return zones.map(z => [`${z.color || z.id}`, z.id]);
  }

  function obstacleOptions(state) {
    const obs = (state && state.field && state.field.obstacles) || [];
    if (obs.length === 0) return [['(no obstacles yet)', '']];
    return obs.map(o => [o.id, o.id]);
  }

  function conditionToBlocks(cond) {
    if (!cond || !cond.kind) return [];
    function buildOne(c) {
      switch (c.kind) {
        case 'zone':
          return { type: 'cond_zone', fields: { ZONE: c.zone || '' }, children: {}, parent: null };
        case 'sensor':
          // Color sensor on port C uses the dedicated color block; everything
          // else is the numeric cond_sensor.
          if (c.port === 'C' && typeof c.value === 'string') {
            return { type: 'cond_sensor_color', fields: { OP: c.op, VALUE: c.value }, children: {}, parent: null };
          }
          return { type: 'cond_sensor', fields: { PORT: c.port, OP: c.op, VALUE: String(c.value) }, children: {}, parent: null };
        case 'contact':
          return { type: 'cond_contact', fields: { OBSTACLE: c.obstacle || '' }, children: {}, parent: null };
        case 'not':
          return { type: 'cond_not', fields: {}, children: { OF: buildOne(c.of) }, parent: null };
        case 'all_of':
        case 'any_of': {
          const items = (c.of || []).map(buildOne).filter(Boolean);
          const out = {
            type: c.kind === 'all_of' ? 'cond_all_of' : 'cond_any_of',
            fields: {}, children: {}, parent: null,
          };
          if (items[0]) out.children.A = items[0];
          if (items[1]) out.children.B = items[1];
          return out;
        }
        default:
          return null;
      }
    }
    const root = buildOne(cond);
    return root ? [root] : [];
  }

  // Flyout-style toolbox shown when a step is selected. Blockly 10 accepts
  // either JSON (this) or XML; JSON is cleaner. A flyoutToolbox is shown
  // permanently as a sidebar, appropriate for a small fixed set of blocks.
  const TOOLBOX = {
    kind: 'flyoutToolbox',
    contents: [
      { kind: 'label', text: 'Place' },
      { kind: 'block', type: 'cond_zone' },
      { kind: 'block', type: 'cond_contact' },
      { kind: 'label', text: 'Sensor' },
      { kind: 'block', type: 'cond_sensor_color' },
      { kind: 'block', type: 'cond_sensor' },
      { kind: 'label', text: 'Compose' },
      { kind: 'block', type: 'cond_not' },
      { kind: 'block', type: 'cond_all_of' },
      { kind: 'block', type: 'cond_any_of' },
    ],
  };

  // Universal accessors — work on real Blockly blocks AND the test stub.
  // Real Blockly blocks expose getFieldValue/getInputTargetBlock/getNextBlock;
  // the test stub uses bare `fields`/`children` property bags.

  function fieldOf(block, name) {
    if (typeof block.getFieldValue === 'function') return block.getFieldValue(name);
    return block.fields && block.fields[name];
  }

  function valueInputOf(block, name) {
    if (typeof block.getInputTargetBlock === 'function') return block.getInputTargetBlock(name);
    return block.children && block.children[name];
  }

  function statementInputOf(block, name) {
    // Walk the statement chain via getNextBlock for real Blockly; for the
    // test stub, children[name] is already an array.
    if (typeof block.getInputTargetBlock === 'function') {
      const head = block.getInputTargetBlock(name);
      const out = [];
      let cur = head;
      while (cur) {
        out.push(cur);
        cur = (typeof cur.getNextBlock === 'function') ? cur.getNextBlock() : null;
      }
      return out;
    }
    const c = block.children && block.children[name];
    return Array.isArray(c) ? c : (c ? [c] : []);
  }

  // Convert a condition tree to Blockly's serialization-state shape so we can
  // load it via Blockly.serialization.workspaces.load(state, workspace).
  function conditionToBlockState(c) {
    if (!c || !c.kind) return null;
    switch (c.kind) {
      case 'zone':
        return { type: 'cond_zone', fields: { ZONE: c.zone || '' } };
      case 'sensor':
        return {
          type: 'cond_sensor',
          fields: { PORT: c.port, OP: c.op, VALUE: String(c.value) },
        };
      case 'contact':
        return { type: 'cond_contact', fields: { OBSTACLE: c.obstacle || '' } };
      case 'not': {
        const inner = conditionToBlockState(c.of);
        return inner
          ? { type: 'cond_not', inputs: { OF: { block: inner } } }
          : { type: 'cond_not' };
      }
      case 'all_of':
      case 'any_of': {
        const blockType = c.kind === 'all_of' ? 'cond_all_of' : 'cond_any_of';
        const items = (c.of || []).map(conditionToBlockState).filter(Boolean);
        const out = { type: blockType };
        if (items.length === 0) return out;
        if (items.length === 1) {
          out.inputs = { A: { block: items[0] } };
          return out;
        }
        // 2 items: simple A and B
        if (items.length === 2) {
          out.inputs = { A: { block: items[0] }, B: { block: items[1] } };
          return out;
        }
        // 3+ items: nest the tail recursively into B.
        // [a, b, c, d] → all_of(a, all_of(b, all_of(c, d)))
        let tail = items[items.length - 1];
        for (let i = items.length - 2; i >= 1; i--) {
          tail = { type: blockType, inputs: { A: { block: items[i] }, B: { block: tail } } };
        }
        out.inputs = { A: { block: items[0] }, B: { block: tail } };
        return out;
      }
      default:
        return null;
    }
  }

  function conditionToWorkspaceState(condition) {
    const root = conditionToBlockState(condition);
    return {
      blocks: {
        languageVersion: 0,
        blocks: root ? [{ ...root, x: 20, y: 20 }] : [],
      },
    };
  }

  let blocksRegistered = false;
  function ensureBlockDefs(Blockly) {
    if (blocksRegistered || !Blockly) return;
    // Register the dynamic-options extension BEFORE registering the block
    // defs that reference it.
    if (Blockly.Extensions && typeof Blockly.Extensions.register === 'function') {
      try {
        Blockly.Extensions.register('cond_dynamic_dropdowns', function () {
          // `this` is the block instance, called at end of init() (after
          // jsonInit creates the fields, before the serializer sets values).
          if (!_currentState) return;
          if (this.type === 'cond_zone') {
            const f = this.getField && this.getField('ZONE');
            if (f) f.menuGenerator_ = zoneOptions(_currentState);
          }
          if (this.type === 'cond_contact') {
            const f = this.getField && this.getField('OBSTACLE');
            if (f) f.menuGenerator_ = obstacleOptions(_currentState);
          }
        });
      } catch (_e) {
        // Already registered (re-init). That's fine.
      }
    }
    Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);
    blocksRegistered = true;
  }

  function attach(app, doc) {
    const section = doc.getElementById('editor-cond-section');
    const container = doc.getElementById('editor-cond-workspace');
    const Blockly = global.Blockly;
    let workspace = null;
    let suppressNextChange = false;
    let currentStepId = null;
    let lastLoadedConditionJSON = null;

    ensureBlockDefs(Blockly);

    function ensureWorkspace() {
      if (workspace || !Blockly || !container) return workspace;
      workspace = Blockly.inject(container, { toolbox: TOOLBOX, readOnly: false });
      _currentState = app.editorState;
      workspace.addChangeListener((ev) => {
        if (suppressNextChange) return;
        const type = ev && ev.type;
        // Allowlist of event types we care about. In real Blockly these are
        // 'create', 'delete', 'change' (field set), and 'block_field_intermediate_change'.
        // We deliberately ignore 'move', 'drag', 'viewport_change', 'click',
        // 'selected', 'ui', 'comment_*', etc. — they fire constantly during a
        // drag and don't change the condition's logical structure.
        const RELEVANT = new Set(['create', 'delete', 'change']);
        // The test stub fires events without `type`. Treat those as relevant
        // so existing stub tests keep working.
        if (type !== undefined && !RELEVANT.has(type)) return;
        syncToState();
      });
      return workspace;
    }

    function syncToState() {
      if (!workspace || !app.editorState) return;
      const sel = app.editorState.selection;
      if (!sel || sel.kind !== 'step') return;
      const stepId = sel.id;
      const top = workspace.getTopBlocks();
      const condition = top.length ? blockToCondition(top[0]) : null;
      if (!condition) return;
      // Stash so the upcoming onChange→showForStep sees that the workspace
      // already reflects this condition (no reload needed).
      lastLoadedConditionJSON = JSON.stringify(condition);
      currentStepId = stepId;
      app.setEditorState(MISSIONS.editor.state.editStep(app.editorState, stepId, { condition }));
    }

    function blockToCondition(b) {
      if (!b) return null;
      switch (b.type) {
        case 'cond_zone':
          return { kind: 'zone', subject: 'robot', zone: fieldOf(b, 'ZONE') };
        case 'cond_sensor': {
          const raw = fieldOf(b, 'VALUE');
          const asNum = Number(raw);
          return {
            kind: 'sensor',
            port: fieldOf(b, 'PORT'),
            op: fieldOf(b, 'OP'),
            value: Number.isNaN(asNum) || raw === '' ? raw : asNum,
          };
        }
        case 'cond_sensor_color': {
          return {
            kind: 'sensor',
            port: 'C',
            op: fieldOf(b, 'OP'),
            value: fieldOf(b, 'VALUE'),
          };
        }
        case 'cond_contact':
          return { kind: 'contact', obstacle: fieldOf(b, 'OBSTACLE') };
        case 'cond_not':
          return { kind: 'not', of: blockToCondition(valueInputOf(b, 'OF')) };
        case 'cond_all_of': {
          const a  = blockToCondition(valueInputOf(b, 'A'));
          const bb = blockToCondition(valueInputOf(b, 'B'));
          return { kind: 'all_of', of: [a, bb].filter(Boolean) };
        }
        case 'cond_any_of': {
          const a  = blockToCondition(valueInputOf(b, 'A'));
          const bb = blockToCondition(valueInputOf(b, 'B'));
          return { kind: 'any_of', of: [a, bb].filter(Boolean) };
        }
        default:
          return null;
      }
    }

    function updateLiveDropdowns(state) {
      if (!workspace || !workspace.getAllBlocks) return;
      const zOpts = zoneOptions(state);
      const oOpts = obstacleOptions(state);
      for (const b of workspace.getAllBlocks()) {
        if (b.type === 'cond_zone' && b.getField && typeof b.getField === 'function') {
          const f = b.getField('ZONE');
          if (f && typeof f.menuGenerator_ !== 'undefined') f.menuGenerator_ = zOpts;
        }
        if (b.type === 'cond_contact' && b.getField && typeof b.getField === 'function') {
          const f = b.getField('OBSTACLE');
          if (f && typeof f.menuGenerator_ !== 'undefined') f.menuGenerator_ = oOpts;
        }
      }
    }

    const panel = doc.getElementById('editor-right-panel');

    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      if (panel && panel.classList) panel.classList.add('has-condition-open');
      ensureWorkspace();
      if (!workspace) return;

      // Dedupe: if the workspace already reflects this step + condition,
      // don't reload. Reloading mid-drag destroys the user's dragged block
      // and re-creates it, causing infinite event cascades.
      const incomingJSON = JSON.stringify(step.condition);
      if (step.id === currentStepId && incomingJSON === lastLoadedConditionJSON) {
        return;
      }
      currentStepId = step.id;
      lastLoadedConditionJSON = incomingJSON;

      // Make the current editor state visible to the cond_dynamic_dropdowns
      // extension, which runs during block init below.
      _currentState = app.editorState;
      suppressNextChange = true;
      workspace.clear();
      if (Blockly && Blockly.serialization && Blockly.serialization.workspaces &&
          typeof Blockly.serialization.workspaces.load === 'function') {
        const state = conditionToWorkspaceState(step.condition);
        try {
          Blockly.serialization.workspaces.load(state, workspace);
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('mission editor: failed to load condition into workspace', e);
          }
        }
      } else if (typeof workspace._setBlocks === 'function') {
        const blocks = conditionToBlocks(step.condition);
        workspace._setBlocks(blocks);
      }
      suppressNextChange = false;
      updateLiveDropdowns(app.editorState);
      if (Blockly && typeof Blockly.svgResize === 'function') {
        try { Blockly.svgResize(workspace); } catch (_e) {}
      }
      if (Blockly && typeof Blockly.svgResize === 'function' &&
          typeof setTimeout === 'function') {
        setTimeout(() => {
          try { Blockly.svgResize(workspace); } catch (_e) {}
        }, 50);
      }
    }

    function hide() {
      if (section) section.hidden = true;
      if (panel && panel.classList) panel.classList.remove('has-condition-open');
      currentStepId = null;
      lastLoadedConditionJSON = null;
    }

    app.onChange(({ mode, editorState }) => {
      _currentState = editorState;
      if (mode !== 'editor' || !editorState) { hide(); return; }
      const sel = editorState.selection;
      if (sel && sel.kind === 'step') {
        const step = editorState.steps.find(s => s.id === sel.id);
        if (step) showForStep(step);
        else hide();
      } else {
        hide();
      }
    });
  }

  editor.conditions = { attach, _zoneOptions: zoneOptions, _obstacleOptions: obstacleOptions };
})(typeof window !== 'undefined' ? window : globalThis);
