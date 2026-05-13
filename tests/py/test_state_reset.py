"""_handle_run must reset cached sensor _state to its module defaults
before exec()ing user code.

Without this, a re-run sees the previous run's last sensor values until
the first bridge round-trip refreshes them — visible to users as a
sensor-driven watcher tripping immediately on the second run with the
previous run's final distance/color reading.
"""
import asyncio
import unittest
import mock_js
import spike_bridge as sb


class TestStateResetOnRerun(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_handle_run_resets_distance_mm_to_default(self):
        # Simulate stale state from a previous run (robot stopped near a wall).
        sb._state['distance_mm'] = 71

        asyncio.run(sb._handle_run('pass'))

        self.assertEqual(sb._state['distance_mm'], 300)

    def test_handle_run_resets_color_to_none(self):
        sb._state['color'] = 'red'

        asyncio.run(sb._handle_run('pass'))

        self.assertEqual(sb._state['color'], 'none')

    def test_handle_run_resets_position_to_spawn(self):
        sb._state['x'] = 1000
        sb._state['y'] = 800
        sb._state['heading'] = 0

        asyncio.run(sb._handle_run('pass'))

        self.assertEqual(sb._state['x'], 350)
        self.assertEqual(sb._state['y'], 163)
        self.assertEqual(sb._state['heading'], 90)

    def test_handle_run_resets_motor_encoders(self):
        sb._state['motors'] = {'A': 1234, 'B': -567, 'C': 0, 'D': 0, 'E': 0, 'F': 0}

        asyncio.run(sb._handle_run('pass'))

        self.assertEqual(sb._state['motors'], {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0})

    def test_handle_run_resets_stopped_flag(self):
        # If a previous run ended via the stop button, _state['stopped'] was
        # set to True by the JS reply. A re-run must not inherit it — otherwise
        # the very first bridge call would re-raise SystemExit.
        sb._state['stopped'] = True

        asyncio.run(sb._handle_run('pass'))

        self.assertEqual(sb._state['stopped'], False)

    def test_handle_run_issues_initial_read_sensors_sync(self):
        # Without this, sensor reads in user code that fire before the first
        # motion command see the spawn defaults rather than the simulator's
        # current state (e.g. after the user dragged the robot to a new pose).
        asyncio.run(sb._handle_run('pass'))

        cmds = mock_js.bridge_mock.all()
        self.assertTrue(len(cmds) >= 1, "expected at least one command")
        self.assertEqual(cmds[0], {'type': 'read_sensors'})

    def test_handle_run_initial_sync_fires_before_user_code(self):
        # User code that immediately reads a sensor must see post-sync state.
        # Capture command order: read_sensors first, any user-issued cmd second.
        code = (
            "import runloop\n"
            "from hub import port\n"
            "import motor_pair\n"
            "async def main():\n"
            "    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)\n"
            "runloop.run(main())\n"
        )
        asyncio.run(sb._handle_run(code))

        cmds = mock_js.bridge_mock.all()
        self.assertEqual(cmds[0]['type'], 'read_sensors')
        # Anything the user code dispatched lands after the sync.
        user_cmds = [c for c in cmds[1:] if c.get('type') != 'read_sensors']
        self.assertTrue(any(c['type'] == 'pair' for c in user_cmds))
