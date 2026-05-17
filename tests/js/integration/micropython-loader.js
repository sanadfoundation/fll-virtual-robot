'use strict';

// MicroPython WASM loader for Node-side round-trip tests.
//
// Uses the same MicroPython variant the browser ships (@micropython/micropython-
// webassembly-pyscript), so tests exercise the same Python runtime as production.
// We deliberately avoid the worker/postMessage layer the browser app uses — in
// tests, Python and the JS simulator share a single Node event loop, so
// `js.bridgeSend` is wired straight to `sim.executeCommand`.
//
// CLAUDE.md constraint reminder: MicroPython has no `traceback` module. The
// bridge already accounts for this; tests should not rely on it either.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let _cachedLoader = null;

async function _getLoader() {
  if (_cachedLoader) return _cachedLoader;
  // The package ships micropython.mjs (ES module). Use dynamic import from CJS.
  const pkgPath = path.join(
    __dirname, '..', '..', '..',
    'node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs',
  );
  const mod = await import(pathToFileURL(pkgPath).href);
  _cachedLoader = mod.loadMicroPython;
  return _cachedLoader;
}

/**
 * Load a fresh MicroPython interpreter.
 *
 * @param {object} [opts]
 * @param {number} [opts.heapsize] - bytes of WASM heap (default 1 MB)
 * @param {object} [opts.jsModule] - object to register as `import js`
 * @returns {Promise<MicroPython>} the loaded runtime instance
 */
async function loadPythonRuntime(opts = {}) {
  const loadMicroPython = await _getLoader();
  const mp = await loadMicroPython({
    heapsize: opts.heapsize || 1024 * 1024,
    stderr: (line) => process.stderr.write(`[py] ${line}\n`),
    stdout: (line) => process.stdout.write(`[py] ${line}\n`),
  });
  if (opts.jsModule) {
    mp.registerJsModule('js', opts.jsModule);
  }
  return mp;
}

module.exports = { loadPythonRuntime };
