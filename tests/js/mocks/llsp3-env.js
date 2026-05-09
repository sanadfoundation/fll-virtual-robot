'use strict';

// Loads JSZip + the requested LLSP3 modules into an isolated `window`-like
// object. Returns the context so tests can drive `ctx.LLSP3.<module>` and
// `ctx.JSZip` directly.
//
// Usage:
//   const { ctx } = makeLlsp3Env(['llsp3_assets', 'llsp3_manifest']);
//   await ctx.LLSP3.manifest.read(buffer);
//
// Implementation note: we evaluate module source via `vm.runInThisContext`
// with a synthetic `window` argument, rather than `vm.createContext`. This
// keeps array/object literals on the host realm's intrinsics so tests can
// use `assert.deepStrictEqual` against host-side `[]` / `{}` values.

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  // Provide window/self/globalThis bindings that all alias `ctx`, plus a
  // `module`/`exports` pair for UMD bundles like JSZip that prefer CommonJS
  // when available. The trailing JSZip pickup handles the case where the
  // bundle assigned to `module.exports` instead of `window.JSZip`.
  const wrapped =
    '(function (window, self, globalThis, module, exports) {\n' +
    code +
    '\n;if (module && module.exports && !window.JSZip) { window.JSZip = module.exports; }\n' +
    '})';
  const fn = vm.runInThisContext(wrapped, { filename: relPath });
  const fakeModule = { exports: {} };
  fn(ctx, ctx, ctx, fakeModule, fakeModule.exports);
}

function makeLlsp3Env(modules = []) {
  const ctx = {};

  // JSZip first; LLSP3 modules depend on it.
  loadInto(ctx, 'tests/vendor/jszip.min.js');

  for (const mod of modules) {
    loadInto(ctx, `js/${mod}.js`);
  }

  return { ctx };
}

module.exports = { makeLlsp3Env, REPO_ROOT };
