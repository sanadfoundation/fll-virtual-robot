from js import window
import json
import builtins
import sys

# ── _Awaitable ─────────────────────────────────────────────────────────────────
# All command-queuing methods return this. The command is queued at construction
# time, so calling without `await` still works (backward compat). The object is
# also awaitable so `await motor_pair.move(...)` works in async def main().

_cmds = []

class _Awaitable:
    # MicroPython's await protocol uses __iter__/__next__, not __await__.
    # __next__ raising StopIteration immediately signals instant completion.
    def __init__(self, cmd=None):
        if cmd is not None:
            _cmds.append(cmd)
    def __iter__(self):
        return self
    def __next__(self):
        raise StopIteration(None)
    def __await__(self):
        return self  # CPython compat

def _q(cmd):
    return _Awaitable(cmd)

# ── color ──────────────────────────────────────────────────────────────────────

class color:
    BLACK = 'black';  RED = 'red';      GREEN = 'green';   YELLOW = 'yellow'
    BLUE  = 'blue';   WHITE = 'white';  CYAN  = 'cyan';    MAGENTA = 'magenta'
    ORANGE = 'orange'; NONE = 'none'

# ── port — lowercase matches real Spike Prime; Port kept for compat ────────────

class port:
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'

Port = port

# ── motor ──────────────────────────────────────────────────────────────────────

class motor:
    @staticmethod
    def run_for_degrees(port, degrees, velocity=500, stop=1, acceleration=100, deceleration=100):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': degrees, 'velocity': velocity})

    @staticmethod
    def run_for_time(port, duration, velocity=500, stop=1, acceleration=100, deceleration=100):
        return _q({'type': 'motor_time', 'port': str(port), 'time_ms': duration, 'velocity': velocity})

    @staticmethod
    def run_to_absolute_position(port, position, velocity=500, stop=1, direction=1):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run_to_relative_position(port, position, velocity=500, stop=1):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run(port, velocity=500):
        return _q({'type': 'motor_run', 'port': str(port), 'velocity': velocity})

    @staticmethod
    def stop(port, stop=1):
        return _q({'type': 'motor_stop', 'port': str(port)})

    @staticmethod
    def get_speed(port):
        return int(window.getMotorSpeed(str(port)))

    @staticmethod
    def get_position(port):
        return int(window.getMotorPosition(str(port)))

    @staticmethod
    def get_degrees_counted(port):
        return int(window.getMotorPosition(str(port)))

# ── motor_pair ─────────────────────────────────────────────────────────────────

_MM_PER_MS = 0.9  # robot speed at 100% velocity (mm per ms)

class motor_pair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2

    @staticmethod
    def pair(pair_id, left_port, right_port):
        return _q({'type': 'pair', 'pair_id': pair_id,
                   'left': str(left_port), 'right': str(right_port)})

    @staticmethod
    def unpair(pair_id):
        return _Awaitable()

    # ── Real Spike Prime v3 move API ──────────────────────────────────────────

    @staticmethod
    def move_for_time(pair_id, duration, steering=0, velocity=1000):
        """Move for `duration` milliseconds."""
        v = velocity / 1000.0
        dist_cm = abs(v) * _MM_PER_MS * abs(duration) / 10.0
        return _q({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                   'speed': velocity, 'amount': dist_cm, 'unit': 'cm'})

    @staticmethod
    def move_for_degrees(pair_id, degrees, steering=0, velocity=1000):
        """Move until wheels rotate by `degrees`."""
        return _q({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                   'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_for_rotations(pair_id, rotations, steering=0, velocity=1000):
        """Move for `rotations` full wheel rotations."""
        return _q({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                   'speed': velocity, 'amount': rotations, 'unit': 'rotations'})

    # ── Simulator-specific API (kept for backward compat) ─────────────────────

    @staticmethod
    def move(pair_id, steering, speed=500, amount=0, unit='degrees',
             acceleration=100, deceleration=100):
        return _q({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                   'speed': speed, 'amount': amount, 'unit': unit})

    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees',
                  acceleration=100, deceleration=100):
        return _q({'type': 'move_tank', 'pair_id': pair_id,
                   'left_speed': left_speed, 'right_speed': right_speed,
                   'amount': amount, 'unit': unit})

    @staticmethod
    def start(pair_id, steering=0, speed=500):
        return _q({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': speed})

    @staticmethod
    def start_tank(pair_id, left_speed, right_speed):
        return _q({'type': 'start_tank', 'pair_id': pair_id,
                   'left_speed': left_speed, 'right_speed': right_speed})

    @staticmethod
    def start_at_power(pair_id, power, steering=0):
        return _q({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': power * 10})

    @staticmethod
    def stop(pair_id, stop=1):
        return _q({'type': 'stop', 'pair_id': pair_id})

    @staticmethod
    def get_default_speed():
        return 500

# ── color_sensor ───────────────────────────────────────────────────────────────

class color_sensor:
    @staticmethod
    def color(port):
        return str(window.getColorSensorColor())

    @staticmethod
    def reflection(port):
        return int(window.getColorSensorReflection())

    @staticmethod
    def ambient_light(port):
        return int(window.getColorSensorAmbient())

    @staticmethod
    def rgb(port):
        raw = window.getColorSensorRGB()
        return (int(raw[0]), int(raw[1]), int(raw[2]))

    @staticmethod
    def rgbi(port):
        raw = window.getColorSensorRGB()
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)

# ── distance_sensor ────────────────────────────────────────────────────────────

class distance_sensor:
    @staticmethod
    def distance(port):
        return int(window.getDistanceSensorValue())

    @staticmethod
    def presence(port):
        return bool(window.getDistanceSensorPresence())

    @staticmethod
    def get_distance_cm(port):
        return int(window.getDistanceSensorValue()) / 10

    @staticmethod
    def get_distance_inches(port):
        return int(window.getDistanceSensorValue()) / 25.4

# ── force_sensor ───────────────────────────────────────────────────────────────

class force_sensor:
    @staticmethod
    def force(port):
        return int(window.getForceSensorValue())

    @staticmethod
    def pressed(port):
        return bool(window.getForceSensorPressed())

    @staticmethod
    def raw(port):
        return int(window.getForceSensorValue())

# ── Hub ────────────────────────────────────────────────────────────────────────

class _LightMatrix:
    def write(self, text):
        return _q({'type': 'hub_display', 'text': str(text)})

    def show_image(self, image):
        return _q({'type': 'hub_image', 'image': str(image)})

    def set_pixel(self, x, y, brightness=100):
        return _q({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': brightness})

    def show(self, image):
        return _q({'type': 'hub_image', 'image': str(image)})

    def off(self):
        return _q({'type': 'hub_display_off'})

class _Speaker:
    def beep(self, note=60, seconds=0.2, volume=100):
        return _q({'type': 'beep', 'note': note, 'duration': seconds})

    def play_notes(self, notes, tempo=120):
        return _q({'type': 'play_notes', 'notes': list(notes), 'tempo': tempo})

    def stop(self):
        return _Awaitable()

class _Motion:
    def tilt_angles(self):         return (0, 0, 0)
    def angular_velocity(self):    return (0, 0, 0)
    def acceleration(self):        return (0, 0, 981)
    def reset_yaw_angle(self):     return _Awaitable()
    def get_yaw_angle(self):       return 0

class _Button:
    def pressed(self, button):     return False
    def was_pressed(self, button): return False

class _Hub:
    def __init__(self):
        self.light_matrix = _LightMatrix()
        self.speaker = _Speaker()
        self.motion = _Motion()
        self.button = _Button()

hub = _Hub()

# ── runloop ────────────────────────────────────────────────────────────────────

class runloop:
    @staticmethod
    def run(coro):
        # Drive the coroutine to completion synchronously. All our awaitables
        # complete immediately (no real event-loop yielding needed), so the
        # entire async def main() executes in a single trampoline pass and
        # builds up _cmds before JS animates them.
        try:
            while True:
                coro.send(None)
        except StopIteration:
            pass

# ── wait ───────────────────────────────────────────────────────────────────────

def wait(ms):
    return _q({'type': 'wait', 'ms': int(ms)})

# ── print override ─────────────────────────────────────────────────────────────

_orig_print = builtins.print

def _py_print(*args, **kwargs):
    text = kwargs.get('sep', ' ').join(str(a) for a in args)
    window.appendOutput(text)
    _orig_print(*args, **kwargs)

builtins.print = _py_print

# ── Module injection — enables real import-style FLL code ──────────────────────
# Supports:
#   from hub import port, light_matrix, sound
#   from app import sound
#   import motor, motor_pair, runloop, color_sensor, distance_sensor, force_sensor

class _HubModule:
    light_matrix = hub.light_matrix
    speaker      = hub.speaker
    sound        = hub.speaker   # alias used in some FLL programs
    motion       = hub.motion
    button       = hub.button
    port         = port          # from hub import port → lowercase port

class _AppModule:
    sound = hub.speaker          # from app import sound

sys.modules['hub']             = _HubModule()
sys.modules['app']             = _AppModule()
sys.modules['motor']           = motor
sys.modules['motor_pair']      = motor_pair
sys.modules['runloop']         = runloop
sys.modules['color_sensor']    = color_sensor
sys.modules['distance_sensor'] = distance_sensor
sys.modules['force_sensor']    = force_sensor
sys.modules['color']           = color

# ── User code runner ───────────────────────────────────────────────────────────

def run_user_code(code):
    global _cmds
    _cmds = []

    # Pre-populate namespace so direct use without imports still works
    ns = {
        '__name__': '__main__',
        'motor':           motor,
        'motor_pair':      motor_pair,
        'color_sensor':    color_sensor,
        'distance_sensor': distance_sensor,
        'force_sensor':    force_sensor,
        'hub':             hub,
        'color':           color,
        'Port':            Port,
        'port':            port,
        'wait':            wait,
        'runloop':         runloop,
        'print':           _py_print,
    }

    try:
        exec(compile(str(code), '<user>', 'exec'), ns)
        window.receiveCommands(json.dumps(_cmds))
    except Exception as exc:
        window.appendOutput('[Error] ' + str(type(exc).__name__) + ': ' + str(exc))
    finally:
        _cmds = []

window.pyRunCode = run_user_code
window.onPyReady()
