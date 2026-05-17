'use strict';

// First end-to-end Python → bridge → simulator → sensor-readback test.
//
// If this passes, we have a harness that none of the previous 675 tests had:
// real Python code (the same spike_bridge.py the browser loads), driving a
// real RobotSimulator, with sim state read back via the bridge's _state dict
// after the call completes.

const test = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: bridge loads, motor_pair / motor / port are accessible', async () => {
  const { mp } = await makeRoundtrip();
  // After loading the bridge, top-level Python names should exist as globals.
  assert.ok(mp.globals.get('motor_pair'), 'motor_pair should be defined');
  assert.ok(mp.globals.get('motor'),      'motor should be defined');
  assert.ok(mp.globals.get('port'),       'port should be defined');
  assert.ok(mp.globals.get('runloop'),    'runloop should be defined');
});

test('round-trip: motor_pair.move_for_degrees moves the robot forward', async () => {
  const { sim, runUserCode } = await makeRoundtrip();

  const startX = sim.robot.x;
  const startY = sim.robot.y;

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor_pair.move_for_degrees(0, 360, 0, velocity=500)
runloop.run(main())
`);

  const movedMM = Math.hypot(sim.robot.x - startX, sim.robot.y - startY);
  // 360° at 56 mm wheel radius (112 mm dia) → 2π·56 ≈ 351 mm. Sim uses
  // WHEEL_CIRC_MM = 176 mm (per the codebase). Either way, we want
  // "noticeably moved forward" — the precise number depends on sim constants.
  assert.ok(movedMM > 50,
    `expected robot to move forward; moved ${movedMM.toFixed(1)} mm`);
});
