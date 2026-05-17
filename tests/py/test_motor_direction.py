"""Bridge-tier coverage for the `direction` kwarg on
motor.run_to_absolute_position.

Today's `_motor_sensor_gaps.py` only asserts that the kwarg makes it onto
the wire as an integer. These tests assert the semantic contract: the
bridge must compute a signed `degrees` delta that produces motion in the
requested rotational direction.

LEGO docs: `direction` is one of
  - motor.CLOCKWISE        (0) — always rotate CW (positive delta in (0, 360])
  - motor.COUNTERCLOCKWISE (1) — always rotate CCW (negative delta in [-360, 0))
  - motor.SHORTEST_PATH    (2) — pick the smaller-magnitude delta
  - motor.LONGEST_PATH     (3) — pick the larger-magnitude delta
"""
import unittest
import mock_js
import spike_bridge as sb


class TestRunToAbsoluteDirectionDelta(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()
        # Reset motor accumulator state so each test starts from a known pose.
        sb._state['motors'] = {p: 0 for p in sb._PORT_LETTERS}

    # ── from a known start position of 0° ──────────────────────────────────

    def test_clockwise_to_90_emits_positive_90(self):
        sb.motor.run_to_absolute_position('A', 90, direction=sb.motor.CLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 90)

    def test_counterclockwise_to_90_emits_negative_270(self):
        # To reach +90° going CCW from 0°, must travel -270°.
        sb.motor.run_to_absolute_position('A', 90, direction=sb.motor.COUNTERCLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], -270)

    def test_shortest_path_to_90_picks_positive_90(self):
        sb.motor.run_to_absolute_position('A', 90, direction=sb.motor.SHORTEST_PATH)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 90)

    def test_longest_path_to_90_picks_negative_270(self):
        sb.motor.run_to_absolute_position('A', 90, direction=sb.motor.LONGEST_PATH)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], -270)

    def test_shortest_path_to_negative_90_picks_negative_90(self):
        # Target -90 (== 270 wrapped); shortest is -90 (90° CCW).
        sb.motor.run_to_absolute_position('A', -90, direction=sb.motor.SHORTEST_PATH)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], -90)

    def test_clockwise_to_negative_90_emits_positive_270(self):
        # Going CW from 0 to -90 (== 270 wrapped) is the long way: +270°.
        sb.motor.run_to_absolute_position('A', -90, direction=sb.motor.CLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 270)

    # ── from a non-zero starting accumulator ───────────────────────────────

    def test_clockwise_uses_wrapped_current_not_raw(self):
        # Pre-rotate the wheel 350° (accumulator = 350; wrapped = -10°).
        # Asking to rotate CW to absolute 10° should emit +20°, not -340°
        # (the old bug: delta = target - raw_accumulator).
        sb._state['motors']['A'] = 350
        sb.motor.run_to_absolute_position('A', 10, direction=sb.motor.CLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 20)

    def test_default_direction_is_shortest_path(self):
        # Same delta as SHORTEST_PATH from 0 → 90.
        sb.motor.run_to_absolute_position('A', 90)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 90)

    # ── edge cases ─────────────────────────────────────────────────────────

    def test_target_equals_current_emits_zero(self):
        sb.motor.run_to_absolute_position('A', 0, direction=sb.motor.CLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 0)

    def test_target_180_clockwise_emits_positive_180(self):
        # Boundary case: 180° away. CW takes +180.
        sb.motor.run_to_absolute_position('A', 180, direction=sb.motor.CLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], 180)

    def test_target_180_counterclockwise_emits_negative_180(self):
        sb.motor.run_to_absolute_position('A', 180, direction=sb.motor.COUNTERCLOCKWISE)
        self.assertEqual(mock_js.bridge_mock.all()[0]['degrees'], -180)


if __name__ == '__main__':
    unittest.main()
