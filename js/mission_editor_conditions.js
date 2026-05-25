'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  const BLOCK_DEFS = [
    {
      type: 'cond_zone',
      message0: 'robot is in zone %1',
      args0: [{ type: 'field_dropdown', name: 'ZONE', options: [['(none)', '']] }],
      output: 'Boolean',
      colour: 210,
      tooltip: 'True when the robot is inside the named zone.',
    },
    {
      type: 'cond_sensor',
      message0: 'sensor %1 %2 %3',
      args0: [
        { type: 'field_dropdown', name: 'PORT', options: [['Color (C)', 'C'], ['Distance (D)', 'D'], ['Force (E)', 'E']] },
        { type: 'field_dropdown', name: 'OP', options: [['==','=='], ['!=','!='], ['<','<'], ['<=','<='], ['>','>'], ['>=','>=']] },
        { type: 'field_input', name: 'VALUE', text: '0' },
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
      message0: 'all of %1',
      args0: [{ type: 'input_statement', name: 'OF' }],
      output: 'Boolean',
      colour: 30,
    },
    {
      type: 'cond_any_of',
      message0: 'any of %1',
      args0: [{ type: 'input_statement', name: 'OF' }],
      output: 'Boolean',
      colour: 30,
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
          return { type: 'cond_sensor', fields: { PORT: c.port, OP: c.op, VALUE: String(c.value) }, children: {}, parent: null };
        case 'contact':
          return { type: 'cond_contact', fields: { OBSTACLE: c.obstacle || '' }, children: {}, parent: null };
        case 'not':
          return { type: 'cond_not', fields: {}, children: { OF: buildOne(c.of) }, parent: null };
        case 'all_of':
        case 'any_of':
          return {
            type: c.kind === 'all_of' ? 'cond_all_of' : 'cond_any_of',
            fields: {}, children: { OF: (c.of || []).map(buildOne) }, parent: null,
          };
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
        const out = { type: c.kind === 'all_of' ? 'cond_all_of' : 'cond_any_of' };
        const children = (c.of || []).map(conditionToBlockState).filter(Boolean);
        if (children.length > 0) {
          // Statement input — chain via `next`.
          for (let i = children.length - 1; i > 0; i--) {
            children[i - 1].next = { block: children[i] };
          }
          out.inputs = { OF: { block: children[0] } };
        }
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
    Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);
    blocksRegistered = true;
  }

  function attach(app, doc) {
    const section = doc.getElementById('editor-cond-section');
    const container = doc.getElementById('editor-cond-workspace');
    const Blockly = global.Blockly;
    let workspace = null;
    let suppressNextChange = false;

    ensureBlockDefs(Blockly);

    function ensureWorkspace() {
      if (workspace || !Blockly || !container) return workspace;
      workspace = Blockly.inject(container, { toolbox: TOOLBOX, readOnly: false });
      workspace.addChangeListener(() => {
        if (suppressNextChange) return;
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
        case 'cond_contact':
          return { kind: 'contact', obstacle: fieldOf(b, 'OBSTACLE') };
        case 'cond_not':
          return { kind: 'not', of: blockToCondition(valueInputOf(b, 'OF')) };
        case 'cond_all_of':
          return { kind: 'all_of', of: statementInputOf(b, 'OF').map(blockToCondition).filter(Boolean) };
        case 'cond_any_of':
          return { kind: 'any_of', of: statementInputOf(b, 'OF').map(blockToCondition).filter(Boolean) };
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

    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      ensureWorkspace();
      if (!workspace) return;
      suppressNextChange = true;
      workspace.clear();
      if (Blockly && Blockly.serialization && Blockly.serialization.workspaces &&
          typeof Blockly.serialization.workspaces.load === 'function') {
        // Production: real Blockly path.
        const state = conditionToWorkspaceState(step.condition);
        try {
          Blockly.serialization.workspaces.load(state, workspace);
        } catch (e) {
          // Bad condition state shouldn't break the editor; just leave the
          // workspace empty and log.
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('mission editor: failed to load condition into workspace', e);
          }
        }
      } else if (typeof workspace._setBlocks === 'function') {
        // Test stub path.
        const blocks = conditionToBlocks(step.condition);
        workspace._setBlocks(blocks);
      }
      suppressNextChange = false;
      updateLiveDropdowns(app.editorState);
    }

    function hide() {
      if (section) section.hidden = true;
    }

    app.onChange(({ mode, editorState }) => {
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
