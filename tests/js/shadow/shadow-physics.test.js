'use strict';

// Tests for resetShadow() and _shadowApplyTank().
// Initial state: x=350, y=980, heading=-90 (facing north).

const EPS = 1.0; // mm / degree tolerance

function close(a, b, tol) { return Math.abs(a - b) <= tol; }

module.exports = [
  // ── resetShadow ──────────────────────────────────────────────────────────────
  {
    name: 'resetShadow: copies current robot x/y/heading into shadowRobot',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.x = 500; sim.robot.y = 700; sim.robot.heading = 45;
      sim.resetShadow();
      assert.strictEqual(sim.shadowRobot.x,       500);
      assert.strictEqual(sim.shadowRobot.y,       700);
      assert.strictEqual(sim.shadowRobot.heading, 45);
    },
  },
  {
    name: 'resetShadow: copies pairMap into shadowPairMap',
    fn(createSim, assert) {
      const sim = createSim();
      sim.pairMap[0] = { left: 'A', right: 'B' };
      sim.resetShadow();
      assert.strictEqual(sim.shadowPairMap[0].left,  'A');
      assert.strictEqual(sim.shadowPairMap[0].right, 'B');
    },
  },
  {
    name: 'resetShadow: mutations to shadowRobot do not affect robot',
    fn(createSim, assert) {
      const sim = createSim();
      sim.resetShadow();
      sim.shadowRobot.x = 9999;
      assert.strictEqual(sim.robot.x, 350);
    },
  },

  // ── _shadowApplyTank ─────────────────────────────────────────────────────────
  {
    name: '_shadowApplyTank: straight forward 100mm → y decreases by 100, x and heading unchanged',
    fn(createSim, assert) {
      const sim = createSim();
      sim._shadowApplyTank(1, 1, 100);
      assert.ok(close(sim.shadowRobot.x, 350, EPS),       `x=${sim.shadowRobot.x}`);
      assert.ok(close(sim.shadowRobot.y, 880, EPS),       `y=${sim.shadowRobot.y}`);
      assert.ok(close(sim.shadowRobot.heading, -90, EPS), `h=${sim.shadowRobot.heading}`);
    },
  },
  {
    name: '_shadowApplyTank: straight backward 100mm → y increases by 100, x and heading unchanged',
    fn(createSim, assert) {
      const sim = createSim();
      sim._shadowApplyTank(-1, -1, 100);
      assert.ok(close(sim.shadowRobot.x, 350, EPS),       `x=${sim.shadowRobot.x}`);
      assert.ok(close(sim.shadowRobot.y, 1080, EPS),      `y=${sim.shadowRobot.y}`);
      assert.ok(close(sim.shadowRobot.heading, -90, EPS), `h=${sim.shadowRobot.heading}`);
    },
  },
  {
    name: '_shadowApplyTank: pure right pivot (lv=1,rv=-1) → position unchanged, heading increases',
    fn(createSim, assert) {
      const sim = createSim();
      const hBefore = sim.shadowRobot.heading;
      sim._shadowApplyTank(1, -1, 100);
      assert.ok(close(sim.shadowRobot.x, 350, EPS), `x=${sim.shadowRobot.x}`);
      assert.ok(close(sim.shadowRobot.y, 980, EPS), `y=${sim.shadowRobot.y}`);
      assert.ok(sim.shadowRobot.heading > hBefore, `heading should increase, got ${sim.shadowRobot.heading}`);
    },
  },
  {
    name: '_shadowApplyTank: pure left pivot (lv=-1,rv=1) → position unchanged, heading decreases',
    fn(createSim, assert) {
      const sim = createSim();
      const hBefore = sim.shadowRobot.heading;
      sim._shadowApplyTank(-1, 1, 100);
      assert.ok(close(sim.shadowRobot.x, 350, EPS), `x=${sim.shadowRobot.x}`);
      assert.ok(close(sim.shadowRobot.y, 980, EPS), `y=${sim.shadowRobot.y}`);
      assert.ok(sim.shadowRobot.heading < hBefore, `heading should decrease, got ${sim.shadowRobot.heading}`);
    },
  },
  {
    name: '_shadowApplyTank: 180° pivot heading delta matches arc formula (±1°)',
    fn(createSim, assert) {
      // Each wheel travels π*TRACK_W/2 = π*56 mm → exactly 180° heading change.
      const refDist = Math.PI * 56;
      const sim = createSim();
      sim._shadowApplyTank(1, -1, refDist);
      const delta = sim.shadowRobot.heading - (-90);
      assert.ok(close(delta, 180, 1.0), `heading delta=${delta}, expected ~180`);
    },
  },
  {
    name: '_shadowApplyTank: zero distance → no state change',
    fn(createSim, assert) {
      const sim = createSim();
      sim._shadowApplyTank(1, 1, 0.05); // below 0.1mm threshold
      assert.strictEqual(sim.shadowRobot.x, 350);
      assert.strictEqual(sim.shadowRobot.y, 980);
      assert.strictEqual(sim.shadowRobot.heading, -90);
    },
  },
  {
    name: '_shadowApplyTank: right arc (lv > rv) from north → x increases, heading increases',
    fn(createSim, assert) {
      const sim = createSim();
      sim._shadowApplyTank(0.75, 0.25, 100);
      assert.ok(sim.shadowRobot.x > 350,   `x=${sim.shadowRobot.x}`);
      assert.ok(sim.shadowRobot.heading > -90, `heading=${sim.shadowRobot.heading}`);
    },
  },
  {
    name: '_shadowApplyTank: result clamped to field bounds',
    fn(createSim, assert) {
      const sim = createSim();
      // Moving backward 2000mm from y=980 would reach y=2980, past FIELD_H_MM=1143.
      sim._shadowApplyTank(-1, -1, 2000);
      assert.ok(sim.shadowRobot.y <= 1143, `y=${sim.shadowRobot.y}`);
      assert.ok(sim.shadowRobot.y >= 0,    `y=${sim.shadowRobot.y}`);
    },
  },
];
