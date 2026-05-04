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


if __name__ == '__main__':
    unittest.main()
