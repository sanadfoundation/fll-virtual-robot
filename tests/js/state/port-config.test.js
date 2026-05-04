'use strict';

module.exports = [
  {
    name: 'PORT_CONFIG is exposed and matches default wiring',
    fn: async (createSim, assert) => {
      const sim = createSim();
      const ctx = sim.constructor; // RobotSimulator class — but config is a const
      // PORT_CONFIG lives at module scope; expose via window or read via sim instance
      assert.strictEqual(sim._portConfig.A.kind, 'motor');
      assert.strictEqual(sim._portConfig.A.role, 'drive-left');
      assert.strictEqual(sim._portConfig.B.kind, 'motor');
      assert.strictEqual(sim._portConfig.B.role, 'drive-right');
      assert.strictEqual(sim._portConfig.C.kind, 'empty');
      assert.strictEqual(sim._portConfig.D.kind, 'empty');
      assert.strictEqual(sim._portConfig.E.kind, 'color_sensor');
      assert.strictEqual(sim._portConfig.F.kind, 'distance_sensor');
    },
  },
  {
    name: '_execCmd throws on motor command targeting empty port',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      let threw = null;
      try {
        await sim._execCmd({ type: 'motor_run', port: 'C', velocity: 360 });
      } catch (e) {
        threw = e;
      }
      assert.ok(threw, 'expected throw');
      assert.match(threw.message, /port C has no motor/);
      assert.match(threw.message, /configured: empty/);
    },
  },
  {
    name: '_execCmd throws on motor command targeting sensor port',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      let threw = null;
      try {
        await sim._execCmd({ type: 'motor_degrees', port: 'E', degrees: 360, velocity: 500 });
      } catch (e) {
        threw = e;
      }
      assert.ok(threw, 'expected throw');
      assert.match(threw.message, /port E has no motor/);
      assert.match(threw.message, /configured: color_sensor/);
    },
  },
  {
    name: '_execCmd succeeds on motor command targeting motor port A',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      // Pair A as left drive so _animateSingleMotor takes the tank path.
      await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
      // motor_degrees on A should not throw
      await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 90, velocity: 500 });
      // No assertion on movement — we're verifying no throw.
    },
  },
  {
    name: '_execCmd does not validate non-port commands',
    fn: async (createSim, assert) => {
      const sim = createSim();
      sim.isRunning = true;
      // wait/print/hub_display etc. have no port — must not throw
      await sim._execCmd({ type: 'wait', ms: 0 });
      await sim._execCmd({ type: 'print', text: 'hi' });
    },
  },
];
