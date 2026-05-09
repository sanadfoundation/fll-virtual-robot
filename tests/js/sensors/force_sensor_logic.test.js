'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { emaStep, manualRamp, combine, forceToReadings } =
  require('../../../js/force_sensor_logic');

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── emaStep ────────────────────────────────────────────────────────────────

test('emaStep: first contact pulls EMA toward instantN by alpha', () => {
  // prevEma=0, instantN=5, alpha=0.4 → 0.4*5 + 0.6*0 = 2
  assert.ok(close(emaStep(0, 5, true, 0.4, 0.5), 2));
});

test('emaStep: steady contact blends prev EMA with instantN', () => {
  // prevEma=2, instantN=5, alpha=0.4 → 0.4*5 + 0.6*2 = 3.2
  assert.ok(close(emaStep(2, 5, true, 0.4, 0.5), 3.2));
});

test('emaStep: no-contact step bleeds prev EMA by decay factor', () => {
  // prevEma=4, hadContact=false, decay=0.5 → 4 * 0.5 = 2 (instantN ignored)
  assert.ok(close(emaStep(4, 999, false, 0.4, 0.5), 2));
});

test('emaStep: five no-contact ticks decay below 0.15 N from a 4 N start', () => {
  let ema = 4;
  for (let i = 0; i < 5; i++) ema = emaStep(ema, 0, false, 0.4, 0.5);
  assert.ok(ema < 0.15, `ema after 5 idle ticks = ${ema}`);
});

test('emaStep: zero prev + zero instant stays zero', () => {
  assert.strictEqual(emaStep(0, 0, true, 0.4, 0.5), 0);
});

// ── manualRamp ─────────────────────────────────────────────────────────────

test('manualRamp: null start returns 0', () => {
  assert.strictEqual(manualRamp(null, 1234, 1000, 10), 0);
});

test('manualRamp: zero elapsed returns 0', () => {
  assert.strictEqual(manualRamp(1000, 1000, 1000, 10), 0);
});

test('manualRamp: half-ramp returns half the max', () => {
  assert.strictEqual(manualRamp(1000, 1500, 1000, 10), 5);
});

test('manualRamp: past full ramp clamps to max', () => {
  assert.strictEqual(manualRamp(1000, 5000, 1000, 10), 10);
});

test('manualRamp: monotonic over a 1 s ramp', () => {
  let prev = -Infinity;
  for (let t = 0; t <= 1000; t += 100) {
    const v = manualRamp(0, t, 1000, 10);
    assert.ok(v >= prev, `non-monotonic at t=${t}: ${v} < ${prev}`);
    prev = v;
  }
});

// ── combine ────────────────────────────────────────────────────────────────

test('combine: returns the larger of the two', () => {
  assert.strictEqual(combine(2, 5), 5);
  assert.strictEqual(combine(7, 3), 7);
});

test('combine: zeros yield zero', () => {
  assert.strictEqual(combine(0, 0), 0);
});

test('combine: negative inputs unsupported but return the max all the same', () => {
  // Defensive: physics impulse → Newton conversion is always >= 0, and the
  // ramp is bounded [0, maxN]. If a negative ever sneaks in, max-of still
  // surfaces the larger value rather than producing junk.
  assert.strictEqual(combine(-1, 0.5), 0.5);
});

// ── forceToReadings ────────────────────────────────────────────────────────

test('forceToReadings: zero force → all zero / false', () => {
  const r = forceToReadings(0);
  assert.strictEqual(r.dn, 0);
  assert.strictEqual(r.pressed, false);
  assert.strictEqual(r.hard, false);
  assert.strictEqual(r.raw, 0);
});

test('forceToReadings: 0.5 N → pressed threshold met, not hard', () => {
  const r = forceToReadings(0.5);
  assert.strictEqual(r.dn, 5);
  assert.strictEqual(r.pressed, true);
  assert.strictEqual(r.hard, false);
  assert.ok(r.raw >= 200 && r.raw <= 210, `raw=${r.raw} should round to ~205`);
});

test('forceToReadings: 7 N → hard-pressed threshold met', () => {
  const r = forceToReadings(7);
  assert.strictEqual(r.dn, 70);
  assert.strictEqual(r.pressed, true);
  assert.strictEqual(r.hard, true);
});

test('forceToReadings: just-under-pressed threshold (0.49 N) reports not pressed', () => {
  const r = forceToReadings(0.49);
  assert.strictEqual(r.pressed, false);
});

test('forceToReadings: 10 N saturates dn at 100 and raw at 4095', () => {
  const r = forceToReadings(10);
  assert.strictEqual(r.dn, 100);
  assert.strictEqual(r.raw, 4095);
});

test('forceToReadings: 12 N over-range still clamped to 100 / 4095', () => {
  const r = forceToReadings(12);
  assert.strictEqual(r.dn, 100);
  assert.strictEqual(r.raw, 4095);
  assert.strictEqual(r.pressed, true);
  assert.strictEqual(r.hard, true);
});
