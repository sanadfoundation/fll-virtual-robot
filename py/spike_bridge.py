from js import window
import json
import builtins

# ── Command queue ─────────────────────────────────────────

_cmds = []

def _q(cmd):
    _cmds.append(cmd)

# ── color constants ───────────────────────────────────────

class color:
    BLACK   = 'black'
    RED     = 'red'
    GREEN   = 'green'
    YELLOW  = 'yellow'
    BLUE    = 'blue'
    WHITE   = 'white'
    CYAN    = 'cyan'
    MAGENTA = 'magenta'
    ORANGE  = 'orange'
    NONE    = 'none'

# ── motor module (Spike Prime v3) ─────────────────────────

class motor:
    @staticmethod
    def run_for_degrees(port, degrees, velocity=500, stop=1, acceleration=100, deceleration=100):
        _q({'type': 'motor_degrees', 'port': str(port), 'degrees': degrees, 'velocity': velocity})

    @staticmethod
    def run_for_time(port, duration, velocity=500, stop=1, acceleration=100, deceleration=100):
        _q({'type': 'motor_time', 'port': str(port), 'time_ms': duration, 'velocity': velocity})

    @staticmethod
    def run(port, velocity=500):
        _q({'type': 'motor_run', 'port': str(port), 'velocity': velocity})

    @staticmethod
    def stop(port, stop=1):
        _q({'type': 'motor_stop', 'port': str(port)})

    @staticmethod
    def get_speed(port):
        return int(window.getMotorSpeed(str(port)))

    @staticmethod
    def get_position(port):
        return int(window.getMotorPosition(str(port)))

    @staticmethod
    def get_degrees_counted(port):
        return int(window.getMotorPosition(str(port)))

# ── motor_pair module ─────────────────────────────────────

class motor_pair:
    PAIR_1 = 0
    PAIR_2 = 1
    PAIR_3 = 2

    @staticmethod
    def pair(pair_id, left_port, right_port):
        _q({'type': 'pair', 'pair_id': pair_id,
            'left': str(left_port), 'right': str(right_port)})

    @staticmethod
    def unpair(pair_id):
        pass  # no-op in simulator

    @staticmethod
    def move(pair_id, steering, speed=500, amount=0, unit='degrees',
             acceleration=100, deceleration=100):
        _q({'type': 'move', 'pair_id': pair_id, 'steering': steering,
            'speed': speed, 'amount': amount, 'unit': unit})

    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees',
                  acceleration=100, deceleration=100):
        _q({'type': 'move_tank', 'pair_id': pair_id,
            'left_speed': left_speed, 'right_speed': right_speed,
            'amount': amount, 'unit': unit})

    @staticmethod
    def start(pair_id, steering=0, speed=500):
        _q({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': speed})

    @staticmethod
    def start_tank(pair_id, left_speed, right_speed):
        _q({'type': 'start_tank', 'pair_id': pair_id,
            'left_speed': left_speed, 'right_speed': right_speed})

    @staticmethod
    def start_at_power(pair_id, power, steering=0):
        _q({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': power * 10})

    @staticmethod
    def stop(pair_id, stop=1):
        _q({'type': 'stop', 'pair_id': pair_id})

    @staticmethod
    def get_default_speed():
        return 500

# ── color_sensor module ───────────────────────────────────

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

# ── distance_sensor module ────────────────────────────────

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

# ── force_sensor module ───────────────────────────────────

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

# ── Hub ───────────────────────────────────────────────────

class _LightMatrix:
    def write(self, text):
        _q({'type': 'hub_display', 'text': str(text)})

    def show_image(self, image):
        _q({'type': 'hub_image', 'image': str(image)})

    def set_pixel(self, x, y, brightness=100):
        _q({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': brightness})

    def show(self, image):
        _q({'type': 'hub_image', 'image': str(image)})

    def off(self):
        _q({'type': 'hub_display_off'})

class _Speaker:
    def beep(self, note=60, seconds=0.2, volume=100):
        _q({'type': 'beep', 'note': note, 'duration': seconds})

    def play_notes(self, notes, tempo=120):
        _q({'type': 'play_notes', 'notes': list(notes), 'tempo': tempo})

    def stop(self):
        pass

class _Motion:
    def tilt_angles(self):
        return (0, 0, 0)

    def angular_velocity(self):
        return (0, 0, 0)

    def acceleration(self):
        return (0, 0, 981)

    def reset_yaw_angle(self):
        pass

    def get_yaw_angle(self):
        return 0

class _Button:
    def pressed(self, button):
        return False

    def was_pressed(self, button):
        return False

class _Hub:
    def __init__(self):
        self.light_matrix = _LightMatrix()
        self.speaker = _Speaker()
        self.motion = _Motion()
        self.button = _Button()

hub = _Hub()

# ── Port constants ────────────────────────────────────────

class Port:
    A = 'A'
    B = 'B'
    C = 'C'
    D = 'D'
    E = 'E'
    F = 'F'

# ── wait ──────────────────────────────────────────────────

def wait(ms):
    _q({'type': 'wait', 'ms': int(ms)})

# ── print override ────────────────────────────────────────

_orig_print = builtins.print

def _py_print(*args, **kwargs):
    text = kwargs.get('sep', ' ').join(str(a) for a in args)
    window.appendOutput(text)
    _orig_print(*args, **kwargs)

builtins.print = _py_print

# ── User code runner ──────────────────────────────────────

def run_user_code(code):
    global _cmds
    _cmds = []

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
        'wait':            wait,
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

# Signal that the Python bridge is ready
window.onPyReady()
