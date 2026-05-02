"""
Fake `js` module for running spike_bridge.py under CPython.

Inject via sys.modules['js'] before importing spike_bridge.
Provides no-ops for addEventListener/postMessage (called at module load).
Tests call bridge_mock.install() in setUp to intercept _bridge_call.
"""


def addEventListener(event, handler):
    pass


def postMessage(data):
    pass


class _Window:
    """Minimal window object for spike_bridge to load."""
    def shadowCmd(self, json_str):
        pass
    def onPyReady(self):
        pass


window = _Window()


class BridgeMock:
    """
    Intercepts spike_bridge._bridge_call to record commands without SAB/Atomics.

    Usage in test setUp:
        import mock_js
        mock_js.bridge_mock.install()

    Usage in test assertions:
        cmd = mock_js.bridge_mock.last()      # most recent command
        cmds = mock_js.bridge_mock.all()      # all commands in order
    """

    def __init__(self):
        self._calls = []

    def install(self):
        import spike_bridge as sb
        sb._bridge_call = self._capture
        sb._state.clear()
        sb._state.update({
            'x': 350, 'y': 980, 'heading': -90,
            'color': 'none', 'distance_mm': 300,
            'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
            'stopped': False,
        })
        self._calls = []

    def _capture(self, cmd):
        self._calls.append(cmd)

    def last(self):
        return self._calls[-1] if self._calls else None

    def all(self):
        return list(self._calls)


bridge_mock = BridgeMock()
