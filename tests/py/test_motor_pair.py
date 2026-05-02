"""Characterize motor_pair command dict schemas."""
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


class TestMotorPairMove(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_straight(self):
        sb.motor_pair.move(0, 0, speed=500, amount=360, unit='degrees')
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],     'move')
        self.assertEqual(cmd['pair_id'],  0)
        self.assertEqual(cmd['steering'], 0)
        self.assertEqual(cmd['speed'],    500)
        self.assertEqual(cmd['amount'],   360)
        self.assertEqual(cmd['unit'],     'degrees')

    def test_move_with_steering(self):
        sb.motor_pair.move(0, 50, speed=1000, amount=180, unit='rotations')
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['steering'], 50)
        self.assertEqual(cmd['speed'],    1000)
        self.assertEqual(cmd['unit'],     'rotations')

    def test_move_for_degrees(self):
        sb.motor_pair.move_for_degrees(0, 720, steering=0, velocity=1000)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],   'move')
        self.assertEqual(cmd['amount'], 720)
        self.assertEqual(cmd['unit'],   'degrees')
        self.assertEqual(cmd['speed'],  1000)

    def test_move_for_rotations(self):
        sb.motor_pair.move_for_rotations(0, 3, steering=-50, velocity=500)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],     'move')
        self.assertEqual(cmd['amount'],   3)
        self.assertEqual(cmd['unit'],     'rotations')
        self.assertEqual(cmd['steering'], -50)

    def test_move_for_time_cm_calculation(self):
        sb.motor_pair.move_for_time(0, 1000, steering=0, velocity=1000)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'], 'move')
        self.assertEqual(cmd['unit'], 'cm')
        expected_cm = abs(1000 / 1000) * 0.9 * abs(1000) / 10.0
        self.assertAlmostEqual(cmd['amount'], expected_cm, places=9)

    def test_move_for_time_half_speed(self):
        sb.motor_pair.move_for_time(0, 2000, steering=0, velocity=500)
        cmd = mock_js.bridge_mock.all()[0]
        expected_cm = abs(500 / 1000) * 0.9 * 2000 / 10.0
        self.assertAlmostEqual(cmd['amount'], expected_cm, places=9)


class TestMotorPairTank(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_tank(self):
        sb.motor_pair.move_tank(0, 500, 300, amount=360, unit='degrees')
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],        'move_tank')
        self.assertEqual(cmd['pair_id'],     0)
        self.assertEqual(cmd['left_speed'],  500)
        self.assertEqual(cmd['right_speed'], 300)
        self.assertEqual(cmd['amount'],      360)
        self.assertEqual(cmd['unit'],        'degrees')

    def test_move_tank_reverse(self):
        sb.motor_pair.move_tank(0, -500, -500, amount=1, unit='rotations')
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['left_speed'],  -500)
        self.assertEqual(cmd['right_speed'], -500)

    def test_start(self):
        sb.motor_pair.start(0, steering=25, speed=700)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],     'start')
        self.assertEqual(cmd['pair_id'],  0)
        self.assertEqual(cmd['steering'], 25)
        self.assertEqual(cmd['speed'],    700)

    def test_start_tank(self):
        sb.motor_pair.start_tank(0, 500, -500)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],        'start_tank')
        self.assertEqual(cmd['left_speed'],  500)
        self.assertEqual(cmd['right_speed'], -500)

    def test_start_at_power_multiplies_by_10(self):
        sb.motor_pair.start_at_power(0, power=50, steering=0)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['type'],  'start')
        self.assertEqual(cmd['speed'], 50 * 10)

    def test_stop(self):
        sb.motor_pair.stop(0)
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'stop', 'pair_id': 0}])


class TestMotorPairConstants(unittest.TestCase):

    def test_pair_id_constants(self):
        self.assertEqual(sb.motor_pair.PAIR_1, 0)
        self.assertEqual(sb.motor_pair.PAIR_2, 1)
        self.assertEqual(sb.motor_pair.PAIR_3, 2)

    def test_get_default_speed(self):
        self.assertEqual(sb.motor_pair.get_default_speed(), 500)
