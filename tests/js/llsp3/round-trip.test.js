'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeLlsp3Env, REPO_ROOT } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python', 'llsp3_io',
  ]).ctx;
}

const PY_FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/python-project.llsp3')
);

test('round-trip: real Spike-app Python fixture preserves main source byte-for-byte', async () => {
  const ctx = env();
  const loaded = await ctx.LLSP3.io.read(PY_FIXTURE);
  assert.strictEqual(loaded.type, 'python');

  const merged = ctx.LLSP3.manifest.mergeForSave(loaded.manifest, { name: loaded.manifest.name });
  const rewritten = await ctx.LLSP3.io.write({
    type: 'python',
    manifest: merged,
    python: loaded.python,
  });

  const back = await ctx.LLSP3.io.read(rewritten);
  assert.strictEqual(back.python, loaded.python);
  assert.strictEqual(back.manifest.id, loaded.manifest.id);
  assert.strictEqual(back.manifest.created, loaded.manifest.created);
  assert.notStrictEqual(back.manifest.lastsaved, loaded.manifest.lastsaved);
});
