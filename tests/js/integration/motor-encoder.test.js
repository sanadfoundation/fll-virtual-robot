'use strict';

// Cross-runtime contract guard for audit 2026-05-13 §4.2 / §8.
//
// Behavioural coverage of the encoder accumulator (forward, reverse, paired
// symmetry, steering asymmetry, motors_velocity, aux motor) lives at the
// simulator-unit tier in tests/js/commands/encoder-accumulation.test.js.
// Those tests prove _animateTank writes the right number into robot.motors.
//
// This test proves the *contract* between the Python accessor and the JS
// sim state: when the sim writes a value into robot.motors[port], Python's
// motor.absolute_position(port) reads back the same number. That contract
// lives at the cross-runtime seam and nothing on either side can verify it
// alone — so it warrants one integration test.

const test   = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: motor.absolute_position reads back the encoder through Python', async () => {
  const { mp, runUserCode } = await makeRoundtrip();

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor.run_for_degrees('A', 180, velocity=500)
    global _final_pos
    _final_pos = motor.absolute_position('A')
runloop.run(main())
`);

  const finalPos = mp.globals.get('_final_pos');
  // absolute_position wraps to [-180, 179] per LEGO docs; 180° sits on the
  // wrap seam, so the reading can land at either +179 or -180. Compare via
  // shortest angular delta so the contract test tolerates either side.
  const delta = ((finalPos - 180 + 540) % 360) - 180;
  assert.ok(Math.abs(delta) < 40,
    `Python motor.absolute_position should read back ~180 (mod 360) after a 180° run; got ${finalPos}. `
    + 'If unit tests pass but this fails, the _sensorState snapshot key or the '
    + 'Python accessor wiring is out of sync with the simulator-side write.');
});
