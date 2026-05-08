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
