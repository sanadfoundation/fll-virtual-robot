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
        if (suppressNextChange) { suppressNextChange = false; return; }
        syncToState();
      });
      return workspace;
    }

    function syncToState() {
      // Implemented in Task 19 (generator-to-condition wiring).
    }

    function showForStep(step) {
      if (!section) return;
      section.hidden = false;
      ensureWorkspace();
      // Load blocks for the step's current condition (Task 20).
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

  editor.conditions = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
