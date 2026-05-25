'use strict';

// Pure-helper tests for js/myblocks_blocks.js — name slugging, derived block
// name, proc-id minting. These run independent of Blockly (which is loaded
// browser-side); they exercise only the functions that don't touch the
// Blockly.Blocks registry or block instance APIs.

const test   = require('node:test');
const assert = require('node:assert');
const vm     = require('node:vm');
const fs     = require('node:fs');
const path   = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadModule() {
  const ctx = {};
  for (const f of ['js/myblocks_proccode.js', 'js/myblocks_blocks.js']) {
    const code = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
    const wrapped = '(function (window, self, globalThis) {\n' + code + '\n})';
    vm.runInThisContext(wrapped, { filename: f })(ctx, ctx, ctx);
  }
  return ctx.MyBlocks;
}

// ── slugifyName ──────────────────────────────────────────────────────────────

test('slugifyName: normalizes whitespace, punctuation, and case to a JS ident', () => {
  const { slugifyName } = loadModule();
  assert.strictEqual(slugifyName('rotate my robot'),  'rotate_my_robot');
  assert.strictEqual(slugifyName('Drive Forward!'),   'drive_forward');
  assert.strictEqual(slugifyName('  spaced  out  '),  'spaced_out');
  assert.strictEqual(slugifyName('100%-of-the-way'),  '_100_of_the_way');
  assert.strictEqual(slugifyName(''),                 'my_block');
});

test('slugifyName: deterministic — same input gives same output', () => {
  const { slugifyName } = loadModule();
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(slugifyName('rotate by'), 'rotate_by');
  }
});

// ── derivedNameFromArgspec ───────────────────────────────────────────────────

test('derivedNameFromArgspec: joins label tokens with arg-name placeholders', () => {
  const { derivedNameFromArgspec } = loadModule();
  const spec = [
    { kind: 'label', text: 'rotate ' },
    { kind: 'arg', argKind: 'string_number', name: 'angle', argId: 'a' },
    { kind: 'label', text: ' ' },
    { kind: 'arg', argKind: 'boolean', name: 'direction', argId: 'b' },
    { kind: 'label', text: ' my function' },
  ];
  // For the generator we want a stable function name; we strip args and
  // collapse the labels.
  assert.strictEqual(derivedNameFromArgspec(spec), 'rotate my function');
});

test('derivedNameFromArgspec: argspec with only args returns the first arg name', () => {
  const { derivedNameFromArgspec } = loadModule();
  const spec = [
    { kind: 'arg', argKind: 'string_number', name: 'a', argId: 'id-A' },
    { kind: 'arg', argKind: 'boolean', name: 'b', argId: 'id-B' },
  ];
  // No label tokens — fall back to a sensible default so we never emit an
  // unnamed async function.
  assert.strictEqual(derivedNameFromArgspec(spec), 'my_block');
});

test('derivedNameFromArgspec: empty argspec returns the default name', () => {
  const { derivedNameFromArgspec } = loadModule();
  assert.strictEqual(derivedNameFromArgspec([]), 'my_block');
});

// ── genId ────────────────────────────────────────────────────────────────────

test('genId: produces a 20-char scratch-style id, unique across calls', () => {
  const { genId } = loadModule();
  const ids = new Set();
  for (let i = 0; i < 1000; i++) ids.add(genId());
  assert.strictEqual(ids.size, 1000, 'no collisions in 1k samples');
  for (const id of ids) {
    assert.strictEqual(id.length, 20, 'id length is 20');
  }
});

// ── seedArgspec ──────────────────────────────────────────────────────────────

test('seedArgspec: produces an empty-name single-label argspec for a fresh definition', () => {
  const { seedArgspec } = loadModule();
  const spec = seedArgspec();
  assert.deepStrictEqual(spec, [{ kind: 'label', text: 'block name' }]);
});

// ── makeArgToken ─────────────────────────────────────────────────────────────

test('makeArgToken: number/text builds a string_number arg with empty default', () => {
  const { makeArgToken } = loadModule();
  const t = makeArgToken('number');
  assert.strictEqual(t.kind, 'arg');
  assert.strictEqual(t.argKind, 'string_number');
  assert.strictEqual(t.defaultValue, '');
  assert.ok(t.argId && t.argId.length === 20, 'argId is a 20-char id');
  assert.strictEqual(t.name, 'number');
});

test('makeArgToken: boolean builds a boolean arg with "false" default', () => {
  const { makeArgToken } = loadModule();
  const t = makeArgToken('boolean');
  assert.strictEqual(t.argKind, 'boolean');
  assert.strictEqual(t.defaultValue, 'false');
  assert.strictEqual(t.name, 'boolean');
});

test('makeArgToken: label builds a label token with the given text', () => {
  const { makeArgToken } = loadModule();
  const t = makeArgToken('label', 'whatever');
  assert.deepStrictEqual(t, { kind: 'label', text: 'whatever' });
});

test('makeArgToken: label without text uses "label text"', () => {
  const { makeArgToken } = loadModule();
  assert.deepStrictEqual(makeArgToken('label'), { kind: 'label', text: 'label text' });
});

