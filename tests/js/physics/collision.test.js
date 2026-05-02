'use strict';

module.exports = [
  {
    name: '_animateTank: no mission boxes — robot moves freely',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      assert.ok(Array.isArray(sim._missionBoxes), '_missionBoxes should be an array');
      assert.strictEqual(sim._missionBoxes.length, 0);
      await sim._animateTank(1, 1, 500);
      assert.ok(sim.robot.y < 980, `y=${sim.robot.y} should be < 980`);
    },
  },
  {
    name: '_animateTank: robot stops at mission box boundary',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      // Robot starts at (350, 980), heading=-90 (north). Box blocks path.
      sim._missionBoxes = [{ x: 260, y: 700, w: 180, h: 100 }];
      await sim._animateTank(1, 1, 2000);
      assert.strictEqual(
        sim._robotOverlapsAABB(sim.robot, sim._missionBoxes[0]),
        false,
        `robot at (${sim.robot.x.toFixed(1)}, ${sim.robot.y.toFixed(1)}) overlaps box`
      );
      assert.ok(sim.robot.y < 980, `y=${sim.robot.y} should be < 980`);
    },
  },
  {
    name: '_animateTank: robot stops before first box, ignores distant boxes',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      sim._missionBoxes = [
        { x: 260, y: 800, w: 180, h: 80 },
        { x: 260, y: 200, w: 180, h: 80 },
      ];
      await sim._animateTank(1, 1, 2000);
      assert.strictEqual(sim._robotOverlapsAABB(sim.robot, sim._missionBoxes[0]), false);
      assert.strictEqual(sim._robotOverlapsAABB(sim.robot, sim._missionBoxes[1]), false);
    },
  },
];
