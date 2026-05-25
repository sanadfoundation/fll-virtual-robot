'use strict';

// Tests for the MY_BLOCKS toolbox category callback registered by
// js/blockly_config.js. The callback receives the workspace at toolbox-open
// time and returns an array of DOM elements: a "Make a Block" button and a
// call block for every myblocks_definition on the workspace, plus body-
// context arg reporters when the user's focus is inside a definition body.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setup(workspaceOverrides = {}) {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  // initBlockly registers `MY_BLOCKS` (and the button callback CREATE_SPIKE_MYBLOCK).
  const cb = env.workspace.toolboxCallbacks_['MY_BLOCKS'];
  const btn = env.workspace.buttonCallbacks_['CREATE_SPIKE_MYBLOCK'];
  return { env, cb, btn, workspace: Object.assign(env.workspace, workspaceOverrides) };
}

test('MY_BLOCKS callback is registered with the workspace', () => {
  const { cb, btn } = setup();
  assert.strictEqual(typeof cb, 'function');
  assert.strictEqual(typeof btn, 'function');
});

test('empty workspace: callback returns just the "Make a Block" button', () => {
  const { cb, workspace } = setup({ getAllBlocks: () => [] });
  const xml = cb(workspace);
  assert.strictEqual(xml.length, 1, 'one element');
  assert.strictEqual(xml[0].tagName, 'button');
  assert.strictEqual(xml[0].getAttribute('text'), 'Make a Block');
  assert.strictEqual(xml[0].getAttribute('callbackKey'), 'CREATE_SPIKE_MYBLOCK');
});

test('with one definition: callback emits a call block carrying its procId + argspec', () => {
  const argspec = [
    { kind: 'label', text: 'do ' },
    { kind: 'arg', argKind: 'string_number', name: 'n', argId: 'a', defaultValue: '' },
  ];
  const { cb, workspace } = setup({
    getAllBlocks: () => [
      { type: 'myblocks_definition', procId_: 'pid-1', argspec_: argspec,
        getFieldValue: () => null },
    ],
  });
  const xml = cb(workspace);
  assert.strictEqual(xml.length, 2, 'button + one call');
  const call = xml[1];
  assert.strictEqual(call.tagName, 'block');
  assert.strictEqual(call.getAttribute('type'), 'myblocks_call');

  // extra-state mutation lives as a child <mutation> element with the same
  // shape Blockly emits on save: procid + JSON-stringified argspec
  const mut = call.children.find(c => c.tagName === 'mutation');
  assert.ok(mut, 'mutation child present');
  assert.strictEqual(mut.getAttribute('procid'), 'pid-1');
  const reparsed = JSON.parse(mut.getAttribute('argspec'));
  assert.deepStrictEqual(reparsed, argspec);
});

test('with multiple definitions: one call per definition, in workspace order', () => {
  const def = (pid) => ({
    type: 'myblocks_definition', procId_: pid,
    argspec_: [{ kind: 'label', text: pid }],
    getFieldValue: () => null,
  });
  const { cb, workspace } = setup({
    getAllBlocks: () => [def('pid-1'), def('pid-2'), def('pid-3')],
  });
  const xml = cb(workspace);
  assert.strictEqual(xml.length, 4); // button + 3 calls
  const procIds = xml.slice(1).map(b => {
    const m = b.children.find(c => c.tagName === 'mutation');
    return m && m.getAttribute('procid');
  });
  assert.deepEqual(procIds, ['pid-1', 'pid-2', 'pid-3']);
});

test('non-myblocks blocks on workspace are ignored', () => {
  const { cb, workspace } = setup({
    getAllBlocks: () => [
      { type: 'flippermotor_motorTurnForDirection', getFieldValue: () => null },
      { type: 'data_variable', getFieldValue: () => null },
    ],
  });
  const xml = cb(workspace);
  assert.strictEqual(xml.length, 1);
});

test('body focus: reporters are emitted for each arg in the focused definition', () => {
  // Phase C tracks the focused definition via a workspace listener that
  // updates a module-level last-focused id. For the test we simulate by
  // calling the focus-setter directly via the exported API on window.MyBlocks.
  const argspec = [
    { kind: 'label', text: 'rotate ' },
    { kind: 'arg', argKind: 'string_number', name: 'angle',     argId: 'a-id', defaultValue: '' },
    { kind: 'arg', argKind: 'boolean',       name: 'direction', argId: 'b-id', defaultValue: 'false' },
  ];
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const cb = env.workspace.toolboxCallbacks_['MY_BLOCKS'];
  const def = { type: 'myblocks_definition', procId_: 'pid-1', argspec_: argspec, getFieldValue: () => null };
  env.workspace.getAllBlocks = () => [def];

  // Simulate user focus inside the definition's body
  env.window.MyBlocks.setFocusedDefinitionProcId('pid-1');

  const xml = cb(env.workspace);
  // button + reporter(angle, string_number) + reporter(direction, boolean) + call block
  const types = xml.map(n => {
    if (n.tagName === 'button') return 'button:' + n.getAttribute('text');
    return n.getAttribute('type');
  });
  assert.ok(types.includes('myblocks_arg_string_number'),
    `expected arg reporter in flyout; got ${types.join(', ')}`);
  assert.ok(types.includes('myblocks_arg_boolean'),
    `expected boolean arg reporter; got ${types.join(', ')}`);

  // Reset focus so it doesn't bleed into other tests
  env.window.MyBlocks.setFocusedDefinitionProcId(null);
});
