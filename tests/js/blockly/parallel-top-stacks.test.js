'use strict';

// Multi-stack programs (the PID file is the canonical example): when a
// workspace has top-level stacks that aren't behind a whenX hat, those
// stacks must run *in parallel* with the whenProgramStarts main body —
// not sequentially. Otherwise an await-heavy stack (a control_repeat_until
// that monitors a sensor, say) deadlocks the program before _mainBody is
// even invoked.
//
// The fix: generateBlocklyJS wraps each non-hat, non-whenProgramStarts top
// stack in a `_hats.push(async () => { ... });` block. The runtime epilogue
// already starts every `_hats` function concurrently with _mainBody.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

test('generateBlocklyJS wraps non-hat top stacks in _hats.push runners', () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;

  // Three top blocks: the hat, a constant-setter chain, and an await-heavy
  // monitor. Each emits its own JS via a stub blockToCode.
  const topBlocks = [
    {
      type: 'flipperevents_whenProgramStarts',
      outputConnection: null,
      _emit: '_mainBody = async () => { /* main */ };\n',
    },
    {
      type: 'data_setvariableto',
      outputConnection: null,
      _emit: 'v_dist = 100;\n',
    },
    {
      type: 'control_repeat_until',
      outputConnection: null,
      _emit: 'while (!(cond) && window.sim.isRunning) { await window.sim._sleep(0); }\n',
    },
  ];

  const workspace = { getAllVariables: () => [], getTopBlocks: () => topBlocks };
  const origWorkspaceToCode = js.workspaceToCode;
  const origBlockToCode = js.blockToCode;
  js.blockToCode = (b) => b._emit;
  // generateBlocklyJS should bypass workspaceToCode when it's doing the
  // per-top-block walk; if it still calls it, that's a bug — error loudly.
  js.workspaceToCode = () => { throw new Error('should not call workspaceToCode'); };
  try {
    const code = env.window.generateBlocklyJS(workspace);

    // Hat (whenProgramStarts) emitted inline:
    assert.ok(code.includes('_mainBody = async () =>'),
      'whenProgramStarts code is inlined into body');
    // Non-hat stacks wrapped in parallel runners:
    assert.ok(code.includes('_hats.push(async () => {\nv_dist = 100;'),
      'data_setvariableto chain wrapped in _hats.push');
    assert.ok(code.includes('_hats.push(async () => {\nwhile (!(cond)'),
      'repeat_until chain wrapped in _hats.push');
  } finally {
    js.workspaceToCode = origWorkspaceToCode;
    js.blockToCode = origBlockToCode;
  }
});

test('generateBlocklyJS still emits hat stacks inline (they self-register)', () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;

  // A whenTimer hat — emits its own _hats.push internally — should NOT
  // be double-wrapped by the multi-stack wrapper.
  const topBlocks = [
    {
      type: 'flipperevents_whenTimer',
      outputConnection: null,
      _emit: '_hats.push(async () => { /* timer poll */ });\n',
    },
  ];
  const workspace = { getAllVariables: () => [], getTopBlocks: () => topBlocks };
  const origBlockToCode = js.blockToCode;
  js.blockToCode = (b) => b._emit;
  const origWorkspaceToCode = js.workspaceToCode;
  js.workspaceToCode = () => { throw new Error('should not call workspaceToCode'); };
  try {
    const code = env.window.generateBlocklyJS(workspace);
    // Should appear exactly once, not wrapped.
    const matches = code.match(/_hats\.push\(async \(\) => \{/g) || [];
    assert.strictEqual(matches.length, 1,
      'hat block emits exactly one _hats.push (not double-wrapped)');
  } finally {
    js.blockToCode = origBlockToCode;
    js.workspaceToCode = origWorkspaceToCode;
  }
});
