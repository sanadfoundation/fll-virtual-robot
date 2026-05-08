'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const r = require('../../../js/ruler.js');

// ── tickPositions ───────────────────────────────────────────────────────────

test('tickPositions: 2362 mm × 200/100 → 12 majors and 12 minors', () => {
  const { major, minor } = r.tickPositions(2362, 200, 100);
  assert.deepEqual(major, [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200]);
  assert.deepEqual(minor, [100, 300, 500, 700, 900, 1100, 1300, 1500, 1700, 1900, 2100, 2300]);
});

test('tickPositions: 1143 mm × 200/100 → 6 majors and 6 minors', () => {
  const { major, minor } = r.tickPositions(1143, 200, 100);
  assert.deepEqual(major, [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(minor, [100, 300, 500, 700, 900, 1100]);
});

test('tickPositions: positions on both pitches count as major only (no duplicates)', () => {
  const { major, minor } = r.tickPositions(1000, 200, 100);
  assert.deepEqual(major, [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(minor, [100, 300, 500, 700, 900]); // no 200/400/600/800/1000
});

test('tickPositions: tiny field smaller than minor pitch → only [0] for major, no minors', () => {
  const { major, minor } = r.tickPositions(50, 200, 100);
  assert.deepEqual(major, [0]);
  assert.deepEqual(minor, []);
});
