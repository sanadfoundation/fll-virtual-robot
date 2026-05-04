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

    # ── Color sensor ────────────────────────────────────────────
    def test_color_sensor_color_on_motor_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.color_sensor.color('A')
        self.assertIn('port A has no color sensor', str(cx.exception))
        self.assertIn('configured: motor', str(cx.exception))

    def test_color_sensor_reflection_on_distance_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.color_sensor.reflection('F')

    def test_color_sensor_rgbi_on_empty_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.color_sensor.rgbi('C')

    def test_color_sensor_color_on_color_port_succeeds(self):
        sb._state['color'] = 'red'
        self.assertEqual(sb.color_sensor.color('E'), 9)  # red == 9 in _COLOR_INT_MAP

    # ── Distance sensor ─────────────────────────────────────────
    def test_distance_sensor_distance_on_color_port_raises(self):
        with self.assertRaises(RuntimeError) as cx:
            sb.distance_sensor.distance('E')
        self.assertIn('configured: color_sensor', str(cx.exception))

    def test_distance_sensor_distance_on_motor_port_raises(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.distance('B')

    def test_distance_sensor_distance_on_distance_port_succeeds(self):
        sb._state['distance_mm'] = 250
        self.assertEqual(sb.distance_sensor.distance('F'), 250)

    def test_distance_sensor_get_pixel_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.get_pixel('A', 0, 0)

    def test_distance_sensor_set_pixel_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.set_pixel('E', 0, 0, 50)

    def test_distance_sensor_show_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.show('C', [0]*16)

    def test_distance_sensor_clear_validates(self):
        with self.assertRaises(RuntimeError):
            sb.distance_sensor.clear('A')

    # ── Force sensor (no force sensor in default config) ────────
    def test_force_sensor_force_always_raises(self):
        for p in ('A', 'B', 'C', 'D', 'E', 'F'):
            with self.assertRaises(RuntimeError):
                sb.force_sensor.force(p)

    def test_force_sensor_pressed_always_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_force_sensor_raw_always_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('B')


if __name__ == '__main__':
    unittest.main()
