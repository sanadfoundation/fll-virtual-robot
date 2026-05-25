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
      workspace = Blockly.inject(container, { toolbox: null, readOnly: false });
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
          return { kind: 'zone', subject: 'robot', zone: b.fields.ZONE };
        case 'cond_sensor': {
          const raw = b.fields.VALUE;
          const asNum = Number(raw);
          return { kind: 'sensor', port: b.fields.PORT, op: b.fields.OP,
                   value: Number.isNaN(asNum) || raw === '' ? raw : asNum };
        }
        case 'cond_contact':
          return { kind: 'contact', obstacle: b.fields.OBSTACLE };
        case 'cond_not':
          return { kind: 'not', of: blockToCondition(b.children.OF) };
        case 'cond_all_of':
          return { kind: 'all_of', of: (b.children.OF || []).map(blockToCondition).filter(Boolean) };
        case 'cond_any_of':
          return { kind: 'any_of', of: (b.children.OF || []).map(blockToCondition).filter(Boolean) };
        default:
          return null;
      }
    }

    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      ensureWorkspace();
      if (!workspace) return;
      suppressNextChange = true;
      workspace.clear();
      const blocks = conditionToBlocks(step.condition);
      workspace._setBlocks(blocks);
      suppressNextChange = false;
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
