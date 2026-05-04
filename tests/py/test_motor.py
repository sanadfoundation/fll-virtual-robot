"""Tests for motor (single-port) command dict schemas."""
import unittest
import mock_js
import spike_bridge as sb


class TestMotorCommands(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_run_for_degrees(self):
        sb.motor.run_for_degrees('A', 360, velocity=500)
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'motor_degrees', 'port': 'A', 'degrees': 360, 'velocity': 500},
        ])

    def test_run_for_degrees_default_velocity(self):
        sb.motor.run_for_degrees('B', 180)
        self.assertEqual(mock_js.bridge_mock.all()[0]['velocity'], 360)

    def test_run_for_time(self):
        sb.motor.run_for_time('C', 1000, velocity=300)
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'motor_time', 'port': 'C', 'time_ms': 1000, 'velocity': 300},
        ])

    def test_run_for_time_default_velocity(self):
        sb.motor.run_for_time('D', 500)
        self.assertEqual(mock_js.bridge_mock.all()[0]['velocity'], 360)

    def test_run(self):
        sb.motor.run('E', velocity=750)
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'motor_run', 'port': 'E', 'velocity': 750},
        ])

    def test_stop(self):
        sb.motor.stop('A')
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'motor_stop', 'port': 'A'}])

    def test_run_to_absolute_position(self):
        sb.motor.run_to_absolute_position('F', 90, velocity=400)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],     'motor_degrees')
        self.assertEqual(cmd['port'],     'F')
        self.assertEqual(cmd['degrees'],  90)
        self.assertEqual(cmd['velocity'], 400)

    def test_run_to_relative_position(self):
        sb.motor.run_to_relative_position('B', -180, velocity=600)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],    'motor_degrees')
        self.assertEqual(cmd['degrees'], -180)

    def test_velocity_returns_int(self):
        result = sb.motor.velocity('A')
        self.assertIsInstance(result, int)

    def test_absolute_position_returns_int(self):
        result = sb.motor.absolute_position('A')
        self.assertIsInstance(result, int)

    def test_relative_position_returns_int(self):
        result = sb.motor.relative_position('B')
        self.assertIsInstance(result, int)

    def test_reset_relative_position_no_command(self):
        sb.motor.reset_relative_position('A', 0)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_port_object_converted_to_str(self):
        sb.motor.run_for_degrees(sb.port.A, 360)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertIsInstance(cmd['port'], str)
        self.assertEqual(cmd['port'], 'A')

    def test_motor_constants(self):
        self.assertEqual(sb.motor.BRAKE,            1)
        self.assertEqual(sb.motor.COAST,            0)
        self.assertEqual(sb.motor.HOLD,             2)
        self.assertEqual(sb.motor.CLOCKWISE,        0)
        self.assertEqual(sb.motor.COUNTERCLOCKWISE, 1)
        self.assertEqual(sb.motor.SHORTEST_PATH,    2)

    def test_multiple_commands_accumulate(self):
        sb.motor.run_for_degrees('A', 90)
        sb.motor.run_for_degrees('B', 180)
        sb.motor.stop('A')
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 3)
        self.assertEqual(cmds[0]['port'],    'A')
        self.assertEqual(cmds[1]['degrees'], 180)
        self.assertEqual(cmds[2]['type'],    'motor_stop')
