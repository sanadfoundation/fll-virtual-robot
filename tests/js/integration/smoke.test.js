'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadPythonRuntime } = require('./micropython-loader');

test('micropython: runtime loads and computes 1+1', async () => {
  const mp = await loadPythonRuntime();
  mp.runPython('result = 1 + 1');
  assert.strictEqual(mp.globals.get('result'), 2);
});

test('micropython: registerJsModule exposes JS values as `import js`', async () => {
  const jsModule = { magicNumber: 42 };
  const mp = await loadPythonRuntime({ jsModule });
  mp.runPython('import js\nresult = js.magicNumber');
  assert.strictEqual(mp.globals.get('result'), 42);
});
