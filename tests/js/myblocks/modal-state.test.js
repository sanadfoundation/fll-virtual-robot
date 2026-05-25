'use strict';

// Pure-state tests for the My Blocks modal — the controller object that
// holds the argspec under construction and reacts to the modal's three
// "Add" cards. Decoupling the state from the DOM so we can verify the
// state machine without standing up JSDOM. The DOM shell is browser-only.

const test   = require('node:test');
const assert = require('node:assert');
const vm     = require('node:vm');
const fs     = require('node:fs');
const path   = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadModule() {
  const ctx = {};
  for (const f of ['js/myblocks_proccode.js', 'js/myblocks_blocks.js', 'js/myblocks_modal.js']) {
    const code = fs.readFileSync(path.join(REPO_ROOT, f), 'utf8');
    const wrapped = '(function (window, self, globalThis) {\n' + code + '\n})';
    vm.runInThisContext(wrapped, { filename: f })(ctx, ctx, ctx);
  }
  return ctx.MyBlocks;
}

test('createModalState: seeds with the SPIKE "block name" placeholder', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  assert.deepStrictEqual(s.getArgspec(), [{ kind: 'label', text: 'block name' }]);
});

test('addNumber: appends a string_number arg with empty default', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.addNumber();
  const spec = s.getArgspec();
  assert.strictEqual(spec.length, 2);
  assert.strictEqual(spec[1].kind, 'arg');
  assert.strictEqual(spec[1].argKind, 'string_number');
  assert.strictEqual(spec[1].defaultValue, '');
  assert.ok(spec[1].argId && spec[1].argId.length === 20);
});

test('addBoolean: appends a boolean arg with "false" default', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.addBoolean();
  const spec = s.getArgspec();
  assert.strictEqual(spec[1].argKind, 'boolean');
  assert.strictEqual(spec[1].defaultValue, 'false');
});

test('addLabel: appends a "label text" label token', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.addLabel();
  const spec = s.getArgspec();
  assert.strictEqual(spec[1].kind, 'label');
  assert.strictEqual(spec[1].text, 'label text');
});

test('removeAt: drops token at the given index', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.addNumber();
  s.addBoolean();
  s.removeAt(1); // drop the number, keep boolean
  const spec = s.getArgspec();
  assert.strictEqual(spec.length, 2);
  assert.strictEqual(spec[0].kind, 'label');
  assert.strictEqual(spec[1].argKind, 'boolean');
});

test('removeAt: out-of-range index is a no-op', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.removeAt(5);
  assert.strictEqual(s.getArgspec().length, 1);
  s.removeAt(-1);
  assert.strictEqual(s.getArgspec().length, 1);
});

test('editTokenText: rewrites a label token in place', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.editTokenText(0, 'rotate');
  assert.strictEqual(s.getArgspec()[0].text, 'rotate');
});

test('editTokenText: rewrites an arg token name in place (no kind change)', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.addNumber();
  s.editTokenText(1, 'angle');
  const spec = s.getArgspec();
  assert.strictEqual(spec[1].kind, 'arg');
  assert.strictEqual(spec[1].argKind, 'string_number');
  assert.strictEqual(spec[1].name, 'angle');
});

test('result: composing several actions builds the expected argspec', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  s.editTokenText(0, 'rotate');
  s.addNumber();
  s.addLabel();
  s.addBoolean();
  s.editTokenText(1, 'angle');
  s.editTokenText(2, 'by');
  s.editTokenText(3, 'direction');

  const spec = s.getArgspec();
  assert.strictEqual(spec.length, 4);
  assert.deepStrictEqual(
    spec.map(t => t.kind === 'label' ? { kind: 'label', text: t.text } : { kind: 'arg', argKind: t.argKind, name: t.name }),
    [
      { kind: 'label', text: 'rotate' },
      { kind: 'arg',   argKind: 'string_number', name: 'angle' },
      { kind: 'label', text: 'by' },
      { kind: 'arg',   argKind: 'boolean',       name: 'direction' },
    ],
  );
});

test('procId: minted once at create, stable across mutations', () => {
  const { createModalState } = loadModule();
  const s = createModalState();
  const id1 = s.getProcId();
  s.addNumber();
  s.editTokenText(0, 'do thing');
  const id2 = s.getProcId();
  assert.strictEqual(id1, id2);
  assert.strictEqual(id1.length, 20);
});
