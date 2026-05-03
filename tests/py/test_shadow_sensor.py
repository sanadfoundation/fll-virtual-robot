"""
Tests that _q() calls window.shadowCmd() for every command and that
run_user_code() calls window.resetShadow() at the start of each run.
"""
import unittest
import sys
import os

_here = os.path.dirname(os.path.abspath(__file__))


class TestShadowBridge(unittest.TestCase):

    def setUp(self):
        import mock_js
        import spike_bridge as sb
        self.sb = sb
        self.window = mock_js.window
        # Reset tracking state before each test
        sb._cmds = []
        self.window._shadow_cmds = []
        self.window._reset_count = 0

    # ── _q() forwards every command to shadowCmd ──────────────────────────────

    def test_q_calls_shadowCmd_with_move_command(self):
        self.sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        self.assertEqual(len(self.window._shadow_cmds), 1)
        self.assertEqual(self.window._shadow_cmds[0]['type'], 'move')

    def test_q_shadowCmd_receives_exact_same_dict_as_cmds(self):
        self.sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        self.assertEqual(self.sb._cmds[0], self.window._shadow_cmds[0])

    def test_q_calls_shadowCmd_for_every_command(self):
        self.sb.motor_pair.pair(0, 'A', 'B')
        self.sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        self.sb.motor_pair.stop(0)
        self.assertEqual(len(self.window._shadow_cmds), 3)
        self.assertEqual(self.window._shadow_cmds[0]['type'], 'pair')
        self.assertEqual(self.window._shadow_cmds[1]['type'], 'move')
        self.assertEqual(self.window._shadow_cmds[2]['type'], 'stop')

    def test_q_still_queues_cmd_for_animation(self):
        self.sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        # Command must also land in _cmds for the animation queue
        self.assertEqual(len(self.sb._cmds), 1)
        self.assertEqual(self.sb._cmds[0]['type'], 'move')

    def test_q_motor_pair_move_for_degrees_calls_shadowCmd(self):
        self.sb.motor_pair.move_for_degrees(0, 720, steering=0, velocity=1000)
        self.assertEqual(len(self.window._shadow_cmds), 1)
        self.assertEqual(self.window._shadow_cmds[0]['amount'], 720)

    def test_q_wait_calls_shadowCmd(self):
        self.sb.wait(500)
        self.assertEqual(len(self.window._shadow_cmds), 1)
        self.assertEqual(self.window._shadow_cmds[0]['type'], 'wait')

    # ── run_user_code() calls resetShadow before exec ─────────────────────────

    def test_run_user_code_calls_resetShadow(self):
        self.sb.run_user_code('pass')
        self.assertEqual(self.window._reset_count, 1)

    def test_run_user_code_calls_resetShadow_before_any_commands(self):
        # resetShadow must fire before user code runs (so shadow starts clean).
        call_log = []
        self.window._reset_count = 0

        original_shadow_cmd = self.window.shadowCmd
        original_reset = self.window.resetShadow

        def tracking_reset():
            call_log.append('reset')
            original_reset()

        def tracking_shadow(json_str):
            call_log.append('shadow')
            original_shadow_cmd(json_str)

        self.window.resetShadow = tracking_reset
        self.window.shadowCmd   = tracking_shadow
        try:
            self.sb.run_user_code(
                'import motor_pair\nmotor_pair.move_for_degrees(0, 360, steering=0, velocity=500)'
            )
        finally:
            self.window.resetShadow = original_reset
            self.window.shadowCmd   = original_shadow_cmd

        self.assertEqual(call_log[0], 'reset',
                         f'resetShadow should be first call, got order: {call_log}')

    def test_run_user_code_calls_resetShadow_on_each_run(self):
        self.sb.run_user_code('pass')
        self.sb.run_user_code('pass')
        self.assertEqual(self.window._reset_count, 2)
