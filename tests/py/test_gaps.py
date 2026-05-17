"""Tests for Spike API surface previously uncovered: motor duty cycle and reset,
motor_pair.unpair, color_sensor.{reflection,rgbi}, force_sensor (always raises
because no port is configured force_sensor by default), hub.button,
hub.motion_sensor expansion, runloop.{sleep_ms, until}.
"""
import unittest
import mock_js
import spike_bridge as sb


# ── motor: reset_relative_position, get/set_duty_cycle ──────────────────────

class TestMotorDutyCycleAndReset(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_reset_relative_position_default(self):
        # No bridge command issued; method returns a no-op awaitable.
        result = sb.motor.reset_relative_position('A')
        self.assertEqual(mock_js.bridge_mock.all(), [])
        self.assertIsNotNone(result)

    def test_reset_relative_position_with_value(self):
        sb.motor.reset_relative_position('B', 90)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_reset_relative_position_validates_port(self):
        with self.assertRaises(RuntimeError) as ctx:
            sb.motor.reset_relative_position('E')  # E is color_sensor
        self.assertIn('port E has no motor', str(ctx.exception))

    def test_get_duty_cycle_returns_int(self):
        result = sb.motor.get_duty_cycle('A')
        self.assertIsInstance(result, int)
        self.assertEqual(result, 0)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_get_duty_cycle_validates_port(self):
        with self.assertRaises(RuntimeError):
            sb.motor.get_duty_cycle('E')

    def test_set_duty_cycle_no_command(self):
        result = sb.motor.set_duty_cycle('A', 50)
        self.assertEqual(mock_js.bridge_mock.all(), [])
        self.assertIsNotNone(result)

    def test_set_duty_cycle_validates_port(self):
        with self.assertRaises(RuntimeError):
            sb.motor.set_duty_cycle('F', 50)  # F is distance_sensor


# ── motor_pair: unpair ──────────────────────────────────────────────────────

class TestMotorPairUnpair(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_unpair_no_command(self):
        # unpair is a no-op awaitable; nothing should hit the bridge.
        result = sb.motor_pair.unpair(0)
        self.assertEqual(mock_js.bridge_mock.all(), [])
        self.assertIsNotNone(result)

    def test_unpair_after_pair_does_not_clear_bridge_history(self):
        sb.motor_pair.pair(0, 'A', 'B')
        sb.motor_pair.unpair(0)
        cmds = mock_js.bridge_mock.all()
        # Only the pair command is sent — unpair is local-only.
        self.assertEqual(len(cmds), 1)
        self.assertEqual(cmds[0]['type'], 'pair')


# ── color_sensor: reflection, rgbi ──────────────────────────────────────────

class TestColorSensorReflection(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_reflection_default(self):
        # No 'reflection' key in default _state → falls back to 50.
        result = sb.color_sensor.reflection('E')
        self.assertEqual(result, 50)
        self.assertIsInstance(result, int)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_reflection_reads_state(self):
        sb._state['reflection'] = 75
        try:
            self.assertEqual(sb.color_sensor.reflection('E'), 75)
        finally:
            del sb._state['reflection']

    def test_reflection_validates_port(self):
        with self.assertRaises(RuntimeError) as ctx:
            sb.color_sensor.reflection('A')  # A is motor
        self.assertIn('port A has no color sensor', str(ctx.exception))


class TestColorSensorRGBI(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_rgbi_default(self):
        result = sb.color_sensor.rgbi('E')
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 4)
        # Default RGB falls back to 128,128,128; intensity is 0.
        self.assertEqual(result, (128, 128, 128, 0))

    def test_rgbi_reads_state(self):
        sb._state['rgb'] = [200, 100, 50]
        try:
            r, g, b, i = sb.color_sensor.rgbi('E')
            self.assertEqual((r, g, b), (200, 100, 50))
        finally:
            del sb._state['rgb']

    def test_rgbi_validates_port(self):
        with self.assertRaises(RuntimeError):
            sb.color_sensor.rgbi('F')  # F is distance_sensor


# ── force_sensor: every method raises because no port is configured ────────

class TestForceSensor(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_force_raises_on_motor_port(self):
        with self.assertRaises(RuntimeError) as ctx:
            sb.force_sensor.force('A')
        self.assertIn('port A has no force sensor', str(ctx.exception))

    def test_force_raises_on_empty_port(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.force('D')

    def test_pressed_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_raw_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('A')


# ── hub.button: pressed ─────────────────────────────────────────────────────

class TestHubButton(unittest.TestCase):

    def test_pressed_left_returns_zero(self):
        self.assertEqual(sb.hub.button.pressed(sb.hub.button.LEFT), 0)

    def test_pressed_right_returns_zero(self):
        self.assertEqual(sb.hub.button.pressed(sb.hub.button.RIGHT), 0)

    def test_pressed_returns_int_type(self):
        self.assertIsInstance(sb.hub.button.pressed(sb.hub.button.LEFT), int)


# ── hub.motion_sensor expansion ─────────────────────────────────────────────

class TestMotionSensorExpansion(unittest.TestCase):

    def test_angular_velocity_returns_3tuple(self):
        result = sb.hub.motion_sensor.angular_velocity()
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 3)

    def test_acceleration_returns_3tuple_with_g(self):
        # Default returns (0, 0, 981) — ~1g downward.
        result = sb.hub.motion_sensor.acceleration()
        self.assertEqual(len(result), 3)
        self.assertEqual(result[2], 981)

    def test_quaternion_returns_4tuple(self):
        result = sb.hub.motion_sensor.quaternion()
        self.assertEqual(len(result), 4)
        # Identity quaternion: (1, 0, 0, 0).
        self.assertEqual(result, (1.0, 0.0, 0.0, 0.0))

    def test_gesture_returns_unknown(self):
        self.assertEqual(sb.hub.motion_sensor.gesture(),
                         sb.hub.motion_sensor.UNKNOWN)

    def test_stable_returns_true(self):
        self.assertTrue(sb.hub.motion_sensor.stable())

    def test_up_face_returns_top(self):
        self.assertEqual(sb.hub.motion_sensor.up_face(),
                         sb.hub.motion_sensor.TOP)

    def test_tap_count_returns_zero(self):
        self.assertEqual(sb.hub.motion_sensor.tap_count(), 0)

    def test_reset_tap_count_no_error(self):
        sb.hub.motion_sensor.reset_tap_count()  # just shouldn't throw

    def test_get_yaw_face_returns_top(self):
        self.assertEqual(sb.hub.motion_sensor.get_yaw_face(),
                         sb.hub.motion_sensor.TOP)

    def test_set_yaw_face_returns_true(self):
        self.assertTrue(sb.hub.motion_sensor.set_yaw_face(
            sb.hub.motion_sensor.FRONT))

    def test_motion_sensor_constants(self):
        ms = sb.hub.motion_sensor
        self.assertEqual(ms.TOP,    0)
        self.assertEqual(ms.FRONT,  1)
        self.assertEqual(ms.RIGHT,  2)
        self.assertEqual(ms.BOTTOM, 3)
        self.assertEqual(ms.BACK,   4)
        self.assertEqual(ms.LEFT,   5)
        self.assertEqual(ms.UNKNOWN, -1)


# ── runloop: sleep_ms, until ────────────────────────────────────────────────

class TestRunloopSleep(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_sleep_ms_emits_wait_command(self):
        sb.runloop.sleep_ms(250)
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'wait', 'ms': 250}])

    def test_sleep_ms_converts_to_int(self):
        sb.runloop.sleep_ms(100.7)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['ms'], 100)
        self.assertIsInstance(cmd['ms'], int)

    def test_until_no_command(self):
        # until() is a no-op stub today (BACKLOG flags it as a known gap).
        # Tests pin the current behavior so any future implementation surfaces.
        sb.runloop.until(lambda: True, timeout=100)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_until_returns_awaitable(self):
        result = sb.runloop.until(lambda: False)
        self.assertIsNotNone(result)


# ── light_matrix: show, get_pixel, get_orientation, set_orientation ────────

class TestLightMatrixExtras(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_show_emits_hub_image(self):
        # Note: BACKLOG flags this as wrong (always renders 'CUSTOM' regardless
        # of pixel input). Test pins the current behavior so a future fix surfaces.
        sb.hub.light_matrix.show([0]*25)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],  'hub_image')
        self.assertEqual(cmd['image'], 'CUSTOM')

    def test_get_pixel_returns_zero(self):
        self.assertEqual(sb.hub.light_matrix.get_pixel(0, 0), 0)
        self.assertEqual(sb.hub.light_matrix.get_pixel(4, 4), 0)

    def test_get_orientation_returns_zero(self):
        self.assertEqual(sb.hub.light_matrix.get_orientation(), 0)

    def test_set_orientation_returns_zero(self):
        self.assertEqual(sb.hub.light_matrix.set_orientation(0), 0)


# ── speaker: stop, volume ───────────────────────────────────────────────────

class TestSpeakerExtras(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_stop_no_command(self):
        result = sb.hub.speaker.stop()
        self.assertEqual(mock_js.bridge_mock.all(), [])
        self.assertIsNotNone(result)

    def test_volume_no_command(self):
        result = sb.hub.speaker.volume(50)
        self.assertEqual(mock_js.bridge_mock.all(), [])
        self.assertIsNotNone(result)


# ── Audit-tracked bugs: expectedFailure pins the LEGO-documented behaviour ──
#
# Each test below asserts the behaviour the LEGO docs *promise*. They are
# marked @unittest.expectedFailure because the current implementation is
# broken. When the underlying bug is fixed, the assertion will start passing
# and the @expectedFailure decorator will turn the test red — at which point
# the decorator should be removed.
#
# This is the inverse posture from a stub-pin: a stub-pin enforces the bug
# (test goes red when behaviour is fixed); an expectedFailure documents the
# gap (test goes red when behaviour stays broken after the docs change).
#
# References point to docs/audits/2026-05-13-test-coverage-fidelity.md §X.

class TestKnownBugsTracked(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    # Audit §4.4 — color_sensor.rgbi always returns (128,128,128,0).
    # Bridge falls back to constructor defaults because _sensorState() never
    # emits an 'rgb' key (reflection got wired up post-audit; rgbi didn't).
    @unittest.expectedFailure
    def test_rgbi_reflects_sensor_state(self):
        # Per LEGO docs: rgbi() returns the observed (R, G, B, intensity).
        # Today: always (128, 128, 128, 0) regardless of what colour the
        # sensor is over.
        sb._state['rgb'] = [255, 0, 0]  # red light
        try:
            r, g, b, _i = sb.color_sensor.rgbi('E')
            # If _sensorState ever populates rgb correctly, this passes.
            # Today the bridge ignores _state['rgb'] for accessor reads.
            self.assertEqual((r, g, b), (255, 0, 0))
        finally:
            del sb._state['rgb']
        # Force an explicit failure today: the actual behaviour is the
        # default tuple, regardless of what we put in _state.
        self.assertNotEqual(sb.color_sensor.rgbi('E'), (128, 128, 128, 0),
                            'rgbi still returning hardcoded default')

    # Audit §4.5 — runloop.until(predicate, timeout) never polls predicate.
    # The bridge returns _NoopAwaitable; the predicate is unreachable.
    @unittest.expectedFailure
    def test_runloop_until_polls_predicate(self):
        # Per LEGO docs: runloop.until(pred, timeout) awaits until pred()
        # returns truthy (or the timeout elapses).
        # Today: returns _NoopAwaitable; pred is never called.
        counter = [0]

        def pred():
            counter[0] += 1
            return counter[0] >= 3

        # Drive the awaitable through asyncio. If until actually polls,
        # counter[0] reaches >= 3 before completion. Today it stays 0.
        try:
            import asyncio
        except ImportError:
            import uasyncio as asyncio
        asyncio.run(sb.runloop.until(pred, timeout=1000))
        self.assertGreaterEqual(counter[0], 3,
                                'runloop.until never polled the predicate')

    # Audit §4.6 — acceleration / deceleration / stop kwargs accepted at the
    # Python signature but dropped before reaching the JS payload. Sim runs
    # constant-velocity with the default brake stop regardless.
    @unittest.expectedFailure
    def test_acceleration_kwarg_reaches_bridge(self):
        # Per LEGO docs: motor.run_for_degrees(..., acceleration=A, deceleration=D)
        # should produce a trapezoidal profile. The first step toward that is
        # the payload carrying the kwargs.
        sb.motor.run_for_degrees('A', 360, velocity=500, acceleration=2000)
        cmd = mock_js.bridge_mock.all()[0]
        # Today: cmd has no 'acceleration' key — it was accepted then dropped.
        self.assertIn('acceleration', cmd)
        self.assertEqual(cmd['acceleration'], 2000)

    # Audit 2026-05-17 follow-up §3.4 — hub.light_matrix.show(pixels) sends
    # 'CUSTOM' regardless of the pixel array. The pixels are discarded before
    # ever reaching the bridge payload.
    @unittest.expectedFailure
    def test_show_pixels_reaches_bridge(self):
        # Per LEGO docs: show(pixels) renders the 25-pixel brightness array.
        # The first step toward that is the payload carrying the pixels.
        sb.hub.light_matrix.show([100] * 25)
        cmd = mock_js.bridge_mock.all()[0]
        # Today: cmd['image'] == 'CUSTOM' and the actual pixels never appear.
        self.assertIn('pixels', cmd)
        self.assertEqual(cmd['pixels'], [100] * 25)

    # Audit 2026-05-17 follow-up §3.4 — get_pixel always returns 0. Per LEGO
    # docs it should return the current brightness at (x, y).
    @unittest.expectedFailure
    def test_get_pixel_reads_current_brightness(self):
        # Light pixel (2, 2) at 50%, then read it back.
        sb.hub.light_matrix.set_pixel(2, 2, intensity=50)
        # Today the accessor doesn't read sim state — it hardcodes 0.
        self.assertEqual(sb.hub.light_matrix.get_pixel(2, 2), 50)

    # Audit 2026-05-17 follow-up §3.4 — get_orientation / set_orientation are
    # stubs. set_orientation accepts any int but never affects display rotation;
    # get_orientation always returns 0.
    @unittest.expectedFailure
    def test_orientation_round_trips(self):
        # Per LEGO docs: set_orientation(2) rotates the display; get_orientation
        # returns the current rotation.
        sb.hub.light_matrix.set_orientation(2)
        self.assertEqual(sb.hub.light_matrix.get_orientation(), 2)

    # Audit 2026-05-17 follow-up §3.4 — hub.speaker.volume() emits no command.
    # In real Spike this should set the speaker volume and the sim should
    # honor it for subsequent beep() / play_sound() calls.
    @unittest.expectedFailure
    def test_speaker_volume_emits_command(self):
        sb.hub.speaker.volume(75)
        cmds = mock_js.bridge_mock.all()
        # Today: no command emitted. Future: a 'set_volume' (or similar) payload.
        self.assertGreater(len(cmds), 0,
                           'hub.speaker.volume(75) should emit a bridge command')

    # Audit 2026-05-17 follow-up §3.5 — hub.speaker.stop() emits no command.
    # Should stop in-flight playback.
    @unittest.expectedFailure
    def test_speaker_stop_emits_command(self):
        sb.hub.speaker.stop()
        cmds = mock_js.bridge_mock.all()
        self.assertGreater(len(cmds), 0,
                           'hub.speaker.stop() should emit a bridge command')
