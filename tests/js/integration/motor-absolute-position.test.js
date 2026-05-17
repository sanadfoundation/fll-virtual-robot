'use strict';

// Round-trip regressions for audit 2026-05-13 §4.2 / BACKLOG 'run_to_*':
//   motor.run_to_absolute_position(port, target)
//     should rotate to absolute encoder position `target`, not by `target`
//     degrees.
//   motor.run_to_relative_position(port, target)
//     should rotate to relative position `target` measured from the last
//     reset_relative_position anchor.
//   motor.reset_relative_position(port, value=0)
//     should set the relative anchor so relative_position(port) == value
//     immediately afterward.

const test = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: run_to_absolute_position(90) lands at absolute 90', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  await runUserCode(`
async def main():
    global _pos
    await motor_pair.pair(0, port.A, port.B)
    await motor.run_to_absolute_position('A', 90, velocity=500)
    _pos = motor.absolute_position('A')
runloop.run(main())
`);
  const pos = mp.globals.get('_pos');
  assert.ok(Math.abs(pos - 90) < 30,
    `expected absolute_position ~90, got ${pos}`);
});

test('round-trip: run_to_absolute_position twice — net rotation is "to" not "by"', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  await runUserCode(`
async def main():
    global _pos
    await motor_pair.pair(0, port.A, port.B)
    await motor.run_to_absolute_position('A', 90, velocity=500)
    await motor.run_to_absolute_position('A', 180, velocity=500)
    _pos = motor.absolute_position('A')
runloop.run(main())
`);
  // If treated as "rotate BY position degrees" (old bug):
  //   90 + 180 = 270 total ≠ 180.
  // If treated as "rotate TO position" (fix):
  //   90 then add only 90 more = 180 total ✓.
  const pos = mp.globals.get('_pos');
  assert.ok(Math.abs(pos - 180) < 30,
    `expected absolute_position ~180, got ${pos} (if ~270, old "by-not-to" bug regressed)`);
});

test('round-trip: reset_relative_position(0) zeroes the relative counter', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  await runUserCode(`
async def main():
    global _rel_after_run, _rel_after_reset, _abs_after_reset
    await motor_pair.pair(0, port.A, port.B)
    await motor.run_for_degrees('A', 180, velocity=500)
    _rel_after_run    = motor.relative_position('A')
    motor.reset_relative_position('A', 0)
    _rel_after_reset  = motor.relative_position('A')
    _abs_after_reset  = motor.absolute_position('A')
runloop.run(main())
`);
  const relAfterRun   = mp.globals.get('_rel_after_run');
  const relAfterReset = mp.globals.get('_rel_after_reset');
  const absAfterReset = mp.globals.get('_abs_after_reset');
  assert.ok(Math.abs(relAfterRun - 180) < 30,
    `relative_position should equal ~180 after a 180° run; got ${relAfterRun}`);
  assert.strictEqual(relAfterReset, 0,
    `relative_position should be 0 after reset_relative_position(A, 0); got ${relAfterReset}`);
  assert.ok(Math.abs(absAfterReset - 180) < 30,
    `absolute_position must NOT be affected by reset_relative_position; got ${absAfterReset}`);
});

test('round-trip: run_to_relative_position uses the reset anchor', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  await runUserCode(`
async def main():
    global _rel, _abs
    await motor_pair.pair(0, port.A, port.B)
    # Pre-rotate, then anchor here.
    await motor.run_for_degrees('A', 360, velocity=500)
    motor.reset_relative_position('A', 0)
    # Now run-to-relative 90: should rotate +90 from current absolute.
    await motor.run_to_relative_position('A', 90, velocity=500)
    _rel = motor.relative_position('A')
    _abs = motor.absolute_position('A')
runloop.run(main())
`);
  const rel = mp.globals.get('_rel');
  const abs = mp.globals.get('_abs');
  assert.ok(Math.abs(rel - 90) < 30,
    `relative_position should be ~90 after run_to_relative_position(A, 90); got ${rel}`);
  // Absolute: 360 (from first run) + 90 (from run-to-relative 90 since anchor) = ~450.
  assert.ok(Math.abs(abs - 450) < 40,
    `absolute_position should reflect the anchor + 90 = ~450; got ${abs}`);
});
