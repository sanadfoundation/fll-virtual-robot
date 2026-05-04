'use strict';

// Validates sim.executeCommand — the per-command bridge entry point that
// main.js invokes on each {type:'cmd'} message from the Python worker.

module.exports = [
  {
    name: 'executeCommand: read_sensors returns initial robot state',
    async fn(createSim, assert) {
      const sim = createSim();
      const result = await sim.executeCommand({ type: 'read_sensors' });

      assert.strictEqual(result.x,       350);
      assert.strictEqual(result.y,       980);
      assert.strictEqual(result.heading, -90);
      assert.strictEqual(result.stopped, false);
    },
  },
  {
    name: 'executeCommand: move command updates robot position',
    async fn(createSim, assert) {
      const sim = createSim();
      const result = await sim.executeCommand({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
      });

      assert.ok(result.y < 980, `y=${result.y} should be < 980 after moving north`);
      assert.strictEqual(result.stopped, false);
    },
  },
  {
    name: 'executeCommand: sequential commands processed in order',
    async fn(createSim, assert) {
      const sim = createSim();

      const r1 = await sim.executeCommand({ type: 'read_sensors' });
      assert.strictEqual(r1.y, 980);

      const r2 = await sim.executeCommand({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
      });
      assert.ok(r2.y < 980, `y=${r2.y} should decrease after move`);
    },
  },
  {
    name: 'executeCommand: stopped:true when _stopRequested is set',
    async fn(createSim, assert) {
      const sim = createSim();
      sim._stopRequested = true;

      const result = await sim.executeCommand({ type: 'read_sensors' });
      assert.strictEqual(result.stopped, true);
    },
  },
];
