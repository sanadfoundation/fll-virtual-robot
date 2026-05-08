'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeLlsp3Env, REPO_ROOT } = require('../mocks/llsp3-env');

function freshEnv() {
  return makeLlsp3Env([
    'llsp3_assets',
    'llsp3_manifest',
    'llsp3_python',
    'llsp3_io',
  ]).ctx;
}

const PYTHON_FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/python-project.llsp3')
);

test('read: dispatches a Python .llsp3 to type=python with main source', async () => {
  const ctx = freshEnv();
  const result = await ctx.LLSP3.io.read(PYTHON_FIXTURE);

  assert.strictEqual(result.type, 'python');
  assert.strictEqual(result.manifest.type, 'python');
  assert.strictEqual(typeof result.manifest.name, 'string');
  assert.strictEqual(typeof result.python, 'string');
  assert.match(result.python, /async def main/);
});

test('write+read round-trip for a fresh Python project', async () => {
  const ctx = freshEnv();
  const manifest = ctx.LLSP3.manifest.defaultManifest('python', { name: 'rt' });
  const original = '# round trip\nprint(1 + 1)\n';

  const blob = await ctx.LLSP3.io.write({ type: 'python', manifest, python: original });
  const back = await ctx.LLSP3.io.read(blob);

  assert.strictEqual(back.type, 'python');
  assert.strictEqual(back.python, original);
  assert.strictEqual(back.manifest.name, 'rt');
  assert.strictEqual(back.manifest.id, manifest.id);
});

test('write: a Python .llsp3 contains exactly manifest.json, projectbody.json, icon.svg', async () => {
  const ctx = freshEnv();
  const manifest = ctx.LLSP3.manifest.defaultManifest('python', { name: 'q' });
  const blob = await ctx.LLSP3.io.write({ type: 'python', manifest, python: 'pass\n' });
  const zip = await ctx.JSZip.loadAsync(blob);
  const names = Object.keys(zip.files).sort();
  assert.deepStrictEqual(names, ['icon.svg', 'manifest.json', 'projectbody.json']);
});
