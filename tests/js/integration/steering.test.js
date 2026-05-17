'use strict';

// End-to-end regression for audit 2026-05-13 §4.1:
//   motor_pair.move(pair, steering, velocity=...)
// is supposed to apply steering for the whole continuous run. Prior to today
// the bridge sent steering correctly, the JS sim received steering correctly,
// and the sim's `'start'` case dropped it on the floor. No test in the suite
// caught it because every test stopped at one side of the boundary.
//
// This test fails if the bug regresses anywhere along the chain:
//   Python motor_pair.move → bridge payload → sim _execCmd 'start'
//   → _animateTank with leftV/rightV → kinematic integration → robot.heading

const test   = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: motor_pair.move with positive steering rotates the body CW', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  const startHeading = sim.robot.heading;

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    # Continuous start with right-turn steering. The sim's continuous-motion
    # cap (200 mm) terminates the call; we just need to observe rotation.
    await motor_pair.move(0, 50, velocity=500)
runloop.run(main())
`);

  // Math y-up convention: CW = heading decreases. Right steering = CW.
  assert.ok(sim.robot.heading < startHeading,
    `expected heading to decrease (CW); start=${startHeading}, end=${sim.robot.heading}`);
});

test('round-trip: motor_pair.move with zero steering keeps heading constant', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  const startHeading = sim.robot.heading;

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor_pair.move(0, 0, velocity=500)
runloop.run(main())
`);

  // Zero steering: both wheels equal, no rotation.
  assert.ok(Math.abs(sim.robot.heading - startHeading) < 0.5,
    `expected heading constant; start=${startHeading}, end=${sim.robot.heading}`);
});

test('round-trip: motor_pair.move with negative steering rotates the body CCW', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  const startHeading = sim.robot.heading;

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor_pair.move(0, -50, velocity=500)
runloop.run(main())
`);

  assert.ok(sim.robot.heading > startHeading,
    `expected heading to increase (CCW); start=${startHeading}, end=${sim.robot.heading}`);
});
