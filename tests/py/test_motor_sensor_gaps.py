"""Coverage for motor and sensor doc contracts that were unasserted before
the api-audit pass. Each test class targets one Bucket 1 fix or Bucket 3
gap from docs/audit/api-gap-report.md.
"""
import unittest
import mock_js
import spike_bridge as sb


# ── Bucket 1.5 — motor.run_to_absolute_position direction is forwarded ──────

class TestRunToAbsolutePositionDirection(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_default_direction_is_shortest_path(self):
        # Docs default: direction=motor.SHORTEST_PATH (=2).
        sb.motor.run_to_absolute_position('A', 90, velocity=400)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['direction'], sb.motor.SHORTEST_PATH)
        self.assertEqual(cmd['direction'], 2)

    def test_clockwise_direction_forwarded(self):
        sb.motor.run_to_absolute_position('A', 90, velocity=400,
                                          direction=sb.motor.CLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['direction'], 0)

    def test_counterclockwise_direction_forwarded(self):
        sb.motor.run_to_absolute_position('A', 90, velocity=400,
                                          direction=sb.motor.COUNTERCLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['direction'], 1)

    def test_longest_path_direction_forwarded(self):
        sb.motor.run_to_absolute_position('A', 90, velocity=400,
                                          direction=sb.motor.LONGEST_PATH)
        self.assertEqual(mock_js.bridge_mock.all()[0]['direction'], 3)


# ── Bucket 1.6 — motor.velocity returns last commanded velocity ─────────────

class TestMotorVelocityTracking(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        # Reset the per-port tracker so tests don't leak into each other.
        for p in sb._PORT_LETTERS:
            sb._motor_velocities[p] = 0

    def test_velocity_zero_before_any_command(self):
        self.assertEqual(sb.motor.velocity('A'), 0)

    def test_velocity_after_run_for_degrees(self):
        sb.motor.run_for_degrees('A', 360, velocity=500)
        self.assertEqual(sb.motor.velocity('A'), 500)

    def test_velocity_after_run_for_time(self):
        sb.motor.run_for_time('B', 1000, velocity=720)
        self.assertEqual(sb.motor.velocity('B'), 720)

    def test_velocity_after_run_continuous(self):
        sb.motor.run('A', velocity=300)
        self.assertEqual(sb.motor.velocity('A'), 300)

    def test_velocity_after_run_to_absolute_position(self):
        sb.motor.run_to_absolute_position('A', 90, velocity=600)
        self.assertEqual(sb.motor.velocity('A'), 600)

    def test_velocity_after_run_to_relative_position(self):
        sb.motor.run_to_relative_position('B', -180, velocity=450)
        self.assertEqual(sb.motor.velocity('B'), 450)

    def test_velocity_resets_after_stop(self):
        sb.motor.run('A', velocity=500)
        sb.motor.stop('A')
        self.assertEqual(sb.motor.velocity('A'), 0)

    def test_velocity_is_per_port(self):
        sb.motor.run('A', velocity=300)
        sb.motor.run('B', velocity=600)
        self.assertEqual(sb.motor.velocity('A'), 300)
        self.assertEqual(sb.motor.velocity('B'), 600)

    def test_velocity_negative_preserved(self):
        # Negative velocity reverses direction; docs say signed deg/sec.
        sb.motor.run('A', velocity=-360)
        self.assertEqual(sb.motor.velocity('A'), -360)

    def test_velocity_validates_port(self):
        with self.assertRaises(RuntimeError):
            sb.motor.velocity('E')  # E is color_sensor


# ── Bucket 3 — motor.run default velocity ──────────────────────────────────

class TestMotorRunDefaults(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_run_default_velocity_is_360(self):
        # Docs: motor.run(port, velocity=360, *, acceleration=1000).
        sb.motor.run('A')
        self.assertEqual(mock_js.bridge_mock.all()[0]['velocity'], 360)

    def test_run_to_absolute_position_default_velocity(self):
        sb.motor.run_to_absolute_position('A', 180)
        self.assertEqual(mock_js.bridge_mock.all()[0]['velocity'], 360)

    def test_run_to_relative_position_default_velocity(self):
        sb.motor.run_to_relative_position('B', 90)
        self.assertEqual(mock_js.bridge_mock.all()[0]['velocity'], 360)


# ── Bucket 3 — motor_pair.stop with stop= kwarg ─────────────────────────────

class TestMotorPairStopKwarg(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_stop_default_keyword_accepted(self):
        # Docs: motor_pair.stop(pair, *, stop=motor.BRAKE).
        # The current impl forwards no stop value — tests pin the wire shape so
        # any future expansion surfaces. Both calls should produce the same
        # command type today.
        sb.motor_pair.stop(0)
        sb.motor_pair.stop(0, stop=sb.motor.BRAKE)
        sb.motor_pair.stop(0, stop=sb.motor.HOLD)
        sb.motor_pair.stop(0, stop=sb.motor.COAST)
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 4)
        for c in cmds:
            self.assertEqual(c['type'],    'stop')
            self.assertEqual(c['pair_id'], 0)


# ── Bucket 1.3 — motor_pair.move default velocity ───────────────────────────

class TestMotorPairMoveDefaults(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_move_continuous_default_velocity_is_360(self):
        # Docs: motor_pair.move(pair, steering, *, velocity=360, acceleration=1000).
        sb.motor_pair.move(0, 0)
        self.assertEqual(mock_js.bridge_mock.all()[0]['speed'], 360)


# ── Bucket 3 — color_sensor return-value contracts ──────────────────────────

class TestColorSensorContracts(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        # Reset state keys that other tests may have set.
        for k in ('color', 'reflection', 'rgb'):
            sb._state.pop(k, None)
        sb._state['color']       = 'none'
        sb._state['distance_mm'] = 300

    def test_color_default_is_unknown(self):
        # Docs: returns color.UNKNOWN (-1) when no color is detected.
        self.assertEqual(sb.color_sensor.color('E'), sb.color.UNKNOWN)
        self.assertEqual(sb.color_sensor.color('E'), -1)

    def test_color_reads_state_for_each_token(self):
        # Verify every documented enum value round-trips through _state → color().
        token_to_int = {
            'black': 0, 'magenta': 1, 'purple': 2, 'blue': 3, 'azure': 4,
            'turquoise': 5, 'green': 6, 'yellow': 7, 'orange': 8,
            'red': 9, 'white': 10,
        }
        for token, expected in token_to_int.items():
            sb._state['color'] = token
            self.assertEqual(sb.color_sensor.color('E'), expected,
                             f"token {token} should map to {expected}")

    def test_reflection_in_documented_range(self):
        # Docs: reflection returns 0-100. Pin the impl's behavior at the bounds.
        for v in (0, 50, 100):
            sb._state['reflection'] = v
            result = sb.color_sensor.reflection('E')
            self.assertEqual(result, v)
            self.assertGreaterEqual(result, 0)
            self.assertLessEqual(result, 100)

    def test_rgbi_returns_4_ints(self):
        # Docs: rgbi returns tuple[int, int, int, int].
        sb._state['rgb'] = [50, 100, 150]
        result = sb.color_sensor.rgbi('E')
        self.assertEqual(len(result), 4)
        for v in result:
            self.assertIsInstance(v, int)


# ── Bucket 3 — distance_sensor return-value contracts ───────────────────────

class TestDistanceSensorContracts(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        sb._state.pop('distance_mm', None)

    def test_distance_default(self):
        # Default state has distance_mm = 300 (from spike_bridge.py _state init).
        # If it's been mutated by another test, 300 is still the spawn default.
        self.assertEqual(sb.distance_sensor.distance('F'), 300)

    def test_distance_reads_state(self):
        sb._state['distance_mm'] = 1500
        self.assertEqual(sb.distance_sensor.distance('F'), 1500)

    def test_distance_minus_one_when_no_valid_reading(self):
        # Docs: returns -1 if no object detected. Impl reports >= 9999 as -1.
        sb._state['distance_mm'] = 9999
        self.assertEqual(sb.distance_sensor.distance('F'), -1)
        sb._state['distance_mm'] = 12345
        self.assertEqual(sb.distance_sensor.distance('F'), -1)

    def test_distance_returns_int(self):
        sb._state['distance_mm'] = 200
        self.assertIsInstance(sb.distance_sensor.distance('F'), int)

    def test_clear_emits_no_command(self):
        # Pinned no-op: clear / get_pixel / set_pixel / show currently do
        # nothing on the bridge, but they must accept the documented signature.
        sb.distance_sensor.clear('F')
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_get_pixel_returns_int(self):
        result = sb.distance_sensor.get_pixel('F', 0, 0)
        self.assertIsInstance(result, int)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_set_pixel_emits_no_command(self):
        sb.distance_sensor.set_pixel('F', 1, 1, 50)
        self.assertEqual(mock_js.bridge_mock.all(), [])

    def test_show_emits_no_command(self):
        sb.distance_sensor.show('F', [100, 100, 100, 100])
        self.assertEqual(mock_js.bridge_mock.all(), [])


if __name__ == '__main__':
    unittest.main()
