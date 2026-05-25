'use strict';

// Pure-helper tests for js/myblocks_proccode.js — proccode parser/emitter.
// Loaded into a vm.runInThisContext sandbox like the LLSP3 modules so the
// IIFE's `(global)` argument is our test ctx.

const test   = require('node:test');
const assert = require('node:assert');
const vm     = require('node:vm');
const fs     = require('node:fs');
const path   = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadModule() {
  const ctx = {};
  const code = fs.readFileSync(path.join(REPO_ROOT, 'js/myblocks_proccode.js'), 'utf8');
  const wrapped = '(function (window, self, globalThis) {\n' + code + '\n})';
  vm.runInThisContext(wrapped, { filename: 'js/myblocks_proccode.js' })(ctx, ctx, ctx);
  return ctx.MyBlocks;
}

// ── parseProccode ────────────────────────────────────────────────────────────

test('parseProccode: real example from LEGO file — "rotate %s %b my function"', () => {
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: 'rotate %s %b my function',
    argumentnames: ['angle', 'direction'],
    argumentdefaults: ['', 'false'],
    argumentids: ['id-A', 'id-B'],
  });
  assert.deepStrictEqual(spec, [
    { kind: 'label', text: 'rotate ' },
    { kind: 'arg', argKind: 'string_number', name: 'angle', argId: 'id-A', defaultValue: '' },
    { kind: 'label', text: ' ' },
    { kind: 'arg', argKind: 'boolean', name: 'direction', argId: 'id-B', defaultValue: 'false' },
    { kind: 'label', text: ' my function' },
  ]);
});

test('parseProccode: label-only proccode produces a single label token', () => {
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: 'do the thing',
    argumentnames: [],
    argumentdefaults: [],
    argumentids: [],
  });
  assert.deepStrictEqual(spec, [{ kind: 'label', text: 'do the thing' }]);
});

test('parseProccode: empty proccode produces empty argspec', () => {
  const { parseProccode } = loadModule();
  assert.deepStrictEqual(parseProccode({
    proccode: '',
    argumentnames: [],
    argumentdefaults: [],
    argumentids: [],
  }), []);
});

test('parseProccode: leading arg drops the leading empty label', () => {
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: '%s tail',
    argumentnames: ['x'],
    argumentdefaults: [''],
    argumentids: ['id-X'],
  });
  assert.deepStrictEqual(spec, [
    { kind: 'arg', argKind: 'string_number', name: 'x', argId: 'id-X', defaultValue: '' },
    { kind: 'label', text: ' tail' },
  ]);
});

test('parseProccode: trailing arg drops the trailing empty label', () => {
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: 'head %b',
    argumentnames: ['flag'],
    argumentdefaults: ['false'],
    argumentids: ['id-F'],
  });
  assert.deepStrictEqual(spec, [
    { kind: 'label', text: 'head ' },
    { kind: 'arg', argKind: 'boolean', name: 'flag', argId: 'id-F', defaultValue: 'false' },
  ]);
});

test('parseProccode: adjacent args drop the between-args empty label', () => {
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: '%s%b',
    argumentnames: ['a', 'b'],
    argumentdefaults: ['', 'false'],
    argumentids: ['id-A', 'id-B'],
  });
  assert.deepStrictEqual(spec, [
    { kind: 'arg', argKind: 'string_number', name: 'a', argId: 'id-A', defaultValue: '' },
    { kind: 'arg', argKind: 'boolean', name: 'b', argId: 'id-B', defaultValue: 'false' },
  ]);
});

test('parseProccode: %% escape becomes a literal % in the label', () => {
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: '100%% of %s',
    argumentnames: ['x'],
    argumentdefaults: [''],
    argumentids: ['id-X'],
  });
  assert.deepStrictEqual(spec, [
    { kind: 'label', text: '100% of ' },
    { kind: 'arg', argKind: 'string_number', name: 'x', argId: 'id-X', defaultValue: '' },
  ]);
});

test('parseProccode: unknown %x placeholders fall through as literal label text', () => {
  // Scratch only defines %s/%b. Anything else (e.g. a stale %n) should not
  // crash the parser; treat it as label text so we don't lose data on import.
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: 'value %n',
    argumentnames: [],
    argumentdefaults: [],
    argumentids: [],
  });
  assert.deepStrictEqual(spec, [{ kind: 'label', text: 'value %n' }]);
});

test('parseProccode: tolerates missing argumentdefaults/argumentids', () => {
  // The call-site mutation only carries proccode + argumentids; argumentnames
  // and argumentdefaults are absent. Parser must not crash, and missing
  // entries default to '' for %s and 'false' for %b.
  const { parseProccode } = loadModule();
  const spec = parseProccode({
    proccode: 'rotate %s %b my function',
    argumentnames: ['angle', 'direction'],
    argumentids: ['id-A', 'id-B'],
  });
  assert.strictEqual(spec[1].defaultValue, '');
  assert.strictEqual(spec[3].defaultValue, 'false');
});

// ── emitProccode ─────────────────────────────────────────────────────────────

test('emitProccode: reverses the real example losslessly', () => {
  const { emitProccode } = loadModule();
  const out = emitProccode([
    { kind: 'label', text: 'rotate ' },
    { kind: 'arg', argKind: 'string_number', name: 'angle', argId: 'id-A', defaultValue: '' },
    { kind: 'label', text: ' ' },
    { kind: 'arg', argKind: 'boolean', name: 'direction', argId: 'id-B', defaultValue: 'false' },
    { kind: 'label', text: ' my function' },
  ]);
  assert.strictEqual(out.proccode, 'rotate %s %b my function');
  assert.deepStrictEqual(out.argumentnames,    ['angle', 'direction']);
  assert.deepStrictEqual(out.argumentdefaults, ['', 'false']);
  assert.deepStrictEqual(out.argumentids,      ['id-A', 'id-B']);
});

test('emitProccode: escapes literal % in label text as %%', () => {
  const { emitProccode } = loadModule();
  const out = emitProccode([
    { kind: 'label', text: '100% of ' },
    { kind: 'arg', argKind: 'string_number', name: 'x', argId: 'id-X', defaultValue: '' },
  ]);
  assert.strictEqual(out.proccode, '100%% of %s');
});

test('emitProccode: argspec with no labels produces "%s %b" (space-separated)', () => {
  // SPIKE's procedure-block renderer requires whitespace between markers, so
  // adjacent args without a separator label still emit with a single space.
  const { emitProccode } = loadModule();
  const out = emitProccode([
    { kind: 'arg', argKind: 'string_number', name: 'a', argId: 'id-A', defaultValue: '' },
    { kind: 'arg', argKind: 'boolean', name: 'b', argId: 'id-B', defaultValue: 'false' },
  ]);
  assert.strictEqual(out.proccode, '%s %b');
});

test('emitProccode: modal-created argspec (no trailing space on label) gets a separator inserted', () => {
  // Regression: the modal seeds an argspec like `[{label "myblock"}, {arg}, ...]`
  // with no trailing space on the label. Without separator insertion, the
  // emitted proccode would be `"myblock%s%b%s"` and SPIKE's editor renders it
  // as a single garbled label rather than `myblock` + 3 input slots.
  const { emitProccode } = loadModule();
  const out = emitProccode([
    { kind: 'label', text: 'myblock' },
    { kind: 'arg', argKind: 'string_number', name: 'a', argId: 'id-A', defaultValue: '' },
    { kind: 'arg', argKind: 'boolean',       name: 'b', argId: 'id-B', defaultValue: 'false' },
    { kind: 'arg', argKind: 'string_number', name: 'c', argId: 'id-C', defaultValue: '' },
  ]);
  assert.strictEqual(out.proccode, 'myblock %s %b %s');
});

// ── parse → emit round-trip ──────────────────────────────────────────────────

test('round-trip: parse + emit is byte-identical for the LEGO sample', () => {
  const { parseProccode, emitProccode } = loadModule();
  const orig = {
    proccode: 'rotate %s %b my function',
    argumentnames: ['angle', 'direction'],
    argumentdefaults: ['', 'false'],
    argumentids: ['id-A', 'id-B'],
  };
  const out = emitProccode(parseProccode(orig));
  assert.deepStrictEqual(out, orig);
});

test('round-trip: %% escape survives parse + emit', () => {
  const { parseProccode, emitProccode } = loadModule();
  const orig = {
    proccode: '100%% off, %s remaining',
    argumentnames: ['n'],
    argumentdefaults: [''],
    argumentids: ['id-N'],
  };
  const out = emitProccode(parseProccode(orig));
  assert.deepStrictEqual(out, orig);
});

test('round-trip: adjacent args survive parse + emit (with separator normalization)', () => {
  // Parsing the malformed `"%s%b"` form is lenient — we still recover both
  // args — but emitting normalises to the SPIKE-required `"%s %b"` (with
  // separator). The proccode is not byte-identical, only the arg metadata is.
  const { parseProccode, emitProccode } = loadModule();
  const orig = {
    proccode: '%s%b',
    argumentnames: ['a', 'b'],
    argumentdefaults: ['', 'false'],
    argumentids: ['id-A', 'id-B'],
  };
  const out = emitProccode(parseProccode(orig));
  assert.strictEqual(out.proccode, '%s %b');
  assert.deepStrictEqual(out.argumentnames,    orig.argumentnames);
  assert.deepStrictEqual(out.argumentdefaults, orig.argumentdefaults);
  assert.deepStrictEqual(out.argumentids,      orig.argumentids);
});
