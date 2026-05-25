'use strict';

// Generator tests for the My Blocks block types. Mirrors the pattern in
// tests/js/blockly/data-variables-generators.test.js: spin up the Blockly
// shim via makeBlocklyEnv (which registers our generators by sourcing
// js/blockly_config.js), stub block.getFieldValue/etc., then call the
// generator function directly and assert on the JS that comes out.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setup() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return { Blockly: env.Blockly, env };
}

// ── arg reporters ────────────────────────────────────────────────────────────

test('myblocks_arg_string_number generator: returns slugified arg name as atomic reporter', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const block = { getFieldValue: (name) => name === 'VALUE' ? 'angle' : null };
  const [code, order] = js['myblocks_arg_string_number'](block);
  assert.strictEqual(code, 'angle');
  assert.strictEqual(order, js.ORDER_ATOMIC);
});

test('myblocks_arg_string_number generator: slugifies names with punctuation', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const block = { getFieldValue: () => 'My Angle!' };
  const [code] = js['myblocks_arg_string_number'](block);
  assert.strictEqual(code, 'my_angle');
});

test('myblocks_arg_boolean generator: returns slugified arg name as atomic reporter', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const block = { getFieldValue: () => 'direction' };
  const [code, order] = js['myblocks_arg_boolean'](block);
  assert.strictEqual(code, 'direction');
  assert.strictEqual(order, js.ORDER_ATOMIC);
});

// ── call site ────────────────────────────────────────────────────────────────

test('myblocks_call generator: emits `await name(args)` with derived slug', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const orig = js.valueToCode;
  js.valueToCode = (_b, name) => name === 'ARG0' ? '100' : (name === 'ARG1' ? 'true' : '');
  try {
    const block = {
      argspec_: [
        { kind: 'label', text: 'rotate ' },
        { kind: 'arg', argKind: 'string_number', name: 'angle', argId: 'a' },
        { kind: 'label', text: ' ' },
        { kind: 'arg', argKind: 'boolean', name: 'direction', argId: 'b' },
        { kind: 'label', text: ' my function' },
      ],
    };
    const code = js['myblocks_call'](block);
    assert.strictEqual(code, 'await rotate_my_function(100, true);\n');
  } finally {
    js.valueToCode = orig;
  }
});

test('myblocks_call generator: no-arg call emits parens only', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const block = { argspec_: [{ kind: 'label', text: 'no args' }] };
  const code = js['myblocks_call'](block);
  assert.strictEqual(code, 'await no_args();\n');
});

test('myblocks_call generator: boolean default-empty input falls back to `false`', () => {
  // A boolean slot with no plugged-in block has no shadow primitive — Scratch
  // models this as a missing input. Code must still parse; emit literal false.
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const orig = js.valueToCode;
  js.valueToCode = () => '';
  try {
    const block = {
      argspec_: [
        { kind: 'label', text: 'flag' },
        { kind: 'arg', argKind: 'boolean', name: 'flag', argId: 'b' },
      ],
    };
    const code = js['myblocks_call'](block);
    assert.strictEqual(code, 'await flag(false);\n');
  } finally {
    js.valueToCode = orig;
  }
});

test('myblocks_call generator: string_number default-empty falls back to `0`', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const orig = js.valueToCode;
  js.valueToCode = () => '';
  try {
    const block = {
      argspec_: [
        { kind: 'label', text: 'count' },
        { kind: 'arg', argKind: 'string_number', name: 'n', argId: 'a' },
      ],
    };
    const code = js['myblocks_call'](block);
    assert.strictEqual(code, 'await count(0);\n');
  } finally {
    js.valueToCode = orig;
  }
});

// ── definition ───────────────────────────────────────────────────────────────

test('myblocks_definition generator: emits async function with arg list, body inline', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  // Stub blockToCode to simulate a body of two statements following the hat.
  const origBlockToCode = js.blockToCode;
  js.blockToCode = (b) => {
    if (b === 'NEXT_BODY') return 'await window.sim._sleep(100);\nawait window.sim._sleep(200);\n';
    return '';
  };
  try {
    const block = {
      argspec_: [
        { kind: 'label', text: 'rotate ' },
        { kind: 'arg', argKind: 'string_number', name: 'angle', argId: 'a' },
        { kind: 'label', text: ' ' },
        { kind: 'arg', argKind: 'boolean', name: 'direction', argId: 'b' },
        { kind: 'label', text: ' my function' },
      ],
      getNextBlock: () => 'NEXT_BODY',
    };
    const code = js['myblocks_definition'](block);
    assert.ok(code.startsWith('async function rotate_my_function(angle, direction) {\n'),
      `expected function header, got: ${code.slice(0, 80)}`);
    assert.ok(code.includes('await window.sim._sleep(100);'), 'includes first body line');
    assert.ok(code.includes('await window.sim._sleep(200);'), 'includes second body line');
    assert.ok(code.trimEnd().endsWith('}'), 'closes function block');
  } finally {
    js.blockToCode = origBlockToCode;
  }
});

test('myblocks_definition generator: empty body produces a valid empty function', () => {
  const { Blockly } = setup();
  const js = Blockly.JavaScript;
  const block = {
    argspec_: [{ kind: 'label', text: 'do nothing' }],
    getNextBlock: () => null,
  };
  const code = js['myblocks_definition'](block);
  assert.strictEqual(code, 'async function do_nothing() {\n}\n');
});

test('generateBlocklyJS: orphan call (no matching definition) gets a no-op stub function declared at top scope', () => {
  // If the user deletes a definition but a call remains (or a partially-
  // loaded .llsp3 has only a call), the generated JS would emit
  // `await name(...)` against an undefined function — ReferenceError at
  // runtime. Defensively synthesize a stub so the program still parses.
  const { env } = setup();
  const js = env.Blockly.JavaScript;
  const origBlockToCode = js.blockToCode;
  const origInit  = js.init;
  const origFinish= js.finish;
  js.init   = () => {};
  js.finish = (s) => s;
  // Pretend the top-level walker generates code for one orphan call.
  js.blockToCode = (blk) => {
    if (blk.type === 'myblocks_call') return 'await orphan_proc(0);\n';
    return '';
  };
  try {
    const orphanCall = {
      type: 'myblocks_call',
      outputConnection: null,
      procId_: 'orphan-proc-id',
      argspec_: [{ kind: 'label', text: 'orphan proc' }],
    };
    const fakeWs = {
      getTopBlocks:    () => [orphanCall],
      getAllBlocks:    () => [orphanCall],
      getAllVariables: () => [],
    };
    const out = env.window.generateBlocklyJS(fakeWs);
    assert.ok(out.includes('async function orphan_proc'),
      'stub declaration is synthesized for orphan call');
    assert.ok(out.includes('await orphan_proc('),
      'call site code is still present');
  } finally {
    js.blockToCode = origBlockToCode;
    js.init   = origInit;
    js.finish = origFinish;
  }
});

test('myblocks_definition is in _SELF_REGISTERING_TOP_TYPES (emits at top scope, not in _hats wrapper)', () => {
  // generateBlocklyJS wraps non-hat top-level chains in `_hats.push(async () => {...})`.
  // A procedure definition must NOT be wrapped — it has to be a top-level
  // declaration so call sites can reach it. This is verified by adding the
  // type to the _SELF_REGISTERING_TOP_TYPES set in js/blockly_config.js.
  const { env } = setup();
  // Drive a one-block workspace through generateBlocklyJS and assert the
  // function definition appears un-wrapped.
  const js = env.Blockly.JavaScript;
  const origBlockToCode = js.blockToCode;
  const origInit  = js.init;
  const origFinish= js.finish;
  js.init   = () => {};
  js.finish = (s) => s;
  js.blockToCode = () => 'async function my_block() {\n}\n';
  try {
    const fakeWs = {
      getTopBlocks: () => [{ type: 'myblocks_definition', outputConnection: null }],
      getAllVariables: () => [],
    };
    const out = env.window.generateBlocklyJS(fakeWs);
    assert.ok(out.includes('async function my_block() {'), 'definition appears');
    assert.ok(!out.includes("_hats.push(async () => {\nasync function my_block"),
      'definition is NOT wrapped in _hats.push');
  } finally {
    js.blockToCode = origBlockToCode;
    js.init   = origInit;
    js.finish = origFinish;
  }
});
