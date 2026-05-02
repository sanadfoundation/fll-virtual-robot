'use strict';

// Characterize _animateTank(leftV, rightV, refDistMM) final robot state.
// Initial state: x=350, y=980, heading=-90°.

const EPS = 0.1; // mm or degree tolerance

function close(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

module.exports = [
  {
    name: 'straight forward 100mm: y decreases by 100, x and heading unchanged',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      await sim._animateTank(1, 1, 100);
      assert.ok(close(sim.robot.x, 350, EPS),       `x=${sim.robot.x}`);
      assert.ok(close(sim.robot.y, 880, EPS),       `y=${sim.robot.y}`);
      assert.ok(close(sim.robot.heading, -90, EPS), `h=${sim.robot.heading}`);
    },
  },
  {
    name: 'straight backward 100mm: y increases by 100, x and heading unchanged',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      await sim._animateTank(-1, -1, 100);
      assert.ok(close(sim.robot.x, 350, EPS),       `x=${sim.robot.x}`);
      assert.ok(close(sim.robot.y, 1080, EPS),      `y=${sim.robot.y}`);
      assert.ok(close(sim.robot.heading, -90, EPS), `h=${sim.robot.heading}`);
    },
  },
  {
    name: 'pure right pivot (lv=1,rv=-1): position unchanged, heading increases',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      const hBefore = sim.robot.heading;
      await sim._animateTank(1, -1, 100);
      // avg=0 → no translation
      assert.ok(close(sim.robot.x, 350, EPS), `x=${sim.robot.x}`);
      assert.ok(close(sim.robot.y, 980, EPS), `y=${sim.robot.y}`);
      // right pivot = heading increases (clockwise on canvas)
      assert.ok(sim.robot.heading > hBefore, `heading should increase, got ${sim.robot.heading}`);
    },
  },
  {
    name: 'pure left pivot (lv=-1,rv=1): position unchanged, heading decreases',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      const hBefore = sim.robot.heading;
      await sim._animateTank(-1, 1, 100);
      assert.ok(close(sim.robot.x, 350, EPS), `x=${sim.robot.x}`);
      assert.ok(close(sim.robot.y, 980, EPS), `y=${sim.robot.y}`);
      assert.ok(sim.robot.heading < hBefore, `heading should decrease, got ${sim.robot.heading}`);
    },
  },
  {
    name: 'heading delta of 180° pivot matches arc-length formula',
    async fn(createSim, assert) {
      // Each wheel traces a circle of radius TRACK_W/2 = 56mm.
      // 180° turn ↔ half that circumference = π * 56mm per wheel.
      // With lv=1, rv=-1, refDistMM = π*56 → heading should rotate by ~180°.
      const refDist = Math.PI * 56;
      const sim = createSim();
      sim.isRunning = true;
      await sim._animateTank(1, -1, refDist);
      const delta = sim.robot.heading - (-90);
      assert.ok(close(delta, 180, 1.0), `heading delta=${delta}, expected ~180`);
    },
  },
  {
    name: 'zero distance returns early without mutating state',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      await sim._animateTank(1, 1, 0.05); // < 0.1 threshold
      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
      assert.strictEqual(sim.robot.heading, -90);
    },
  },
  {
    name: 'right arc (lv > rv): x increases (turning toward east from north)',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      await sim._animateTank(0.75, 0.25, 100);
      // Turning right from heading -90 (north): x should increase slightly
      assert.ok(sim.robot.x > 350, `x=${sim.robot.x}`);
      assert.ok(sim.robot.heading > -90, `heading=${sim.robot.heading}`);
    },
  },
  {
    name: 'trail is appended on each step',
    async fn(createSim, assert) {
      const sim = createSim();
      const trailBefore = sim.trail.length;
      sim.isRunning = true;
      await sim._animateTank(1, 1, 100);
      assert.ok(sim.trail.length > trailBefore, `trail grew`);
    },
  },
  {
    name: 'isRunning=false breaks the loop early',
    async fn(createSim, assert) {
      const sim = createSim();
      // isRunning=false (default) → loop exits before first step
      await sim._animateTank(1, 1, 100);
      assert.strictEqual(sim.robot.y, 980); // unchanged
    },
  },
];
