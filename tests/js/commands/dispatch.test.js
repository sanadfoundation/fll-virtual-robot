'use strict';

// Characterize _execCmd(cmd) — each command type should mutate robot state correctly.

const EPS = 0.5;
function close(a, b, tol) { return Math.abs(a - b) <= tol; }

module.exports = [
  // ── pair ──────────────────────────────────────────────────────────────────
  {
    name: 'pair: stores port mapping in pairMap',
    async fn(createSim, assert) {
      const sim = createSim();
      await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
      assert.strictEqual(sim.pairMap[0].left,  'A');
      assert.strictEqual(sim.pairMap[0].right, 'B');
    },
  },

  // ── move ──────────────────────────────────────────────────────────────────
  {
    name: 'move straight (steering=0): robot travels forward',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      // speed=1000, steering=0, 360 degrees ≈ WHEEL_CIRC_MM forward
      await sim._execCmd({ type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees' });
      assert.ok(sim.robot.y < 980, `y should decrease from 980, got ${sim.robot.y}`);
      assert.ok(close(sim.robot.heading, -90, EPS), `heading=${sim.robot.heading}`);
    },
  },

  // ── move_tank ─────────────────────────────────────────────────────────────
  {
    name: 'move_tank equal speeds: robot travels straight',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      await sim._execCmd({ type: 'move_tank', pair_id: 0, left_speed: 500, right_speed: 500, amount: 360, unit: 'degrees' });
      assert.ok(close(sim.robot.heading, -90, EPS), `heading=${sim.robot.heading}`);
      assert.ok(sim.robot.y < 980);
    },
  },
  {
    name: 'move_tank unequal speeds: robot turns',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      await sim._execCmd({ type: 'move_tank', pair_id: 0, left_speed: 1000, right_speed: 0, amount: 360, unit: 'degrees' });
      assert.ok(sim.robot.heading > -90, `heading should increase (right turn), got ${sim.robot.heading}`);
    },
  },

  // ── stop ──────────────────────────────────────────────────────────────────
  {
    name: 'stop: no state change',
    async fn(createSim, assert) {
      const sim = createSim();
      await sim._execCmd({ type: 'stop', pair_id: 0 });
      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
    },
  },

  // ── hub_display_off ───────────────────────────────────────────────────────
  {
    name: 'hub_display_off: sets all 25 pixels to 0',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.robot.display = Array(25).fill(80); // pre-light all pixels
      await sim._execCmd({ type: 'hub_display_off' });
      assert.strictEqual(sim.robot.display.length, 25);
      assert.ok(sim.robot.display.every(v => v === 0), `display=${JSON.stringify([...sim.robot.display])}`);
    },
  },

  // ── hub_pixel ─────────────────────────────────────────────────────────────
  {
    name: 'hub_pixel: sets correct display array index',
    async fn(createSim, assert) {
      const sim = createSim();
      await sim._execCmd({ type: 'hub_pixel', x: 2, y: 3, brightness: 80 });
      // index = y*5 + x = 3*5+2 = 17
      assert.strictEqual(sim.robot.display[17], 80);
    },
  },
  {
    name: 'hub_pixel: out-of-bounds x/y ignored',
    async fn(createSim, assert) {
      const sim = createSim();
      await sim._execCmd({ type: 'hub_pixel', x: 5, y: 0, brightness: 100 });
      assert.ok(sim.robot.display.every(v => v === 0), 'display should be unchanged');
    },
  },

  // ── motor_degrees ─────────────────────────────────────────────────────────
  {
    name: 'motor_degrees: no pair configured → non-drive motor, no position change on robot',
    async fn(createSim, assert) {
      const sim = createSim();
      sim.isRunning = true;
      // No pair map → non-drive motor path; robot position stays put
      await sim._execCmd({ type: 'motor_degrees', port: 'C', degrees: 360, velocity: 500 });
      // Position unchanged (non-drive motor only waits)
      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
    },
  },

  // ── motor_stop ────────────────────────────────────────────────────────────
  {
    name: 'motor_stop: no state change',
    async fn(createSim, assert) {
      const sim = createSim();
      await sim._execCmd({ type: 'motor_stop', port: 'A' });
      assert.strictEqual(sim.robot.y, 980);
    },
  },

  // ── print ─────────────────────────────────────────────────────────────────
  {
    name: 'print: calls window.appendOutput with cmd.text',
    async fn(createSim, assert) {
      const calls = [];
      const sim = createSim({ appendOutput: (text) => calls.push(text) });
      await sim._execCmd({ type: 'print', text: 'hello world' });
      assert.deepStrictEqual(calls, ['hello world']);
    },
  },
  {
    name: 'print: does not affect robot position',
    async fn(createSim, assert) {
      const sim = createSim();
      await sim._execCmd({ type: 'print', text: 'hello' });
      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
    },
  },
];
