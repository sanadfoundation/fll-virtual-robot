'use strict';

// Cross-runtime contract guard for audit 2026-05-13 §4.1.
//
// Behavioural coverage (positive / negative / zero steering rotating the
// body the right way) lives at the simulator-unit tier in
// tests/js/commands/steering-behavior.test.js — they run in milliseconds
// against a kinematic physics stub. This file's job is narrower: prove that
// the same outcome reaches the simulator through the Python bridge that
// students actually use. One test is enough for that purpose.

const test   = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: motor_pair.move steering reaches sim through Python', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  const startHeading = sim.robot.heading;

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor_pair.move(0, 50, velocity=500)
runloop.run(main())
`);

  // Detailed direction/magnitude assertions live in the unit-tier test.
  // Here we only need: did the steering value travel intact across the
  // Python → bridge → sim seam? If yes, heading moved.
  assert.notStrictEqual(sim.robot.heading, startHeading,
    'Python motor_pair.move(0, 50) should rotate the body; '
    + 'if heading is unchanged the steering arg was dropped somewhere on the wire');
});
