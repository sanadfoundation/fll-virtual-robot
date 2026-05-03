"""Characterize wait() command schema and runloop.run() coroutine driving."""
import unittest
import spike_bridge as sb


class TestWait(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_wait_ms(self):
        sb.wait(500)
        self.assertEqual(sb._cmds, [{'type': 'wait', 'ms': 500}])

    def test_wait_converts_to_int(self):
        sb.wait(250.9)
        self.assertEqual(sb._cmds[0]['ms'], 250)
        self.assertIsInstance(sb._cmds[0]['ms'], int)

    def test_wait_zero(self):
        sb.wait(0)
        self.assertEqual(sb._cmds, [{'type': 'wait', 'ms': 0}])


class TestRunloop(unittest.TestCase):

    def setUp(self):
        sb._cmds = []

    def test_runloop_drives_simple_coroutine(self):
        async def main():
            sb.wait(100)
            sb.motor_pair.move(0, 0, velocity=500)
            sb.wait(200)

        sb.runloop.run(main())
        self.assertEqual(len(sb._cmds), 3)
        self.assertEqual(sb._cmds[0], {'type': 'wait', 'ms': 100})
        self.assertEqual(sb._cmds[1]['type'], 'start')
        self.assertEqual(sb._cmds[2], {'type': 'wait', 'ms': 200})

    def test_runloop_with_pair_and_move(self):
        async def main():
            sb.motor_pair.pair(0, 'A', 'B')
            sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=1000)

        sb.runloop.run(main())
        self.assertEqual(len(sb._cmds), 2)
        self.assertEqual(sb._cmds[0]['type'], 'pair')
        self.assertEqual(sb._cmds[1]['type'], 'move')
        self.assertEqual(sb._cmds[1]['amount'], 360)

    def test_runloop_with_await_wait(self):
        async def main():
            await sb.wait(50)
            await sb.motor_pair.stop(0)

        sb.runloop.run(main())
        self.assertEqual(len(sb._cmds), 2)
        self.assertEqual(sb._cmds[0]['type'], 'wait')
        self.assertEqual(sb._cmds[1]['type'], 'stop')

    def test_commands_accumulate_across_awaits(self):
        async def main():
            for i in range(3):
                await sb.wait(100)

        sb.runloop.run(main())
        self.assertEqual(len(sb._cmds), 3)
        for cmd in sb._cmds:
            self.assertEqual(cmd, {'type': 'wait', 'ms': 100})
