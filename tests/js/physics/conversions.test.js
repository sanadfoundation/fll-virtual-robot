'use strict';

// Characterize _amountToMM(amount, unit) against the constants in simulator.js.
// WHEEL_CIRC_MM = Math.PI * 56 ≈ 175.929

const WHEEL_CIRC_MM = Math.PI * 56;
const EPS = 1e-9;

module.exports = [
  {
    name: 'degrees 360 → full wheel circumference',
    fn(createSim, assert) {
      const mm = createSim()._amountToMM(360, 'degrees');
      assert.ok(Math.abs(mm - WHEEL_CIRC_MM) < EPS, `got ${mm}`);
    },
  },
  {
    name: 'degrees 180 → half wheel circumference',
    fn(createSim, assert) {
      const mm = createSim()._amountToMM(180, 'degrees');
      assert.ok(Math.abs(mm - WHEEL_CIRC_MM / 2) < EPS, `got ${mm}`);
    },
  },
  {
    name: 'degrees 0 → 0 mm',
    fn(createSim, assert) {
      assert.strictEqual(createSim()._amountToMM(0, 'degrees'), 0);
    },
  },
  {
    name: 'rotations 1 → full wheel circumference',
    fn(createSim, assert) {
      assert.strictEqual(createSim()._amountToMM(1, 'rotations'), WHEEL_CIRC_MM);
    },
  },
  {
    name: 'rotations 2 → 2 × wheel circumference',
    fn(createSim, assert) {
      assert.strictEqual(createSim()._amountToMM(2, 'rotations'), 2 * WHEEL_CIRC_MM);
    },
  },
  {
    name: 'cm 1 → 10 mm',
    fn(createSim, assert) {
      assert.strictEqual(createSim()._amountToMM(1, 'cm'), 10);
    },
  },
  {
    name: 'cm 10 → 100 mm',
    fn(createSim, assert) {
      assert.strictEqual(createSim()._amountToMM(10, 'cm'), 100);
    },
  },
  {
    name: 'inches 1 → 25.4 mm',
    fn(createSim, assert) {
      assert.strictEqual(createSim()._amountToMM(1, 'inches'), 25.4);
    },
  },
  {
    name: 'inches 2 → 50.8 mm',
    fn(createSim, assert) {
      assert.ok(Math.abs(createSim()._amountToMM(2, 'inches') - 50.8) < EPS);
    },
  },
  {
    name: 'unknown unit falls through to degrees logic',
    fn(createSim, assert) {
      // Default branch: same as degrees
      const mm = createSim()._amountToMM(360, 'mm');
      assert.ok(Math.abs(mm - WHEEL_CIRC_MM) < EPS, `got ${mm}`);
    },
  },
];
