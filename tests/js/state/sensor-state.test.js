'use strict';

module.exports = [
  {
    name: '_sensorState: returns correct initial values',
    fn(createSim, assert) {
      const sim   = createSim();
      const state = sim._sensorState();
      assert.strictEqual(state.x,           350);
      assert.strictEqual(state.y,           980);
      assert.strictEqual(state.heading,     -90);
      assert.strictEqual(state.color,       'none');
      assert.strictEqual(state.distance_mm, 300);
      assert.strictEqual(state.stopped,     false);
      // Check each motor port individually (avoids vm-context prototype mismatch)
      for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
        assert.strictEqual(state.motors[port], 0, `motors.${port}`);
      }
    },
  },
  {
    name: '_sensorState: motors is a copy, not a reference',
    fn(createSim, assert) {
      const sim   = createSim();
      const state = sim._sensorState();
      state.motors.A = 999;
      assert.strictEqual(sim.robot.motors.A, 0);
    },
  },
  {
    name: '_sensorState: reflects updated robot position',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.x = 700;
      sim.robot.y = 500;
      sim.robot.heading = 45;
      const state = sim._sensorState();
      assert.strictEqual(state.x,       700);
      assert.strictEqual(state.y,       500);
      assert.strictEqual(state.heading, 45);
    },
  },
];
