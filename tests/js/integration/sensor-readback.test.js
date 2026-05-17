'use strict';

// Round-trip companions for the state-dict-ventriloquism tests in
// tests/py/test_force_sensor.py, test_motion_sensor.py, and
// test_motor_sensor_gaps.py.
//
// Those Python tests follow the pattern: seed sb._state['force_dn'] = X, then
// assert force_sensor.force('C') == X. That proves the bridge's accessor
// reads from _state, but NOT that the simulator ever populates _state with
// the right value. These round-trips close that gap by driving the simulator
// (or seeding the underlying sensor input that the simulator reads) and
// observing Python's value after the bridge's _state has been updated by a
// real sensor read.
//
// Audit 2026-05-17 re-evaluation §3.2.

const test = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

// ── Force sensor ────────────────────────────────────────────────────────────

test('round-trip: force_sensor.force reads back the sim-side force reading', async () => {
  const { sim, mp, runUserCode } = await makeRoundtrip();
  // Seed the simulator's force input directly. _sensorState() will derive
  // force_dn / force_pressed / force_raw via forceSensorLogic and emit them
  // in the snapshot the bridge reads.
  sim.robot.sensors.forceN = 5;  // 5 N

  await runUserCode(`
async def main():
    global _f, _p, _r
    # Issue a no-op bridge call so _state syncs from the sim snapshot.
    await runloop.sleep_ms(0)
    _f = force_sensor.force('C')
    _p = force_sensor.pressed('C')
    _r = force_sensor.raw('C')
runloop.run(main())
`);

  const f = mp.globals.get('_f');
  const p = mp.globals.get('_p');
  const r = mp.globals.get('_r');
  assert.ok(f > 0, `force should be > 0 at 5 N input; got ${f}`);
  assert.strictEqual(p, true, `pressed should be true at 5 N; got ${p}`);
  assert.ok(r > 0, `raw should be > 0 at 5 N; got ${r}`);
});

test('round-trip: force_sensor.pressed false at zero force', async () => {
  const { sim, mp, runUserCode } = await makeRoundtrip();
  sim.robot.sensors.forceN = 0;
  await runUserCode(`
async def main():
    global _p
    await runloop.sleep_ms(0)
    _p = force_sensor.pressed('C')
runloop.run(main())
`);
  assert.strictEqual(mp.globals.get('_p'), false);
});

// ── Motion sensor (yaw — pitch/roll are tracked separately) ────────────────

test('round-trip: tilt_angles yaw reflects sim heading rotation', async () => {
  const { sim, mp, runUserCode } = await makeRoundtrip();
  // Spawn heading is 90° (north). Rotate the robot CW by driving steering.
  await runUserCode(`
async def main():
    global _yaw_before, _yaw_after
    await runloop.sleep_ms(0)
    _yaw_before = hub.motion_sensor.tilt_angles()[0]
    await motor_pair.pair(0, port.A, port.B)
    await motor_pair.move(0, 50, velocity=500)
    _yaw_after = hub.motion_sensor.tilt_angles()[0]
runloop.run(main())
`);
  const before = mp.globals.get('_yaw_before');
  const after  = mp.globals.get('_yaw_after');
  assert.notStrictEqual(before, after,
    'tilt_angles[0] (yaw) should change after the robot rotates');
});

// ── Motor velocity (commanded reflection — bridge-side, but worth verifying
// the seam holds) ────────────────────────────────────────────────────────────

test('round-trip: motor.velocity reflects last commanded velocity after motor.run', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  await runUserCode(`
async def main():
    global _v_before, _v_after
    _v_before = motor.velocity('A')
    await motor.run('A', 500)
    _v_after = motor.velocity('A')
runloop.run(main())
`);
  // Bridge-side tracking: _motor_velocities updated when run/run_for_* is called.
  // Before: 0 (no command issued). After run(): 500.
  assert.strictEqual(mp.globals.get('_v_before'), 0);
  assert.strictEqual(mp.globals.get('_v_after'),  500);
});

test('round-trip: motor.velocity returns 0 after motor.stop', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  await runUserCode(`
async def main():
    global _v
    await motor.run('A', 500)
    motor.stop('A')
    _v = motor.velocity('A')
runloop.run(main())
`);
  assert.strictEqual(mp.globals.get('_v'), 0,
    'motor.velocity should return 0 after motor.stop');
});
