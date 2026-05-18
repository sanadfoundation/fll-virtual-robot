'use strict';

// Python unit-test runner under MicroPython-WASM.
//
// Why MicroPython instead of CPython:
//   The browser ships MicroPython (via @micropython/micropython-webassembly-
//   pyscript). Running the bridge's tests under CPython is convenient but
//   silently hides MP-only quirks (e.g. no `traceback` module). This runner
//   executes the exact same test files under the exact same Python the browser
//   uses — the only test source of truth.
//
// Why not wrap in `node --test`:
//   The Python suite already prints a readable verbosity=2 report and returns
//   pass/fail via TestResult.failuresNum/errorsNum. Wrapping it in node:test
//   would nest the report inside a test-case name and obscure per-test output.
//   `npm test` chains py → js sequentially; that's enough unification.
//
// What this script does:
//   1. Boot a MicroPython interpreter.
//   2. Copy py/spike_bridge.py and every tests/py/*.py file into the WASM VFS.
//   3. Inside Python: import mock_js, route sys.modules['js'] to it (matches
//      the CPython runner's pattern), import every test_*.py module, gather
//      their TestCase subclasses into one synthetic combined module, and let
//      `unittest.main` run the lot.
//   4. Exit non-zero if any test failed or errored.

const fs = require('node:fs');
const path = require('node:path');
const { loadPythonRuntime } = require('../js/integration/micropython-loader');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PY_SRC    = path.join(REPO_ROOT, 'py');
const TESTS_PY  = path.join(REPO_ROOT, 'tests', 'py');

function listPyFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.py'))
    .sort();
}

async function main() {
  const mp = await loadPythonRuntime({});

  // Mount /py/*.py and /tests/*.py into the WASM filesystem so Python's
  // import machinery can resolve them.
  mp.FS.mkdir('/py');
  mp.FS.mkdir('/tests');

  for (const f of listPyFiles(PY_SRC)) {
    mp.FS.writeFile(`/py/${f}`, fs.readFileSync(path.join(PY_SRC, f), 'utf8'));
  }

  const testModules = listPyFiles(TESTS_PY)
    .filter((f) => f.startsWith('test_'))
    .map((f) => f.slice(0, -3));

  // Mock_js needs to be mounted too — it's the module the tests use to fake
  // out `js` for the bridge.
  for (const f of listPyFiles(TESTS_PY)) {
    mp.FS.writeFile(`/tests/${f}`, fs.readFileSync(path.join(TESTS_PY, f), 'utf8'));
  }

  // Tell Python: the module list (so we don't hard-code names twice).
  const moduleListPy = '[' + testModules.map((n) => `'${n}'`).join(', ') + ']';

  await mp.runPythonAsync(`
import sys
sys.path.insert(0, '/tests')
sys.path.insert(0, '/py')

import mock_js
sys.modules['js'] = mock_js

# Polyfill asyncio.run — pyscript's MicroPython ships an asyncio module but
# without the top-level run() helper that CPython has. Several tests use it
# to drive sb._handle_run() directly; mirror CPython semantics by creating
# a fresh loop and running to completion.
import asyncio as _aio
if not hasattr(_aio, 'run'):
    # pyscript MP's asyncio is wired to the JS event loop — no synchronous
    # run_until_complete is exposed. Drive the coroutine by hand instead.
    # This is sufficient for the bridge tests because their awaitables either
    # complete immediately (BridgeMock intercept → _NoopAwaitable) or yield
    # once. Tests that need real interleaving / sleep are skipped under MP
    # (see _IS_MP guards in the test files) — the JS-side round-trip suite
    # covers those production paths.
    def _aio_run(coro):
        while True:
            try:
                coro.send(None)
            except StopIteration as si:
                return getattr(si, 'value', None)
    _aio.run = _aio_run

import unittest

# Polyfill assertNotIn — MicroPython's unittest ships assertIn but not the
# negative form. CPython has both; closing the gap here keeps test sources
# portable between the two runners.
if not hasattr(unittest.TestCase, 'assertNotIn'):
    def _assertNotIn(self, member, container, msg=None):
        if member in container:
            raise AssertionError(msg or ('%r unexpectedly in %r' % (member, container)))
    unittest.TestCase.assertNotIn = _assertNotIn

_TEST_MODULE_NAMES = ${moduleListPy}
_test_modules = [__import__(name) for name in _TEST_MODULE_NAMES]

# Collect every TestCase subclass across all modules. We can't reuse
# unittest.main(module=...) once per module because MicroPython prints a
# separate report each time; collapse into one synthetic module so the user
# sees a single combined summary.
class _Combined:
    __name__ = 'all_tests'

_combined = _Combined()
_seen_names = set()
for _mod in _test_modules:
    _mod_name = _mod.__name__
    for _attr in dir(_mod):
        _obj = getattr(_mod, _attr)
        if isinstance(_obj, type) and issubclass(_obj, unittest.TestCase) and _obj is not unittest.TestCase:
            # Prefix to disambiguate collisions across modules (e.g. two
            # files both defining TestMotionSensor / TestHubButton).
            _key = _mod_name + '__' + _attr
            if _key in _seen_names:
                continue
            _seen_names.add(_key)
            setattr(_combined, _key, _obj)

_result = unittest.main(module=_combined)

# Expose pass/fail counts as plain globals so the JS side can read them.
_failed = int(bool(_result.failuresNum) or bool(_result.errorsNum))
_tests_run = int(_result.testsRun)
_failures = int(_result.failuresNum)
_errors = int(_result.errorsNum)
_skipped = int(_result.skippedNum)
`);

  const failed     = mp.globals.get('_failed');
  const testsRun   = mp.globals.get('_tests_run');
  const failures   = mp.globals.get('_failures');
  const errors     = mp.globals.get('_errors');
  const skipped    = mp.globals.get('_skipped');
  console.log(`\n[run-mpy] ran=${testsRun} failures=${failures} errors=${errors} skipped=${skipped}`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[run-mpy] fatal:', err);
  process.exit(2);
});
