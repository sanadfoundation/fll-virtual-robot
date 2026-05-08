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
