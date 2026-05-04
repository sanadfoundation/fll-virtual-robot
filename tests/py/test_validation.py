"""Tests for port configuration validation."""
import unittest
import mock_js
import spike_bridge as sb


class TestPortConfig(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_port_config_default(self):
        self.assertEqual(sb._PORT_CONFIG['A'], 'motor')
        self.assertEqual(sb._PORT_CONFIG['B'], 'motor')
        self.assertEqual(sb._PORT_CONFIG['C'], 'empty')
        self.assertEqual(sb._PORT_CONFIG['D'], 'empty')
        self.assertEqual(sb._PORT_CONFIG['E'], 'color_sensor')
        self.assertEqual(sb._PORT_CONFIG['F'], 'distance_sensor')

    def test_require_passes_for_matching_kind(self):
        self.assertEqual(sb._require('A', 'motor', 'motor.run'), 'A')
        self.assertEqual(sb._require(sb.port.E, 'color_sensor', 'color_sensor.color'), 'E')

    def test_require_raises_for_empty_port(self):
        with self.assertRaises(RuntimeError) as cx:
            sb._require('C', 'motor', 'motor.run')
        self.assertIn('port C has no motor', str(cx.exception))
        self.assertIn('configured: empty', str(cx.exception))

    def test_require_raises_for_wrong_kind(self):
        with self.assertRaises(RuntimeError) as cx:
            sb._require('F', 'color_sensor', 'color_sensor.color')
        self.assertIn('port F has no color sensor', str(cx.exception))
        self.assertIn('configured: distance_sensor', str(cx.exception))

    def test_require_accepts_int_port(self):
        # port.A = 0
        self.assertEqual(sb._require(0, 'motor', 'motor.run'), 'A')
        # port.E = 4
        with self.assertRaises(RuntimeError):
            sb._require(4, 'motor', 'motor.run')

    def test_motor_run_for_degrees_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor.run_for_degrees('C', 360)
        self.assertIn('port C has no motor', str(cx.exception))

    def test_motor_run_on_sensor_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor.run('E', velocity=500)
        self.assertIn('port E has no motor', str(cx.exception))
        self.assertIn('configured: color_sensor', str(cx.exception))

    def test_motor_stop_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.stop('D')

    def test_motor_run_for_time_on_distance_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.motor.run_for_time('F', 1000)
        self.assertIn('configured: distance_sensor', str(cx.exception))

    def test_motor_run_to_absolute_position_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.run_to_absolute_position('C', 90)

    def test_motor_run_to_relative_position_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.run_to_relative_position('E', 90)

    def test_motor_absolute_position_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.absolute_position('C')

    def test_motor_relative_position_on_sensor_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.relative_position('E')

    def test_motor_velocity_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.motor.velocity('D')

    def test_motor_reset_relative_position_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.reset_relative_position('F', 0)

    def test_motor_set_duty_cycle_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.set_duty_cycle('C', 50)

    def test_motor_get_duty_cycle_validates(self):
        with self.assertRaises(RuntimeError):
            sb.motor.get_duty_cycle('E')

    def test_motor_run_on_motor_port_succeeds(self):
        # Sanity check: valid calls still work.
        sb.motor.run_for_degrees('A', 360)
        sb.motor.run_for_degrees('B', 180)
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)


if __name__ == '__main__':
    unittest.main()
