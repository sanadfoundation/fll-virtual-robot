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

test('write+read round-trip for a word-blocks project', async () => {
  const ctx = makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python', 'llsp3_blocks', 'llsp3_io',
  ]).ctx;

  const blocklyState = {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: 'flipperevents_whenProgramStarts',
          id: 'top1',
          x: 0, y: 0,
        },
      ],
    },
  };

  const sb3Blocks = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(blocklyState);
  const sb3Bytes = await ctx.LLSP3.blocks.writeSb3(sb3Blocks, ['flipperevents']);

  const manifest = ctx.LLSP3.manifest.defaultManifest('word-blocks',
    { name: 'wb-rt' });
  manifest.extensions = ['flipperevents'];

  const llsp3 = await ctx.LLSP3.io.write({
    type: 'word-blocks', manifest, sb3: sb3Bytes,
  });
  const back = await ctx.LLSP3.io.read(llsp3);

  assert.strictEqual(back.type, 'word-blocks');
  assert.strictEqual(back.manifest.name, 'wb-rt');

  const sb3 = await ctx.LLSP3.blocks.readSb3(back.sb3);
  const restored = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3.blocks);
  assert.strictEqual(restored.blocks.blocks[0].type, 'flipperevents_whenProgramStarts');
});
