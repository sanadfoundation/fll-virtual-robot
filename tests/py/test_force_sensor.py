"""Tests for force_sensor: port E is configured force_sensor in the canonical
wiring; force()/pressed()/raw() read live values from _state; calls on F
(empty) raise."""
import unittest
import mock_js
import spike_bridge as sb


class TestForceSensorReads(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        # Reset force keys so tests don't leak into each other.
        for k in ('force_dn', 'force_pressed', 'force_raw'):
            sb._state.pop(k, None)

    def test_port_e_is_configured_force_sensor(self):
        self.assertEqual(sb._PORT_CONFIG['E'], 'force_sensor')

    def test_force_default_is_zero(self):
        self.assertEqual(sb.force_sensor.force('E'), 0)

    def test_force_returns_int_from_state(self):
        sb._state['force_dn'] = 42
        self.assertEqual(sb.force_sensor.force('E'), 42)
        self.assertIsInstance(sb.force_sensor.force('E'), int)

    def test_pressed_default_is_false(self):
        self.assertFalse(sb.force_sensor.pressed('E'))

    def test_pressed_reads_state(self):
        sb._state['force_pressed'] = True
        self.assertTrue(sb.force_sensor.pressed('E'))

    def test_raw_default_is_zero(self):
        self.assertEqual(sb.force_sensor.raw('E'), 0)

    def test_raw_returns_int_from_state(self):
        sb._state['force_raw'] = 2048
        self.assertEqual(sb.force_sensor.raw('E'), 2048)
        self.assertIsInstance(sb.force_sensor.raw('E'), int)

    def test_force_on_empty_port_f_raises(self):
        with self.assertRaises(RuntimeError) as cm:
            sb.force_sensor.force('F')
        self.assertIn('force sensor', str(cm.exception))

    def test_pressed_on_motor_port_a_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_raw_on_color_sensor_port_c_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('C')

    def test_int_port_constant_translates(self):
        # port.E = 4; bridge translates to letter 'E'.
        sb._state['force_dn'] = 10
        self.assertEqual(sb.force_sensor.force(sb.port.E), 10)


if __name__ == '__main__':
    unittest.main()
