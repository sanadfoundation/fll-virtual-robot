'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  return makeLlsp3Env(['llsp3_assets']).ctx;
}

test('Cat Meow 1 base64 decodes to the expected MD5', () => {
  const ctx = env();
  const bytes = ctx.LLSP3.assets.base64ToUint8(ctx.LLSP3.assets.SOUND_CAT_MEOW_1_BASE64);
  const md5 = crypto.createHash('md5').update(bytes).digest('hex');
  assert.strictEqual(md5, '1b8b032b06360a6cf7c31d86bddd144b');
});

test('EMPTY_SVG is the zero-byte placeholder', () => {
  const ctx = env();
  assert.strictEqual(ctx.LLSP3.assets.EMPTY_SVG, '');
});

test('writeSb3: produces a zip with project.json + the two default assets', async () => {
  const ctx = makeLlsp3Env([
    'llsp3_assets', 'llsp3_blocks',
  ]).ctx;

  const blocks = {
    'TOP': { opcode: 'flipperevents_whenProgramStarts', next: null, parent: null,
             inputs: {}, fields: {}, shadow: false, topLevel: true, x: 0, y: 0 },
  };
  const sb3Bytes = await ctx.LLSP3.blocks.writeSb3(blocks, ['flipperevents']);
  const inner = await ctx.JSZip.loadAsync(sb3Bytes);

  const names = Object.keys(inner.files).sort();
  assert.deepStrictEqual(names, [
    '1b8b032b06360a6cf7c31d86bddd144b.wav',
    'd41d8cd98f00b204e9800998ecf8427e.svg',
    'project.json',
  ]);

  const projectText = await inner.file('project.json').async('string');
  const project = JSON.parse(projectText);
  assert.strictEqual(project.targets.length, 2);
  assert.strictEqual(project.targets[0].isStage, true);
  assert.strictEqual(project.targets[1].isStage, false);
  assert.strictEqual(Object.keys(project.targets[1].blocks).length, 1);
  assert.deepStrictEqual(project.extensions, ['flipperevents']);
  assert.strictEqual(project.meta.semver, '3.0.0');
});
