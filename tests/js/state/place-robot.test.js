'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('placeRobot: updates x, y, heading', async () => {
  const sim = createSim();
  await sim.placeRobot(1000, 500, 45);
  assert.strictEqual(sim.robot.x,       1000);
  assert.strictEqual(sim.robot.y,       500);
  assert.strictEqual(sim.robot.heading, 45);
});

test('placeRobot: retains current heading when omitted', async () => {
  const sim = createSim();
  sim.robot.heading = 180;
  await sim.placeRobot(200, 200);
  assert.strictEqual(sim.robot.heading, 180);
});

test('placeRobot: resets _yawZeroHeading_deg so yaw reads zero at the new pose', async () => {
  const sim = createSim();
  await sim.placeRobot(500, 500, 0);
  assert.strictEqual(sim._yawZeroHeading_deg, 0);
  assert.strictEqual(sim._yawDeciDeg(), 0);
});

test('placeRobot: clears trail to a single point at the new pose', async () => {
  const sim = createSim();
  sim.trail.push({ x: 999, y: 999 });
  sim.trail.push({ x: 888, y: 888 });
  await sim.placeRobot(400, 400, 90);
  assert.strictEqual(sim.trail.length, 1);
  assert.strictEqual(sim.trail[0].x, 400);
  assert.strictEqual(sim.trail[0].y, 400);
});

test('placeRobot: returns false and leaves pose untouched while running', async () => {
  const sim = createSim();
  sim.isRunning = true;
  const result = await sim.placeRobot(1234, 567, 0);
  assert.strictEqual(result, false);
  assert.strictEqual(sim.robot.x, 350);
  assert.strictEqual(sim.robot.y, 163);
  assert.strictEqual(sim.robot.heading, 90);
});

test('placeRobot: refreshes colorValue based on the new sensor position', async () => {
  // Position the robot so the (currently-mounted-rear) sensor lands on the
  // y=463 horizontal black line: robot center y = 463 + 88 = 551 (north heading).
  const sim = createSim();
  await sim.placeRobot(350, 551, 90);
  assert.strictEqual(sim.robot.sensors.colorValue, 'black');
});

test('placeRobot: colorValue reverts to "none" over bare mat', async () => {
  const sim = createSim();
  await sim.placeRobot(350, 700, 90);
  assert.strictEqual(sim.robot.sensors.colorValue, 'none');
});

test('_pointInRobot: returns true for the robot center', () => {
  const sim = createSim();
  // Robot at spawn (350, 163) heading 90°, body 200×160.
  assert.strictEqual(sim._pointInRobot(350, 163), true);
});

test('_pointInRobot: returns true at body-local corners', () => {
  const sim = createSim();
  // Heading 90° means forward is +y in world frame; body forward extends ±100,
  // lateral extends ±80. Just inside the corner:
  assert.strictEqual(sim._pointInRobot(350 + 79, 163 + 99), true);
});

test('_pointInRobot: returns false well outside the footprint', () => {
  const sim = createSim();
  assert.strictEqual(sim._pointInRobot(1000, 1000), false);
});

test('_pointInRobot: respects heading rotation', () => {
  const sim = createSim();
  sim.robot.heading = 0;  // forward = +x
  // 99 mm east of center should be inside (forward extent 100).
  assert.strictEqual(sim._pointInRobot(449, 163), true);
  // 99 mm north should be inside the lateral extent (80) — actually outside.
  assert.strictEqual(sim._pointInRobot(350, 262), false);
});
