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

test('tickPositions: float minor pitch (inches: 254 / 25.4) — no FP drift collisions', () => {
  const { major, minor } = r.tickPositions(2362, 254, 25.4);
  // 10 majors at 0, 254, 508, …, 2286.
  assert.deepEqual(major, [0, 254, 508, 762, 1016, 1270, 1524, 1778, 2032, 2286]);
  // 92 minor candidates at i=1..92, minus 9 overlaps with non-zero majors = 83.
  assert.strictEqual(minor.length, 83);
  // Spot-check: 254 mm sits on the major-pitch grid via 10*25.4; must not appear in minors.
  for (const m of minor) {
    for (const M of major) {
      if (M === 0) continue;
      assert.ok(Math.abs(m - M) > 1e-6, `minor ${m} collides with major ${M}`);
    }
  }
});

// ── clientToMM ──────────────────────────────────────────────────────────────

test('clientToMM: cursor at canvas top-left → (0, 0) mm', () => {
  const rect = { left: 0, top: 0 };
  assert.deepEqual(r.clientToMM(0, 0, rect, 1), { x: 0, y: 0 });
});

test('clientToMM: cursor inside canvas with no rect offset → unscaled mm', () => {
  const rect = { left: 0, top: 0 };
  assert.deepEqual(r.clientToMM(100, 50, rect, 1), { x: 100, y: 50 });
});

test('clientToMM: subtracts rect.left/rect.top before dividing by scale', () => {
  const rect = { left: 100, top: 50 };
  assert.deepEqual(r.clientToMM(200, 150, rect, 1), { x: 100, y: 100 });
});

test('clientToMM: scale 0.5 doubles mm distance', () => {
  const rect = { left: 0, top: 0 };
  assert.deepEqual(r.clientToMM(200, 100, rect, 0.5), { x: 400, y: 200 });
});

// ── placeHoverOverlay ───────────────────────────────────────────────────────

test('placeHoverOverlay: cursor in interior → bottom-right of cursor', () => {
  const out = r.placeHoverOverlay(50, 50, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 62, top: 62 });
});

test('placeHoverOverlay: cursor near right edge → flips to left of cursor', () => {
  const out = r.placeHoverOverlay(650, 50, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 528, top: 62 }); // 650 - 12 - 110 = 528
});

test('placeHoverOverlay: cursor near bottom edge → flips above cursor', () => {
  const out = r.placeHoverOverlay(50, 380, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 62, top: 350 }); // 380 - 12 - 18 = 350
});

test('placeHoverOverlay: cursor in bottom-right corner → flips both axes', () => {
  const out = r.placeHoverOverlay(680, 390, 700, 400, 110, 18, 12);
  assert.deepEqual(out, { left: 558, top: 360 });
});
