'use strict';

// Verifies that light_matrix.write — whether invoked from the Python path
// (_execCmd({type: 'hub_display', ...})) or directly from the Blockly
// generator (sim._showText(text)) — mirrors the text to the Console panel
// via window.appendOutput. See spec:
//   docs/superpowers/specs/2026-05-23-light-matrix-write-console-mirror-design.md

const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

function makeSpy() {
  const calls = [];
  const spy = (text) => calls.push(text);
  return { spy, calls };
}

test('hub_display: _execCmd path calls window.appendOutput with the text (Python path)', async () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  await sim._execCmd({ type: 'hub_display', text: 'speed=42' });
  assert.deepStrictEqual(calls, ['speed=42'],
    `expected appendOutput to receive "speed=42" exactly once, got ${JSON.stringify(calls)}`);
});

test('hub_display: direct _showText call mirrors text to appendOutput (Blockly path)', () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  sim._showText('hello');
  assert.deepStrictEqual(calls, ['hello'],
    `expected appendOutput to receive "hello" exactly once, got ${JSON.stringify(calls)}`);
});

test('hub_display: empty string still produces a console line (matches print() of empty)', () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  sim._showText('');
  assert.deepStrictEqual(calls, [''],
    `expected appendOutput to receive "" exactly once, got ${JSON.stringify(calls)}`);
});

test('hub_display: null/undefined coerces to empty string before mirroring', () => {
  const { spy, calls } = makeSpy();
  const sim = createSim({ appendOutput: spy });
  sim._showText(null);
  sim._showText(undefined);
  assert.deepStrictEqual(calls, ['', ''],
    `expected two empty-string calls (null and undefined coerced via String(text || '')), got ${JSON.stringify(calls)}`);
});

test('hub_display: missing window.appendOutput does not throw (defensive guard)', () => {
  const sim = createSim({ appendOutput: undefined });
  // Should not throw even though appendOutput is undefined on the mock window.
  assert.doesNotThrow(() => sim._showText('safe'),
    `_showText must guard against missing window.appendOutput`);
});
