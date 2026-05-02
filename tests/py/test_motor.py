"""Characterize motor (single-port) command dict schemas."""
import unittest
import spike_bridge as sb


class TestMotorCommands(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_run_for_degrees(self):
        sb.motor.run_for_degrees('A', 360, velocity=500)
        self.assertEqual(sb._cmds, [
            {'type': 'motor_degrees', 'port': 'A', 'degrees': 360, 'velocity': 500},
        ])

    def test_run_for_degrees_default_velocity(self):
        sb.motor.run_for_degrees('B', 180)
        self.assertEqual(sb._cmds[0]['velocity'], 500)

    def test_run_for_time(self):
        sb.motor.run_for_time('C', 1000, velocity=300)
        self.assertEqual(sb._cmds, [
            {'type': 'motor_time', 'port': 'C', 'time_ms': 1000, 'velocity': 300},
        ])

    def test_run_for_time_default_velocity(self):
        sb.motor.run_for_time('D', 500)
        self.assertEqual(sb._cmds[0]['velocity'], 500)

    def test_run(self):
        sb.motor.run('E', velocity=750)
        self.assertEqual(sb._cmds, [
            {'type': 'motor_run', 'port': 'E', 'velocity': 750},
        ])

    def test_stop(self):
        sb.motor.stop('A')
        self.assertEqual(sb._cmds, [{'type': 'motor_stop', 'port': 'A'}])

    def test_run_to_absolute_position(self):
        sb.motor.run_to_absolute_position('F', 90, velocity=400)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],     'motor_degrees')
        self.assertEqual(cmd['port'],     'F')
        self.assertEqual(cmd['degrees'],  90)
        self.assertEqual(cmd['velocity'], 400)

    def test_run_to_relative_position(self):
        sb.motor.run_to_relative_position('B', -180, velocity=600)
        cmd = sb._cmds[0]
        self.assertEqual(cmd['type'],     'motor_degrees')
        self.assertEqual(cmd['degrees'],  -180)

    def test_port_object_converted_to_str(self):
        sb.motor.run_for_degrees(sb.port.A, 360)
        self.assertIsInstance(sb._cmds[0]['port'], str)
        self.assertEqual(sb._cmds[0]['port'], 'A')

    def test_multiple_commands_accumulate(self):
        sb.motor.run_for_degrees('A', 90)
        sb.motor.run_for_degrees('B', 180)
        sb.motor.stop('A')
        self.assertEqual(len(sb._cmds), 3)
        self.assertEqual(sb._cmds[0]['port'], 'A')
        self.assertEqual(sb._cmds[1]['degrees'], 180)
        self.assertEqual(sb._cmds[2]['type'], 'motor_stop')
