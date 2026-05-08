'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function freshEnv() {
  return makeLlsp3Env(['llsp3_python']).ctx;
}

test('writeProjectBody: wraps source as {"main": "..."}', () => {
  const ctx = freshEnv();
  const out = ctx.LLSP3.python.writeProjectBody('print("hi")\n');
  assert.strictEqual(typeof out, 'string');
  assert.deepStrictEqual(JSON.parse(out), { main: 'print("hi")\n' });
});

test('readProjectBody: extracts the main source string', () => {
  const ctx = freshEnv();
  const code = ctx.LLSP3.python.readProjectBody('{"main":"x = 1\\n"}');
  assert.strictEqual(code, 'x = 1\n');
});

test('readProjectBody: round-trip preserves Unicode and trailing newlines', () => {
  const ctx = freshEnv();
  const original = '# café\nprint("π ≈ 3.14")\n\n\n';
  const round = ctx.LLSP3.python.readProjectBody(
    ctx.LLSP3.python.writeProjectBody(original)
  );
  assert.strictEqual(round, original);
});

test('readProjectBody: rejects payloads missing the main key', () => {
  const ctx = freshEnv();
  assert.throws(() => ctx.LLSP3.python.readProjectBody('{}'),
    /missing required key "main"/);
});

test('readProjectBody: rejects non-JSON', () => {
  const ctx = freshEnv();
  assert.throws(() => ctx.LLSP3.python.readProjectBody('not json'),
    /projectbody\.json/i);
});
