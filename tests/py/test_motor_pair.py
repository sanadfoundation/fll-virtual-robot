"""Tests for motor_pair command dict schemas (SPIKE3 spec)."""
import unittest
import mock_js
import spike_bridge as sb


class TestMotorPairPair(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_pair_basic(self):
        sb.motor_pair.pair(0, 'A', 'B')
        self.assertEqual(mock_js.bridge_mock.all(), [
            {'type': 'pair', 'pair_id': 0, 'left': 'A', 'right': 'B'},
        ])

    def test_pair_id_1(self):
        sb.motor_pair.pair(1, 'C', 'D')
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['pair_id'], 1)
        self.assertEqual(cmd['left'],    'C')
        self.assertEqual(cmd['right'],   'D')

    def test_pair_port_objects_converted_to_str(self):
        sb.motor_pair.pair(0, sb.port.A, sb.port.B)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertIsInstance(cmd['left'],  str)
        self.assertIsInstance(cmd['right'], str)


class TestMotorPairMoveForDegrees(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_for_degrees(self):
        sb.motor_pair.move_for_degrees(0, 720, steering=0, velocity=1000)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],   'move')
        self.assertEqual(cmd['amount'], 720)
        self.assertEqual(cmd['unit'],   'degrees')
        self.assertEqual(cmd['speed'],  1000)

    def test_move_for_degrees_default_velocity(self):
        sb.motor_pair.move_for_degrees(0, 360, 0)
        self.assertEqual(mock_js.bridge_mock.all()[0]['speed'], 360)

    def test_move_for_degrees_with_steering(self):
        sb.motor_pair.move_for_degrees(0, 360, steering=50)
        self.assertEqual(mock_js.bridge_mock.all()[0]['steering'], 50)


class TestMotorPairMoveForTime(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_for_time_converts_to_degrees(self):
        sb.motor_pair.move_for_time(0, 2000, 0, velocity=360)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],  'move')
        self.assertEqual(cmd['unit'],  'degrees')
        self.assertAlmostEqual(cmd['amount'], 720.0)
        self.assertEqual(cmd['speed'], 360)

    def test_move_for_time_default_velocity(self):
        sb.motor_pair.move_for_time(0, 1000, 0)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['speed'], 360)
        self.assertAlmostEqual(cmd['amount'], 360.0)

    def test_move_for_time_with_steering(self):
        sb.motor_pair.move_for_time(0, 1000, 50, velocity=360)
        self.assertEqual(mock_js.bridge_mock.all()[0]['steering'], 50)

    def test_move_for_time_negative_velocity(self):
        sb.motor_pair.move_for_time(0, 1000, 0, velocity=-360)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['speed'], -360)
        self.assertAlmostEqual(cmd['amount'], -360.0)


class TestMotorPairMoveForTankTime(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_tank_for_time(self):
        sb.motor_pair.move_tank_for_time(0, 500, -500, 1000)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],        'move_tank')
        self.assertEqual(cmd['pair_id'],     0)
        self.assertEqual(cmd['left_speed'],  500)
        self.assertEqual(cmd['right_speed'], -500)
        self.assertEqual(cmd['unit'],        'degrees')
        self.assertAlmostEqual(cmd['amount'], 500.0)

    def test_move_tank_for_time_uses_max_velocity(self):
        sb.motor_pair.move_tank_for_time(0, 200, 800, 1000)
        self.assertAlmostEqual(mock_js.bridge_mock.all()[0]['amount'], 800.0)


class TestMotorPairMoveContinuous(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_continuous(self):
        sb.motor_pair.move(0, 0, velocity=360)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],     'start')
        self.assertEqual(cmd['pair_id'],  0)
        self.assertEqual(cmd['steering'], 0)
        self.assertEqual(cmd['speed'],    360)

    def test_move_continuous_with_steering(self):
        sb.motor_pair.move(0, 50, velocity=500)
        self.assertEqual(mock_js.bridge_mock.all()[0]['steering'], 50)


class TestMotorPairStop(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_stop(self):
        sb.motor_pair.stop(0)
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'stop', 'pair_id': 0}])


class TestMotorPairBackwardCompat(unittest.TestCase):
    """move_tank still works (compat alias)."""

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_tank_alias(self):
        sb.motor_pair.move_tank(0, 500, 300, amount=360, unit='degrees')
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],        'move_tank')
        self.assertEqual(cmd['left_speed'],  500)
        self.assertEqual(cmd['right_speed'], 300)
        self.assertEqual(cmd['amount'],      360)


class TestMotorPairConstants(unittest.TestCase):

    def test_pair_id_constants(self):
        self.assertEqual(sb.motor_pair.PAIR_1, 0)
        self.assertEqual(sb.motor_pair.PAIR_2, 1)
        self.assertEqual(sb.motor_pair.PAIR_3, 2)
