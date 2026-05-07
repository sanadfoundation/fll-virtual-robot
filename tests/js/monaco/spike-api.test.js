'use strict';

// Structural tests for js/monaco_config.js — exercises the completion,
// signature help, and hover providers via a minimal Monaco stub. The goal is
// to pin the SPIKE_API table's shape and presence of canonical entries so
// drift between the table and py/spike_bridge.py is caught.

const test   = require('node:test');
const assert = require('node:assert');
const vm     = require('vm');
const fs     = require('fs');
const path   = require('path');

const MONACO_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../../js/monaco_config.js'), 'utf8',
);

function makeMonacoEnv() {
  const providers = {
    completion: null,
    signature:  null,
    hover:      null,
  };

  const monaco = {
    languages: {
      CompletionItemKind: {
        Method: 0, Constant: 1, Module: 2, Keyword: 3,
      },
      CompletionItemInsertTextRule: {
        InsertAsSnippet: 4,
      },
      registerCompletionItemProvider(lang, provider) { providers.completion = provider; },
      registerSignatureHelpProvider(lang, provider)  { providers.signature  = provider; },
      registerHoverProvider(lang, provider)          { providers.hover      = provider; },
    },
  };

  const window = {};
  const context = vm.createContext({ window, monaco, console });
  vm.runInContext(MONACO_CODE, context, { filename: 'js/monaco_config.js' });

  // The script attaches registerSpikeCompletions to window — invoke it.
  window.registerSpikeCompletions(monaco);

  return { window, monaco, providers };
}

function makeModel(line) {
  return {
    getLineContent: () => line,
  };
}

function position(col) {
  return { lineNumber: 1, column: col };
}

// ── Provider registration ────────────────────────────────────────────────────

test('registerSpikeCompletions installs all three providers', () => {
  const { providers } = makeMonacoEnv();
  assert.ok(providers.completion, 'completion provider not registered');
  assert.ok(providers.signature,  'signature provider not registered');
  assert.ok(providers.hover,      'hover provider not registered');
});

test('completion provider declares "." as a trigger character', () => {
  const { providers } = makeMonacoEnv();
  // Use loose array containment — providers.completion lives in a vm
  // sandbox so the array prototype is from a different realm.
  assert.ok(Array.from(providers.completion.triggerCharacters).includes('.'));
});

// ── motor.* completions ─────────────────────────────────────────────────────

test('motor. completion returns all 12 documented methods', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor.';
  const result = providers.completion.provideCompletionItems(
    makeModel(line),
    position(line.length + 1),
  );
  const labels = result.suggestions.map(s => s.label);
  // Methods that must be present (mirror py/spike_bridge.py motor class).
  const expected = [
    'run_for_degrees', 'run_for_time', 'run_to_absolute_position',
    'run_to_relative_position', 'run', 'stop',
    'velocity', 'absolute_position', 'relative_position',
    'reset_relative_position', 'get_duty_cycle', 'set_duty_cycle',
  ];
  for (const m of expected) {
    assert.ok(labels.includes(m), `motor.${m} missing from completions`);
  }
});

test('motor. completion includes stop-mode and direction constants', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor.';
  const result = providers.completion.provideCompletionItems(
    makeModel(line),
    position(line.length + 1),
  );
  const labels = result.suggestions.map(s => s.label);
  for (const c of ['BRAKE', 'COAST', 'HOLD', 'CLOCKWISE', 'COUNTERCLOCKWISE', 'SHORTEST_PATH']) {
    assert.ok(labels.includes(c), `motor.${c} constant missing`);
  }
});

test('completion items have required fields (label, kind, detail, documentation)', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor.';
  const result = providers.completion.provideCompletionItems(
    makeModel(line),
    position(line.length + 1),
  );
  for (const s of result.suggestions) {
    assert.strictEqual(typeof s.label,      'string', 'label not string');
    assert.strictEqual(typeof s.insertText, 'string', 'insertText not string');
    assert.ok(s.documentation,  `${s.label}: missing documentation`);
    assert.ok(s.range,          `${s.label}: missing range`);
  }
});

// ── hub.* completions ───────────────────────────────────────────────────────

test('hub. completion exposes the documented hub methods', () => {
  const { providers } = makeMonacoEnv();
  const line = 'hub.';
  const result = providers.completion.provideCompletionItems(
    makeModel(line),
    position(line.length + 1),
  );
  const labels = result.suggestions.map(s => s.label);
  // Sub-modules (light_matrix, motion_sensor, button, light, sound) live as
  // dotted keys on SPIKE_API rather than as nested members on the hub entry,
  // so they don't appear in `hub.` completions — that's intentional. What
  // does show up is the small set of hub-level methods.
  for (const m of ['device_uuid', 'hardware_id', 'temperature', 'power_off']) {
    assert.ok(labels.includes(m), `hub.${m} missing`);
  }
});

test('hub.light_matrix. completion returns the documented methods', () => {
  const { providers } = makeMonacoEnv();
  const line = 'hub.light_matrix.';
  const result = providers.completion.provideCompletionItems(
    makeModel(line),
    position(line.length + 1),
  );
  const labels = result.suggestions.map(s => s.label);
  for (const m of ['write', 'show', 'show_image', 'set_pixel', 'clear', 'off']) {
    assert.ok(labels.includes(m), `hub.light_matrix.${m} missing`);
  }
});

// ── motor_pair.* completions ────────────────────────────────────────────────

test('motor_pair. completion includes core movement methods', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor_pair.';
  const result = providers.completion.provideCompletionItems(
    makeModel(line),
    position(line.length + 1),
  );
  const labels = result.suggestions.map(s => s.label);
  for (const m of ['pair', 'unpair', 'move', 'move_for_degrees', 'move_for_time',
                   'move_tank', 'move_tank_for_degrees', 'move_tank_for_time', 'stop']) {
    assert.ok(labels.includes(m), `motor_pair.${m} missing`);
  }
});

// ── Signature help ──────────────────────────────────────────────────────────

test('signature help on motor.run_for_degrees(  returns the right signature', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor.run_for_degrees(';
  const result = providers.signature.provideSignatureHelp(
    makeModel(line),
    position(line.length + 1),
  );
  assert.ok(result, 'expected signature result');
  assert.strictEqual(result.value.signatures.length, 1);
  const sig = result.value.signatures[0];
  assert.match(sig.label, /run_for_degrees/);
  assert.match(sig.label, /port/);
  assert.match(sig.label, /degrees/);
  assert.match(sig.label, /velocity/);
  assert.ok(sig.parameters.length >= 3, `expected ≥ 3 params, got ${sig.parameters.length}`);
});

test('signature help advances activeParameter with each comma', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor.run_for_degrees(0, 360, ';
  const result = providers.signature.provideSignatureHelp(
    makeModel(line),
    position(line.length + 1),
  );
  assert.ok(result);
  assert.strictEqual(result.value.activeParameter, 2,
    `expected activeParameter=2 after 2 commas, got ${result.value.activeParameter}`);
});

test('signature help returns null on a non-API call', () => {
  const { providers } = makeMonacoEnv();
  const result = providers.signature.provideSignatureHelp(
    makeModel('print('),
    position(7),
  );
  assert.strictEqual(result, null);
});

// ── Hover ───────────────────────────────────────────────────────────────────

test('hover on motor.run_for_degrees returns signature + doc', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor.run_for_degrees';
  const result = providers.hover.provideHover(
    makeModel(line),
    position(10),  // somewhere inside the identifier
  );
  assert.ok(result, 'expected hover result');
  assert.ok(Array.isArray(result.contents));
  assert.ok(result.contents.length >= 2, 'expected sig + doc contents');
  // First content block is the python signature.
  assert.match(result.contents[0].value, /motor\.run_for_degrees/);
});

test('hover on a top-level module returns its docstring', () => {
  const { providers } = makeMonacoEnv();
  const line = 'motor';
  const result = providers.hover.provideHover(
    makeModel(line),
    position(3),
  );
  assert.ok(result, 'expected hover result for motor');
  assert.match(result.contents[0].value, /motor/);
});

test('hover on an unknown identifier returns null', () => {
  const { providers } = makeMonacoEnv();
  const result = providers.hover.provideHover(
    makeModel('not_a_real_thing'),
    position(5),
  );
  assert.strictEqual(result, null);
});

// ── Structural integrity ────────────────────────────────────────────────────

test('every method completion has a matching signature help entry', () => {
  // Iterate the documented methods on a few classes and confirm the signature
  // provider can resolve each one. This is the cross-consistency check that
  // catches cases where SPIKE_API.members[X] exists for completion but the
  // sig string is malformed enough that signature help fails.
  const { providers } = makeMonacoEnv();
  const cases = [
    { obj: 'motor',     methods: ['run_for_degrees', 'run', 'stop', 'velocity'] },
    { obj: 'motor_pair', methods: ['pair', 'move', 'move_for_degrees', 'stop'] },
    { obj: 'color_sensor', methods: ['color', 'reflection', 'rgbi'] },
    { obj: 'distance_sensor', methods: ['distance'] },
  ];
  const failures = [];
  for (const { obj, methods } of cases) {
    for (const m of methods) {
      const line = `${obj}.${m}(`;
      const sig = providers.signature.provideSignatureHelp(
        makeModel(line), position(line.length + 1),
      );
      if (!sig) { failures.push(`${obj}.${m}: no signature`); continue; }
      if (sig.value.signatures.length === 0) {
        failures.push(`${obj}.${m}: empty signatures array`);
      }
    }
  }
  assert.deepStrictEqual(failures, []);
});
