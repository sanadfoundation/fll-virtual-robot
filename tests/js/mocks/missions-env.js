'use strict';

// Loads the requested mission modules into an isolated `window`-like
// object so tests can drive `ctx.MISSIONS.<module>` directly. Mirrors the
// pattern in tests/js/mocks/llsp3-env.js — see that file for the rationale
// behind using vm.runInThisContext rather than vm.createContext.

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  const wrapped =
    '(function (window, self, globalThis) {\n' + code + '\n})';
  const fn = vm.runInThisContext(wrapped, { filename: relPath });
  fn(ctx, ctx, ctx);
}

function makeMissionsEnv(modules = []) {
  const ctx = {};
  for (const mod of modules) {
    loadInto(ctx, `js/${mod}.js`);
  }
  return { ctx };
}

module.exports = { makeMissionsEnv, REPO_ROOT };
