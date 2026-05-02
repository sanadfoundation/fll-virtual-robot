"""
Tests that print() calls _bridge_call with a 'print' command.
"""
import unittest
import mock_js
import spike_bridge as sb


class TestPrintQueuing(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_print_queues_a_print_command(self):
        print('hello')
        self.assertEqual(mock_js.bridge_mock.last()['type'], 'print')

    def test_print_queues_correct_text(self):
        print('hello world')
        self.assertEqual(mock_js.bridge_mock.last()['text'], 'hello world')

    def test_print_multiple_args_joined_by_space(self):
        print('a', 'b', 'c')
        self.assertEqual(mock_js.bridge_mock.last()['text'], 'a b c')

    def test_print_custom_sep(self):
        print('x', 'y', sep='-')
        self.assertEqual(mock_js.bridge_mock.last()['text'], 'x-y')

    def test_print_empty_call_queues_empty_string(self):
        print()
        self.assertEqual(mock_js.bridge_mock.last()['text'], '')

    def test_print_numeric_args_converted_to_str(self):
        print(42, 3.14)
        self.assertEqual(mock_js.bridge_mock.last()['text'], '42 3.14')

    def test_multiple_prints_produce_multiple_commands(self):
        print('first')
        print('second')
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)
        self.assertEqual(cmds[0]['text'], 'first')
        self.assertEqual(cmds[1]['text'], 'second')

    def test_print_commands_interleave_with_move_commands(self):
        sb.motor_pair.move(0, 0, speed=500, amount=360, unit='degrees')
        print('moved')
        sb.motor_pair.stop(0)
        types = [c['type'] for c in mock_js.bridge_mock.all()]
        self.assertEqual(types, ['move', 'print', 'stop'])
