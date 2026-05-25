"""
Tests that sim.watch() posts var_update bridge commands.
"""
import sys
import unittest
import mock_js
import spike_bridge as sb

_IS_MP = getattr(sys.implementation, 'name', '') == 'micropython'


class TestSimWatch(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_positional_form_posts_one_var_update(self):
        from sim import watch
        watch('score', 42)
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd['type'], 'var_update')
        self.assertEqual(cmd['name'], 'score')
        self.assertEqual(cmd['value'], 42)

    def test_kwarg_form_posts_one_var_update(self):
        from sim import watch
        watch(score=42)
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd['type'], 'var_update')
        self.assertEqual(cmd['name'], 'score')
        self.assertEqual(cmd['value'], 42)

    def test_multiple_kwargs_post_multiple_var_updates_in_order(self):
        from sim import watch
        watch(score=10, ready=True, lap=3)
        cmds = mock_js.bridge_mock.all()
        # 3 kwargs → 3 updates
        self.assertEqual(len(cmds), 3)
        for c in cmds:
            self.assertEqual(c['type'], 'var_update')
        # MicroPython 1.28 preserves insertion order on dict; CPython 3.7+ same.
        names = [c['name'] for c in cmds]
        self.assertEqual(names, ['score', 'ready', 'lap'])
        values = [c['value'] for c in cmds]
        self.assertEqual(values, [10, True, 3])

    @unittest.skipIf(_IS_MP, 'MicroPython 1.28 does not preserve **kwargs insertion order; covered by CPython runner')
    def test_positional_plus_kwargs_post_in_positional_first_order(self):
        from sim import watch
        watch('a', 1, b=2, c=3)
        cmds = mock_js.bridge_mock.all()
        self.assertEqual([c['name']  for c in cmds], ['a', 'b', 'c'])
        self.assertEqual([c['value'] for c in cmds], [1, 2, 3])

    def test_positional_name_coerced_to_str(self):
        # We accept any name input but always send a string.
        from sim import watch
        watch(123, 'value')
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd['name'], '123')

    def test_string_value_passes_through_unchanged(self):
        from sim import watch
        watch('greet', 'hello')
        self.assertEqual(mock_js.bridge_mock.last()['value'], 'hello')

    def test_bool_value_passes_through_unchanged(self):
        from sim import watch
        watch('ready', False)
        self.assertEqual(mock_js.bridge_mock.last()['value'], False)

    def test_list_value_passes_through_unchanged(self):
        from sim import watch
        watch('xs', [1, 2, 3])
        self.assertEqual(mock_js.bridge_mock.last()['value'], [1, 2, 3])

    def test_watch_interleaves_with_motor_commands(self):
        from sim import watch
        sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=500)
        watch('checkpoint', 1)
        sb.motor_pair.stop(0)
        types = [c['type'] for c in mock_js.bridge_mock.all()]
        # The watch update sits between the two motor commands.
        self.assertEqual(types.count('var_update'), 1)
        idx = types.index('var_update')
        self.assertEqual(types[idx - 1], 'move')
        self.assertEqual(types[idx + 1], 'stop')


if __name__ == '__main__':
    unittest.main()
