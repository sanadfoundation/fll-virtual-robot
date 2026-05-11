"""Tests for force_sensor: port C is configured force_sensor in the canonical
wiring; force()/pressed()/raw() read live values from _state; calls on D
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

    def test_port_c_is_configured_force_sensor(self):
        self.assertEqual(sb._PORT_CONFIG['C'], 'force_sensor')

    def test_force_default_is_zero(self):
        self.assertEqual(sb.force_sensor.force('C'), 0)

    def test_force_returns_int_from_state(self):
        sb._state['force_dn'] = 42
        self.assertEqual(sb.force_sensor.force('C'), 42)
        self.assertIsInstance(sb.force_sensor.force('C'), int)

    def test_pressed_default_is_false(self):
        self.assertFalse(sb.force_sensor.pressed('C'))

    def test_pressed_reads_state(self):
        sb._state['force_pressed'] = True
        self.assertTrue(sb.force_sensor.pressed('C'))

    def test_raw_default_is_zero(self):
        self.assertEqual(sb.force_sensor.raw('C'), 0)

    def test_raw_returns_int_from_state(self):
        sb._state['force_raw'] = 2048
        self.assertEqual(sb.force_sensor.raw('C'), 2048)
        self.assertIsInstance(sb.force_sensor.raw('C'), int)

    def test_force_on_unconfigured_port_d_raises(self):
        with self.assertRaises(RuntimeError) as cm:
            sb.force_sensor.force('D')
        self.assertIn('force sensor', str(cm.exception))

    def test_pressed_on_motor_port_a_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.pressed('A')

    def test_raw_on_color_sensor_port_e_raises(self):
        with self.assertRaises(RuntimeError):
            sb.force_sensor.raw('E')

    def test_int_port_constant_translates(self):
        # port.C = 2; bridge translates to letter 'C'.
        sb._state['force_dn'] = 10
        self.assertEqual(sb.force_sensor.force(sb.port.C), 10)


if __name__ == '__main__':
    unittest.main()
