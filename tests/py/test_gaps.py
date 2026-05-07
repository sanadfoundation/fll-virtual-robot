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
            sb.force_sensor.force('C')

    def test_pressed_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_raw_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('A')


# ── hub.button: pressed, was_pressed ────────────────────────────────────────

class TestHubButton(unittest.TestCase):

    def test_pressed_left_returns_zero(self):
        self.assertEqual(sb.hub.button.pressed(sb.hub.button.LEFT), 0)

    def test_pressed_right_returns_zero(self):
        self.assertEqual(sb.hub.button.pressed(sb.hub.button.RIGHT), 0)

    def test_pressed_returns_int_type(self):
        self.assertIsInstance(sb.hub.button.pressed(sb.hub.button.LEFT), int)

    def test_was_pressed_returns_false(self):
        self.assertFalse(sb.hub.button.was_pressed(sb.hub.button.LEFT))
        self.assertFalse(sb.hub.button.was_pressed(sb.hub.button.RIGHT))


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
