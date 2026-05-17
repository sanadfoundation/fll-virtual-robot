'use strict';

// End-to-end regression for audit 2026-05-13 §4.2:
//   motor.absolute_position(port)   and  motor.relative_position(port)
//   getMotorPosition(port)          and  getMotorSpeed(port)
//
// Before the fix: robot.motors[port] was never written by _animateTank, so all
// four read 0 forever. The Python suite had `isinstance(int)` tests (stub-pin)
// and the JS suite had `assert.strictEqual(getMotorPosition('A'), 0)` tests
// (stub-pin). Neither could fail when the bug was present, by construction.
//
// After the fix: a 360° run produces ~360° accumulated on the wheel's port.

const test   = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: motor.absolute_position accumulates after run_for_degrees', async () => {
  const { sim, mp, runUserCode } = await makeRoundtrip();

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor.run_for_degrees('A', 360, velocity=500)
runloop.run(main())
`);

  // Read via the JS accessor — it reflects the same robot.motors[port] the
  // bridge's _state.motors picks up.
  const pos = sim.getMotorPosition('A');
  assert.ok(Math.abs(pos - 360) < 40,
    `expected ~360° on port A after 360° run, got ${pos}`);
});

test('round-trip: motor.absolute_position reads back from Python after the move', async () => {
  const { runUserCode, mp } = await makeRoundtrip();

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor.run_for_degrees('A', 180, velocity=500)
    global _final_pos
    _final_pos = motor.absolute_position('A')
runloop.run(main())
`);

  const finalPos = mp.globals.get('_final_pos');
  assert.ok(Math.abs(finalPos - 180) < 40,
    `expected ~180° read back through Python, got ${finalPos}`);
});

test('round-trip: paired motors accumulate symmetrically on a forward move', async () => {
  const { sim, runUserCode } = await makeRoundtrip();

  await runUserCode(`
async def main():
    await motor_pair.pair(0, port.A, port.B)
    await motor_pair.move_for_degrees(0, 720, 0, velocity=500)
runloop.run(main())
`);

  const a = sim.getMotorPosition('A');
  const b = sim.getMotorPosition('B');
  assert.ok(Math.abs(a - 720) < 50, `A: expected ~720°, got ${a}`);
  assert.ok(Math.abs(b - 720) < 50, `B: expected ~720°, got ${b}`);
  assert.ok(Math.abs(a - b) < 10, `A and B should track symmetrically; diff=${a - b}`);
});
