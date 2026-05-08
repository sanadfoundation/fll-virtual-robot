'use strict';

// Loads JSZip + the requested LLSP3 modules into a vm sandbox. Returns the
// context so tests can drive `ctx.LLSP3.<module>` and `ctx.JSZip` directly.
//
// Usage:
//   const { ctx } = makeLlsp3Env(['llsp3_assets', 'llsp3_manifest']);
//   await ctx.LLSP3.manifest.read(buffer);

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  vm.runInContext(code, ctx, { filename: relPath });
}

function makeLlsp3Env(modules = []) {
  const ctx = {
    console,
    setTimeout, clearTimeout, setImmediate, clearImmediate,
    Buffer,
    URL, TextEncoder, TextDecoder,
  };
  vm.createContext(ctx);

  // JSZip first; LLSP3 modules depend on it.
  loadInto(ctx, 'tests/vendor/jszip.min.js');

  for (const mod of modules) {
    loadInto(ctx, `js/${mod}.js`);
  }

  return { ctx };
}

module.exports = { makeLlsp3Env, REPO_ROOT };
