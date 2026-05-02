'use strict';

module.exports = [
  {
    name: '_robotOverlapsAABB: robot center inside box → true',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(
        sim._robotOverlapsAABB({ x: 500, y: 500 }, { x: 400, y: 400, w: 200, h: 200 }),
        true
      );
    },
  },
  {
    name: '_robotOverlapsAABB: robot far away → false',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(
        sim._robotOverlapsAABB({ x: 100, y: 100 }, { x: 400, y: 400, w: 200, h: 200 }),
        false
      );
    },
  },
  {
    name: '_robotOverlapsAABB: robot 85mm from box edge → true (radius 90mm)',
    fn(createSim, assert) {
      const sim = createSim();
      // Box top edge at y=500; robot at y=415 → 85mm gap → overlaps
      assert.strictEqual(
        sim._robotOverlapsAABB({ x: 550, y: 415 }, { x: 500, y: 500, w: 100, h: 100 }),
        true
      );
    },
  },
  {
    name: '_robotOverlapsAABB: robot 95mm from box edge → false (radius 90mm)',
    fn(createSim, assert) {
      const sim = createSim();
      // Box top edge at y=500; robot at y=405 → 95mm gap → no overlap
      assert.strictEqual(
        sim._robotOverlapsAABB({ x: 550, y: 405 }, { x: 500, y: 500, w: 100, h: 100 }),
        false
      );
    },
  },
  {
    name: '_robotOverlapsAABB: robot within 90mm of corner → true',
    fn(createSim, assert) {
      const sim = createSim();
      // Box corner at (500,500); robot at (437,437) → dist ≈ 89.1mm < 90
      const dx = 63, dy = 63;
      assert.ok(Math.sqrt(dx*dx + dy*dy) < 90, 'test setup: robot is within radius');
      assert.strictEqual(
        sim._robotOverlapsAABB({ x: 500 - dx, y: 500 - dy }, { x: 500, y: 500, w: 100, h: 100 }),
        true
      );
    },
  },
];
