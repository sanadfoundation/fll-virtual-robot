'use strict';

// Missions are an in-development feature gated by ?missions=1 so the rest
// of the simulator can ship without exposing incomplete UI to end-users.
// MISSIONS.isEnabled(location) is the canonical check — main.js consults
// it to decide whether to call MISSIONS.boot(...) and whether to leave
// the header 🎯 button visible.

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_app']).ctx;
}

function loc(search) {
  return { search, hash: '', pathname: '/' };
}

test('isEnabled: false when no ?missions param is present', () => {
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(loc('')), false);
});

test('isEnabled: true when ?missions=1 is set', () => {
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(loc('?missions=1')), true);
});

test('isEnabled: false when ?missions=0', () => {
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(loc('?missions=0')), false);
});

test('isEnabled: true when ?missions=1 is one of several params', () => {
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(loc('?foo=bar&missions=1&baz=qux')), true);
});

test('isEnabled: false when ?missions is present but valueless', () => {
  // ?missions= (no value) shouldn't enable — explicit =1 is the contract.
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(loc('?missions=')), false);
});

test('isEnabled: tolerates missing/undefined location', () => {
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(undefined), false);
  assert.strictEqual(MISSIONS.isEnabled(null),      false);
  assert.strictEqual(MISSIONS.isEnabled({}),        false);
});
