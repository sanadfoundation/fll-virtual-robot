"""
Fake `js` module for running spike_bridge.py under CPython.

spike_bridge does `from js import window`; injecting this module into
sys.modules['js'] before importing spike_bridge satisfies that import.
The window object provides all the window.* callables spike_bridge needs.
"""


class _Window:
    """Minimal stub for the browser window object used by spike_bridge."""

    def __init__(self):
        self._last_commands = []
        self._shadow_cmds = []
        self._reset_count = 0

    def getColorSensorColor(self):        return 'none'
    def getColorSensorReflection(self):   return 50
    def getColorSensorAmbient(self):      return 30
    def getColorSensorRGB(self):          return [128, 128, 128]
    def getDistanceSensorValue(self):     return 300
    def getDistanceSensorPresence(self):  return False
    def getForceSensorValue(self):        return 0
    def getForceSensorPressed(self):      return False
    def getMotorSpeed(self, port):        return 0
    def getMotorPosition(self, port):     return 0

    def receiveCommands(self, json_str):
        import json
        self._last_commands = json.loads(json_str)

    def shadowCmd(self, json_str):
        import json
        self._shadow_cmds.append(json.loads(json_str))

    def resetShadow(self):
        self._reset_count += 1

    def appendOutput(self, text):
        self._output_calls.append(text)

    def onPyReady(self):
        pass  # called at module-load time; no-op for tests


window = _Window()
