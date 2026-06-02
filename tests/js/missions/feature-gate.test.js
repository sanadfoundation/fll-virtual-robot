'use strict';

// Missions are always enabled — the ?missions=1 gate was removed once
// the feature was considered ready for all users.

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_app']).ctx;
}

test('isEnabled: always true', () => {
  const { MISSIONS } = env();
  assert.strictEqual(MISSIONS.isEnabled(), true);
});
