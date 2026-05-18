"""Characterize wait() command schema and runloop.run() coroutine driving."""
import asyncio
import sys
import unittest
import mock_js
import spike_bridge as sb

# Pyscript's MicroPython asyncio is JS-event-loop bound — there's no
# synchronous run_until_complete. The MP test runner polyfills asyncio.run
# with a manual coroutine driver that's fine for the immediate-completion
# coroutines elsewhere, but it can't interleave at await asyncio.sleep(0).
# Skip the interleaving tests under MP; the JS-side round-trip integration
# tests exercise the same runloop.run path against the real event loop.
_IS_MP = getattr(sys.implementation, 'name', '') == 'micropython'


class TestWait(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_wait_ms(self):
        sb.wait(500)
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'wait', 'ms': 500}])

    def test_wait_converts_to_int(self):
        sb.wait(250.9)
        cmd = mock_js.bridge_mock.all()[0]
        self.assertEqual(cmd['ms'], 250)
        self.assertIsInstance(cmd['ms'], int)

    def test_wait_zero(self):
        sb.wait(0)
        self.assertEqual(mock_js.bridge_mock.all(), [{'type': 'wait', 'ms': 0}])


class TestRunloop(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_runloop_drives_simple_coroutine(self):
        async def main():
            sb.wait(100)
            sb.motor_pair.move(0, 0, velocity=500)
            sb.wait(200)

        sb.runloop.run(main())
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 3)
        self.assertEqual(cmds[0], {'type': 'wait', 'ms': 100})
        self.assertEqual(cmds[1]['type'], 'start')
        self.assertEqual(cmds[2], {'type': 'wait', 'ms': 200})

    def test_runloop_with_pair_and_move(self):
        async def main():
            sb.motor_pair.pair(0, 'A', 'B')
            sb.motor_pair.move_for_degrees(0, 360, steering=0, velocity=1000)

        sb.runloop.run(main())
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)
        self.assertEqual(cmds[0]['type'],   'pair')
        self.assertEqual(cmds[1]['type'],   'move')
        self.assertEqual(cmds[1]['amount'], 360)

    def test_runloop_with_await_wait(self):
        async def main():
            await sb.wait(50)
            await sb.motor_pair.stop(0)

        sb.runloop.run(main())
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 2)
        self.assertEqual(cmds[0]['type'], 'wait')
        self.assertEqual(cmds[1]['type'], 'stop')

    def test_commands_accumulate_across_awaits(self):
        async def main():
            for i in range(3):
                await sb.wait(100)

        sb.runloop.run(main())
        cmds = mock_js.bridge_mock.all()
        self.assertEqual(len(cmds), 3)
        for cmd in cmds:
            self.assertEqual(cmd, {'type': 'wait', 'ms': 100})

    def test_runloop_runs_multiple_coroutines_to_completion(self):
        async def f1():
            await sb.wait(50)
        async def f2():
            await sb.wait(75)

        sb.runloop.run(f1(), f2())
        cmds = mock_js.bridge_mock.all()
        durations = sorted(c['ms'] for c in cmds if c['type'] == 'wait')
        self.assertEqual(durations, [50, 75])


class TestRunloopParallel(unittest.TestCase):
    """Production path: multi-fn runloop.run interleaves via asyncio.gather.

    Bypasses bridge_mock — we need the real asyncio loop and a real awaitable
    so we can observe whether tasks actually interleave at await points.
    """

    def setUp(self):
        sb._test_intercept = None
        self._original_bridge_call = sb._bridge_call

    def tearDown(self):
        sb._bridge_call = self._original_bridge_call
        sb._user_coro = None

    @unittest.skipIf(_IS_MP, 'requires CPython asyncio loop; covered by JS round-trip suite')
    def test_multiple_coroutines_interleave_at_awaits(self):
        events = []

        async def fake_bridge(cmd):
            events.append(('start', cmd['id']))
            await asyncio.sleep(0)
            events.append(('end', cmd['id']))

        sb._bridge_call = lambda cmd: fake_bridge(cmd)

        async def f1():
            await sb._bridge_call({'id': 'f1-a'})
            await sb._bridge_call({'id': 'f1-b'})

        async def f2():
            await sb._bridge_call({'id': 'f2-a'})
            await sb._bridge_call({'id': 'f2-b'})

        sb.runloop.run(f1(), f2())
        self.assertIsNotNone(sb._user_coro)
        asyncio.run(sb._user_coro)

        starts = [e[1] for e in events if e[0] == 'start']
        # Sequential (broken): ['f1-a', 'f1-b', 'f2-a', 'f2-b']
        # Parallel (correct):  f2-a starts before f1-b.
        self.assertLess(starts.index('f2-a'), starts.index('f1-b'),
                        'coroutines did not interleave: ' + repr(starts))

    @unittest.skipIf(_IS_MP, 'requires CPython asyncio loop; covered by JS round-trip suite')
    def test_single_coroutine_still_runs(self):
        events = []

        async def fake_bridge(cmd):
            events.append(cmd['id'])

        sb._bridge_call = lambda cmd: fake_bridge(cmd)

        async def main():
            await sb._bridge_call({'id': 'one'})
            await sb._bridge_call({'id': 'two'})

        sb.runloop.run(main())
        asyncio.run(sb._user_coro)
        self.assertEqual(events, ['one', 'two'])
