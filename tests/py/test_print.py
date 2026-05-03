"""
Tests that print() queues a 'print' command for animation playback
instead of calling window.appendOutput() immediately.
"""
import unittest


class TestPrintQueuing(unittest.TestCase):

    def setUp(self):
        import spike_bridge as sb
        import mock_js
        self.sb = sb
        self.window = mock_js.window
        sb._cmds = []
        self.window._output_calls = []

    # ── print queues a command, not an immediate appendOutput call ────────────

    def test_print_queues_a_print_command(self):
        print('hello')
        self.assertEqual(len(self.sb._cmds), 1)
        self.assertEqual(self.sb._cmds[0]['type'], 'print')

    def test_print_queues_correct_text(self):
        print('hello world')
        self.assertEqual(self.sb._cmds[0]['text'], 'hello world')

    def test_print_does_not_call_appendOutput_immediately(self):
        print('hello')
        self.assertEqual(self.window._output_calls, [])

    # ── text formatting matches Python print() semantics ─────────────────────

    def test_print_multiple_args_joined_by_space(self):
        print('a', 'b', 'c')
        self.assertEqual(self.sb._cmds[0]['text'], 'a b c')

    def test_print_custom_sep(self):
        print('x', 'y', sep='-')
        self.assertEqual(self.sb._cmds[0]['text'], 'x-y')

    def test_print_empty_call_queues_empty_string(self):
        print()
        self.assertEqual(self.sb._cmds[0]['text'], '')

    def test_print_numeric_args_converted_to_str(self):
        print(42, 3.14)
        self.assertEqual(self.sb._cmds[0]['text'], '42 3.14')

    # ── multiple prints produce multiple commands in order ────────────────────

    def test_multiple_prints_produce_multiple_commands(self):
        print('first')
        print('second')
        self.assertEqual(len(self.sb._cmds), 2)
        self.assertEqual(self.sb._cmds[0]['text'], 'first')
        self.assertEqual(self.sb._cmds[1]['text'], 'second')

    def test_print_commands_interleave_with_move_commands(self):
        self.sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        print('moved')
        self.sb.motor_pair.stop(0)
        types = [c['type'] for c in self.sb._cmds]
        self.assertEqual(types, ['move', 'print', 'stop'])
