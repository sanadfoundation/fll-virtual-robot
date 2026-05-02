import json
import builtins
import sys

# ── SAB bridge state ──────────────────────────────────────────────────────────
# Set by _init_bridge() when the worker receives the SharedArrayBuffer.

_flag_view  = None   # Int32Array over SAB [flag, cmd_len, result_len]
_cmd_buf    = None   # Uint8Array  over SAB bytes 12–4107
_result_buf = None   # Uint8Array  over SAB bytes 4108–5131
_state      = {}     # last result from main thread; pre-populated by _init_bridge


def _bridge_call(cmd):
    from js import Atomics
    cmd_bytes = json.dumps(cmd).encode('utf-8')
    for i, b in enumerate(cmd_bytes):
        _cmd_buf[i] = b
    Atomics.store(_flag_view, 1, len(cmd_bytes))   # cmd_len
    Atomics.store(_flag_view, 0, 1)                # flag = command pending
    Atomics.notify(_flag_view, 0, 1)               # wake main thread
    Atomics.wait(_flag_view, 0, 1)                 # block until flag != 1
    result_len = Atomics.load(_flag_view, 2)
    result_bytes = bytes(_result_buf[i] for i in range(result_len))
    _state.update(json.loads(result_bytes.decode('utf-8')))
    if _state.get('stopped'):
        raise SystemExit


def _init_bridge(sab):
    global _flag_view, _cmd_buf, _result_buf, _state
    from js import Int32Array, Uint8Array
    _flag_view  = Int32Array.new(sab)
    _cmd_buf    = Uint8Array.new(sab, 12, 4096)
    _result_buf = Uint8Array.new(sab, 4108, 1024)
    _state      = {}
    _bridge_call({'type': 'read_sensors'})   # pre-populate _state


# ── _Awaitable ────────────────────────────────────────────────────────────────
# API methods call _bridge_call() (which blocks) then return this so that
# `await motor_pair.move(...)` works in async def main() programs.

class _Awaitable:
    def __iter__(self):   return self
    def __next__(self):   raise StopIteration(None)
    def __await__(self):  return self   # CPython compat


# ── color ─────────────────────────────────────────────────────────────────────

class color:
    BLACK = 'black';  RED = 'red';      GREEN = 'green';   YELLOW = 'yellow'
    BLUE  = 'blue';   WHITE = 'white';  CYAN  = 'cyan';    MAGENTA = 'magenta'
    ORANGE = 'orange'; NONE = 'none'


# ── port ──────────────────────────────────────────────────────────────────────

class port:
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'

Port = port


# ── motor ─────────────────────────────────────────────────────────────────────

class motor:
    @staticmethod
    def run_for_degrees(p, degrees, velocity=500, stop=1, acceleration=100, deceleration=100):
        _bridge_call({'type': 'motor_degrees', 'port': str(p), 'degrees': degrees, 'velocity': velocity})
        return _Awaitable()

    @staticmethod
    def run_for_time(p, duration, velocity=500, stop=1, acceleration=100, deceleration=100):
        _bridge_call({'type': 'motor_time', 'port': str(p), 'time_ms': duration, 'velocity': velocity})
        return _Awaitable()

    @staticmethod
    def run_to_absolute_position(p, position, velocity=500, stop=1, direction=1):
        _bridge_call({'type': 'motor_degrees', 'port': str(p), 'degrees': int(position), 'velocity': velocity})
        return _Awaitable()

    @staticmethod
    def run_to_relative_position(p, position, velocity=500, stop=1):
        _bridge_call({'type': 'motor_degrees', 'port': str(p), 'degrees': int(position), 'velocity': velocity})
        return _Awaitable()

    @staticmethod
    def run(p, velocity=500):
        _bridge_call({'type': 'motor_run', 'port': str(p), 'velocity': velocity})
        return _Awaitable()

    @staticmethod
    def stop(p, stop=1):
        _bridge_call({'type': 'motor_stop', 'port': str(p)})
        return _Awaitable()

    @staticmethod
    def get_speed(p):
        return 0

    @staticmethod
    def get_position(p):
        return (_state.get('motors') or {}).get(str(p), 0)

    @staticmethod
    def get_degrees_counted(p):
        return (_state.get('motors') or {}).get(str(p), 0)


# ── motor_pair ────────────────────────────────────────────────────────────────

_MM_PER_MS = 0.9

class motor_pair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2

    @staticmethod
    def pair(pair_id, left_port, right_port):
        _bridge_call({'type': 'pair', 'pair_id': pair_id,
                      'left': str(left_port), 'right': str(right_port)})
        return _Awaitable()

    @staticmethod
    def unpair(pair_id):
        return _Awaitable()

    @staticmethod
    def move_for_time(pair_id, duration, steering=0, velocity=1000):
        v = velocity / 1000.0
        dist_cm = abs(v) * _MM_PER_MS * abs(duration) / 10.0
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                      'speed': velocity, 'amount': dist_cm, 'unit': 'cm'})
        return _Awaitable()

    @staticmethod
    def move_for_degrees(pair_id, degrees, steering=0, velocity=1000):
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                      'speed': velocity, 'amount': degrees, 'unit': 'degrees'})
        return _Awaitable()

    @staticmethod
    def move_for_rotations(pair_id, rotations, steering=0, velocity=1000):
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                      'speed': velocity, 'amount': rotations, 'unit': 'rotations'})
        return _Awaitable()

    @staticmethod
    def move(pair_id, steering, speed=500, amount=0, unit='degrees',
             acceleration=100, deceleration=100):
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering,
                      'speed': speed, 'amount': amount, 'unit': unit})
        return _Awaitable()

    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees',
                  acceleration=100, deceleration=100):
        _bridge_call({'type': 'move_tank', 'pair_id': pair_id,
                      'left_speed': left_speed, 'right_speed': right_speed,
                      'amount': amount, 'unit': unit})
        return _Awaitable()

    @staticmethod
    def start(pair_id, steering=0, speed=500):
        _bridge_call({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': speed})
        return _Awaitable()

    @staticmethod
    def start_tank(pair_id, left_speed, right_speed):
        _bridge_call({'type': 'start_tank', 'pair_id': pair_id,
                      'left_speed': left_speed, 'right_speed': right_speed})
        return _Awaitable()

    @staticmethod
    def start_at_power(pair_id, power, steering=0):
        _bridge_call({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': power * 10})
        return _Awaitable()

    @staticmethod
    def stop(pair_id, stop=1):
        _bridge_call({'type': 'stop', 'pair_id': pair_id})
        return _Awaitable()

    @staticmethod
    def get_default_speed():
        return 500


# ── color_sensor ──────────────────────────────────────────────────────────────

class color_sensor:
    @staticmethod
    def color(p):
        return str(_state.get('color', 'none'))

    @staticmethod
    def reflection(p):
        return int(_state.get('reflection', 50))

    @staticmethod
    def ambient_light(p):
        return 30

    @staticmethod
    def rgb(p):
        raw = _state.get('rgb', [128, 128, 128])
        return (int(raw[0]), int(raw[1]), int(raw[2]))

    @staticmethod
    def rgbi(p):
        raw = _state.get('rgb', [128, 128, 128])
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)


# ── distance_sensor ───────────────────────────────────────────────────────────

class distance_sensor:
    @staticmethod
    def distance(p):
        return int(_state.get('distance_mm', 300))

    @staticmethod
    def presence(p):
        return int(_state.get('distance_mm', 300)) < 100

    @staticmethod
    def get_distance_cm(p):
        return _state.get('distance_mm', 300) / 10

    @staticmethod
    def get_distance_inches(p):
        return _state.get('distance_mm', 300) / 25.4


# ── force_sensor ──────────────────────────────────────────────────────────────

class force_sensor:
    @staticmethod
    def force(p):        return 0
    @staticmethod
    def pressed(p):      return False
    @staticmethod
    def raw(p):          return 0


# ── Hub ───────────────────────────────────────────────────────────────────────

class _LightMatrix:
    def write(self, text):
        _bridge_call({'type': 'hub_display', 'text': str(text)})
        return _Awaitable()

    def show_image(self, image):
        _bridge_call({'type': 'hub_image', 'image': str(image)})
        return _Awaitable()

    def set_pixel(self, x, y, brightness=100):
        _bridge_call({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': brightness})
        return _Awaitable()

    def show(self, image):
        _bridge_call({'type': 'hub_image', 'image': str(image)})
        return _Awaitable()

    def off(self):
        _bridge_call({'type': 'hub_display_off'})
        return _Awaitable()


class _Speaker:
    def beep(self, note=60, seconds=0.2, volume=100):
        _bridge_call({'type': 'beep', 'note': note, 'duration': seconds})
        return _Awaitable()

    def play_notes(self, notes, tempo=120):
        _bridge_call({'type': 'play_notes', 'notes': list(notes), 'tempo': tempo})
        return _Awaitable()

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
        self.motion  = _Motion()
        self.button  = _Button()

hub = _Hub()


# ── runloop ───────────────────────────────────────────────────────────────────

class runloop:
    @staticmethod
    def run(coro):
        # Drive the coroutine to completion. _bridge_call blocks synchronously
        # per command, so the entire program executes sequentially in one pass.
        try:
            while True:
                coro.send(None)
        except StopIteration:
            pass


# ── wait ──────────────────────────────────────────────────────────────────────

def wait(ms):
    _bridge_call({'type': 'wait', 'ms': int(ms)})
    return _Awaitable()


# ── print override ────────────────────────────────────────────────────────────

_orig_print = builtins.print

def _py_print(*args, **kwargs):
    text = kwargs.get('sep', ' ').join(str(a) for a in args)
    _bridge_call({'type': 'print', 'text': text})
    _orig_print(*args, **kwargs)

builtins.print = _py_print


# ── Module injection ──────────────────────────────────────────────────────────

class _HubModule:
    light_matrix = hub.light_matrix
    speaker      = hub.speaker
    sound        = hub.speaker
    motion       = hub.motion
    button       = hub.button
    port         = port

class _AppModule:
    sound = hub.speaker

sys.modules['hub']             = _HubModule()
sys.modules['app']             = _AppModule()
sys.modules['motor']           = motor
sys.modules['motor_pair']      = motor_pair
sys.modules['runloop']         = runloop
sys.modules['color_sensor']    = color_sensor
sys.modules['distance_sensor'] = distance_sensor
sys.modules['force_sensor']    = force_sensor
sys.modules['color']           = color


# ── Worker message handler ────────────────────────────────────────────────────

import js

def _on_message(event):
    data = event.data.to_py()
    if data['type'] == 'sab':
        _init_bridge(data['sab'])
        js.postMessage({'type': 'ready_ack'})
    elif data['type'] == 'run':
        try:
            exec(data['code'], {})
            js.postMessage({'type': 'done'})
        except SystemExit:
            js.postMessage({'type': 'done'})
        except Exception as e:
            js.postMessage({'type': 'error', 'message': str(type(e).__name__) + ': ' + str(e)})

js.addEventListener('message', _on_message)
js.postMessage({'type': 'ready'})
