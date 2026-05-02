'use strict';

// Tests for shadowCmd(jsonStr) dispatching to _shadowExecCmd().
// Verifies each command type advances the shadow robot correctly
// while leaving the actual robot untouched.

const EPS = 0.5;
function close(a, b, tol) { return Math.abs(a - b) <= tol; }

module.exports = [
  {
    name: 'shadowCmd: pair stores ports in shadowPairMap, not pairMap',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({ type: 'pair', pair_id: 0, left: 'A', right: 'B' }));
      assert.strictEqual(sim.shadowPairMap[0].left,  'A');
      assert.strictEqual(sim.shadowPairMap[0].right, 'B');
      assert.strictEqual(Object.keys(sim.pairMap).length, 0); // actual pairMap untouched
    },
  },
  {
    name: 'shadowCmd: move straight advances shadowRobot forward (y decreases)',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
      }));
      assert.ok(sim.shadowRobot.y < 980, `y=${sim.shadowRobot.y}`);
      assert.ok(close(sim.shadowRobot.heading, -90, EPS), `h=${sim.shadowRobot.heading}`);
    },
  },
  {
    name: 'shadowCmd: move does not affect actual robot position',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
      }));
      assert.strictEqual(sim.robot.x, 350);
      assert.strictEqual(sim.robot.y, 980);
    },
  },
  {
    name: 'shadowCmd: move_tank equal speeds advances shadow straight',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({
        type: 'move_tank', pair_id: 0, left_speed: 500, right_speed: 500, amount: 360, unit: 'degrees',
      }));
      assert.ok(sim.shadowRobot.y < 980, `y=${sim.shadowRobot.y}`);
      assert.ok(close(sim.shadowRobot.heading, -90, EPS), `h=${sim.shadowRobot.heading}`);
    },
  },
  {
    name: 'shadowCmd: move_tank unequal speeds turns shadow',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({
        type: 'move_tank', pair_id: 0, left_speed: 1000, right_speed: 0, amount: 360, unit: 'degrees',
      }));
      assert.ok(sim.shadowRobot.heading > -90, `heading should increase (right turn), got ${sim.shadowRobot.heading}`);
    },
  },
  {
    name: 'shadowCmd: stop is a no-op for shadow position',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({ type: 'stop', pair_id: 0 }));
      assert.strictEqual(sim.shadowRobot.x, 350);
      assert.strictEqual(sim.shadowRobot.y, 980);
      assert.strictEqual(sim.shadowRobot.heading, -90);
    },
  },
  {
    name: 'shadowCmd: motor_degrees with paired port changes shadow heading',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({ type: 'pair', pair_id: 0, left: 'A', right: 'B' }));
      sim.shadowCmd(JSON.stringify({ type: 'motor_degrees', port: 'A', degrees: 360, velocity: 500 }));
      // Left motor only → turning; heading should deviate from -90
      assert.ok(sim.shadowRobot.heading !== -90, `heading unchanged at ${sim.shadowRobot.heading}`);
    },
  },
  {
    name: 'shadowCmd: motor_degrees with no pair → no shadow position change',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowCmd(JSON.stringify({ type: 'motor_degrees', port: 'C', degrees: 360, velocity: 500 }));
      assert.strictEqual(sim.shadowRobot.x, 350);
      assert.strictEqual(sim.shadowRobot.y, 980);
    },
  },
  {
    name: 'shadowCmd: two cumulative moves go further than one',
    fn(createSim, assert) {
      const cmd = JSON.stringify({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees',
      });

      const singleSim = createSim();
      singleSim.shadowCmd(cmd);
      const yAfterOne = singleSim.shadowRobot.y;

      const doubleSim = createSim();
      doubleSim.shadowCmd(cmd);
      doubleSim.shadowCmd(cmd);
      assert.ok(doubleSim.shadowRobot.y < yAfterOne,
        `two moves (y=${doubleSim.shadowRobot.y}) should be further than one (y=${yAfterOne})`);
    },
  },
];
