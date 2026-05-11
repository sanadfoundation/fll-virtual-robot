"""Tests for hub.motion_sensor.tilt_angles and reset_yaw."""
import unittest
import mock_js
import spike_bridge as sb


class TestMotionSensor(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_tilt_angles_returns_yaw_pitch_roll_tuple(self):
        result = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(len(result), 3)

    def test_tilt_angles_yaw_reads_from_state(self):
        sb._state['yaw_dDeg'] = 450
        yaw, pitch, roll = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(yaw, 450)
        self.assertEqual(pitch, 0)
        self.assertEqual(roll, 0)

    def test_tilt_angles_yaw_negative(self):
        sb._state['yaw_dDeg'] = -300
        yaw, _, _ = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(yaw, -300)

    def test_reset_yaw_default_sends_zero(self):
        sb.hub.motion_sensor.reset_yaw()
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd, {'type': 'reset_yaw', 'angle_dDeg': 0})

    def test_reset_yaw_with_angle(self):
        sb.hub.motion_sensor.reset_yaw(90)
        cmd = mock_js.bridge_mock.last()
        # LEGO API takes degrees; bridge command carries decidegrees (90° → 900 dDeg).
        self.assertEqual(cmd, {'type': 'reset_yaw', 'angle_dDeg': 900})


if __name__ == '__main__':
    unittest.main()
