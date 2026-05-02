'use strict';

// Characterize reset() and _clampRobot() behavior.

const EPS = 1e-9;

module.exports = [
  {
    name: 'initial state: x=350, y=980, heading=-90',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
      assert.strictEqual(sim.robot.heading, -90);
    },
  },
  {
    name: 'initial state: all 25 display pixels are 0',
    fn(createSim, assert) {
      const display = createSim().robot.display;
      assert.strictEqual(display.length, 25);
      assert.ok(display.every(v => v === 0));
    },
  },
  {
    name: 'initial state: all motor positions are 0',
    fn(createSim, assert) {
      const motors = createSim().robot.motors;
      for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
        assert.strictEqual(motors[port], 0, `motors.${port}`);
      }
    },
  },
  {
    name: 'reset(): restores position, heading, trail, and pairMap',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.robot.x = 1000;
      sim.robot.y = 500;
      sim.robot.heading = 45;
      sim.pairMap  = { 0: { left: 'A', right: 'B' } };
      sim.trail.push({ x: 1000, y: 500 });

      sim.reset();

      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
      assert.strictEqual(sim.robot.heading, -90);
      assert.strictEqual(Object.keys(sim.pairMap).length, 0);
      assert.strictEqual(sim.trail.length, 1);
    },
  },
  {
    name: 'reset(): isRunning set to false',
    fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      sim.reset();
      assert.strictEqual(sim.isRunning, false);
    },
  },
  {
    name: '_clampRobot: x clamped to [0, 2362]',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.x = -10;
      sim._clampRobot();
      assert.strictEqual(sim.robot.x, 0);

      sim.robot.x = 9999;
      sim._clampRobot();
      assert.strictEqual(sim.robot.x, 2362);
    },
  },
  {
    name: '_clampRobot: y clamped to [0, 1143]',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.y = -5;
      sim._clampRobot();
      assert.strictEqual(sim.robot.y, 0);

      sim.robot.y = 9999;
      sim._clampRobot();
      assert.strictEqual(sim.robot.y, 1143);
    },
  },
  {
    name: '_clampRobot: in-bounds values are unchanged',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.x = 1181;
      sim.robot.y = 571;
      sim._clampRobot();
      assert.strictEqual(sim.robot.x, 1181);
      assert.strictEqual(sim.robot.y, 571);
    },
  },
];
