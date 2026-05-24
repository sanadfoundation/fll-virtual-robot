'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema']).ctx;
}

test('CONDITION_KINDS lists all six v1 primitives', () => {
  const ctx = env();
  assert.deepStrictEqual(
    [...ctx.MISSIONS.schema.CONDITION_KINDS].sort(),
    ['all_of', 'any_of', 'contact', 'not', 'sensor', 'zone'],
  );
});

test('SCORING_KINDS lists step_sum and objective_minus_penalties', () => {
  const ctx = env();
  assert.deepStrictEqual(
    [...ctx.MISSIONS.schema.SCORING_KINDS].sort(),
    ['objective_minus_penalties', 'step_sum'],
  );
});

test('DIFFICULTY_TIERS is the three-tier ladder in display order', () => {
  const ctx = env();
  assert.deepStrictEqual(
    ctx.MISSIONS.schema.DIFFICULTY_TIERS,
    ['beginner', 'intermediate', 'advanced'],
  );
});

test('CHALLENGE_TYPES covers mission and obstacle_course', () => {
  const ctx = env();
  assert.deepStrictEqual(
    [...ctx.MISSIONS.schema.CHALLENGE_TYPES].sort(),
    ['mission', 'obstacle_course'],
  );
});

test('DEFAULT_PENALTIES matches the spec values', () => {
  const ctx = env();
  assert.deepStrictEqual(ctx.MISSIONS.schema.DEFAULT_PENALTIES, {
    per_contact: 5,
    cap:         50,
    per_second_over: 1,
  });
});

test('SCHEMA_VERSION is 1', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.schema.SCHEMA_VERSION, 1);
});
