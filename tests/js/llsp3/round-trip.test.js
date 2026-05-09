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

const BLOCK_FIXTURE = fs.readFileSync(
  path.join(REPO_ROOT, 'tests/fixtures/llsp3/block-project.llsp3')
);

test('round-trip: real Spike-app Block fixture preserves block structure', async () => {
  const ctx = makeLlsp3Env([
    'llsp3_assets', 'llsp3_manifest', 'llsp3_python', 'llsp3_blocks', 'llsp3_io',
  ]).ctx;

  const loaded = await ctx.LLSP3.io.read(BLOCK_FIXTURE);
  assert.strictEqual(loaded.type, 'word-blocks');

  const sb3In  = await ctx.LLSP3.blocks.readSb3(loaded.sb3);
  const blocklyState = ctx.LLSP3.blocks.sb3BlocksToBlocklyState(sb3In.blocks);

  // Should have at least the whenProgramStarts top-level block from the sample
  const tops = blocklyState.blocks.blocks;
  assert.ok(tops.length >= 1);
  const opcodes = tops.map(b => b.type).sort();
  assert.ok(opcodes.includes('flipperevents_whenProgramStarts'),
    `expected hat block in ${JSON.stringify(opcodes)}`);

  // Re-encode and confirm we can read what we wrote
  const reEncoded = ctx.LLSP3.blocks.blocklyStateToSb3Blocks(blocklyState);
  const sb3Out    = await ctx.LLSP3.blocks.writeSb3(reEncoded, sb3In.extensions);
  const merged    = ctx.LLSP3.manifest.mergeForSave(loaded.manifest,
    { name: loaded.manifest.name, extensions: sb3In.extensions });

  const llsp3 = await ctx.LLSP3.io.write({
    type: 'word-blocks', manifest: merged, sb3: sb3Out,
  });
  const back = await ctx.LLSP3.io.read(llsp3);
  assert.strictEqual(back.type, 'word-blocks');
  assert.strictEqual(back.manifest.id, loaded.manifest.id);
});
