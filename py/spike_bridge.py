import json
import sys
import js

def _jsobj(d):
    return js.JSON.parse(json.dumps(d))

# ── Phase 1: SAB state and bridge functions ──────────────────────────────────
# _flag_view  : Int32Array — header slots [flag, cmd_len, result_len]
# _byte_view  : Uint8Array — entire SAB (for absolute-offset byte reads/writes)
# SAB layout  : bytes 0-11 = Int32 header, 12-4107 = cmd, 4108-5131 = result, 5132-5135 = status
_flag_view  = None
_byte_view  = None
_state      = {}

_CMD_OFFSET    = 12
_RESULT_OFFSET = 4108
_STATUS_IDX    = 1283   # Int32Array index for status slot (SAB byte 5132)
_STATUS_READY_ACK = 1
_STATUS_DONE      = 2
_STATUS_ERROR     = 3

def _bridge_call(cmd):
    from js import Atomics
    cmd_bytes = json.dumps(cmd).encode('utf-8')
    n = len(cmd_bytes)
    # Atomics.store per byte — guaranteed to reach shared memory in MicroPython.
    for i, b in enumerate(cmd_bytes):
        Atomics.store(_byte_view, _CMD_OFFSET + i, b)
    Atomics.store(_flag_view, 1, n)
    Atomics.store(_flag_view, 0, 1)
    Atomics.notify(_flag_view, 0, 1)
    Atomics.wait(_flag_view, 0, 1)
    result_len = int(Atomics.load(_flag_view, 2))
    result_bytes = bytes(int(Atomics.load(_byte_view, _RESULT_OFFSET + i))
                         for i in range(result_len))
    _state.update(json.loads(result_bytes.decode('utf-8')))
    if _state.get('stopped'):
        raise SystemExit

def _signal_status(code):
    from js import Atomics
    Atomics.store(_flag_view, _STATUS_IDX, code)
    Atomics.notify(_flag_view, _STATUS_IDX, 1)

def _signal_error(e):
    from js import Atomics
    payload = json.dumps({'message': str(type(e).__name__) + ': ' + str(e)}).encode('utf-8')
    for i, b in enumerate(payload):
        Atomics.store(_byte_view, _RESULT_OFFSET + i, b)
    Atomics.store(_flag_view, 2, len(payload))
    _signal_status(_STATUS_ERROR)

def _init_bridge(sab):
    global _flag_view, _byte_view, _state
    from js import Int32Array, Uint8Array
    _flag_view = Int32Array.new(sab)
    _byte_view = Uint8Array.new(sab)
    _state     = {}
    _bridge_call({'type': 'read_sensors'})

# ── Phase 2: All class/constant definitions ──────────────────────────────────
class _Awaitable:
    def __iter__(self):   return self
    def __next__(self):   raise StopIteration(None)
    def __await__(self):  return self

class color:
    BLACK = 'black';  RED = 'red';      GREEN = 'green';   YELLOW = 'yellow'
    BLUE  = 'blue';   WHITE = 'white';  CYAN  = 'cyan';    MAGENTA = 'magenta'
    ORANGE = 'orange'; NONE = 'none'

class port:
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'

Port = port

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
    def get_speed(p):   return 0
    @staticmethod
    def get_position(p):         return (_state.get('motors') or {}).get(str(p), 0)
    @staticmethod
    def get_degrees_counted(p):  return (_state.get('motors') or {}).get(str(p), 0)

_MM_PER_MS = 0.9

class motor_pair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2
    @staticmethod
    def pair(pair_id, left_port, right_port):
        _bridge_call({'type': 'pair', 'pair_id': pair_id, 'left': str(left_port), 'right': str(right_port)})
        return _Awaitable()
    @staticmethod
    def unpair(pair_id): return _Awaitable()
    @staticmethod
    def move_for_time(pair_id, duration, steering=0, velocity=1000):
        v = velocity / 1000.0
        dist_cm = abs(v) * _MM_PER_MS * abs(duration) / 10.0
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': velocity, 'amount': dist_cm, 'unit': 'cm'})
        return _Awaitable()
    @staticmethod
    def move_for_degrees(pair_id, degrees, steering=0, velocity=1000):
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': velocity, 'amount': degrees, 'unit': 'degrees'})
        return _Awaitable()
    @staticmethod
    def move_for_rotations(pair_id, rotations, steering=0, velocity=1000):
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': velocity, 'amount': rotations, 'unit': 'rotations'})
        return _Awaitable()
    @staticmethod
    def move(pair_id, steering, speed=500, amount=0, unit='degrees', acceleration=100, deceleration=100):
        _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': speed, 'amount': amount, 'unit': unit})
        return _Awaitable()
    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees', acceleration=100, deceleration=100):
        _bridge_call({'type': 'move_tank', 'pair_id': pair_id, 'left_speed': left_speed, 'right_speed': right_speed, 'amount': amount, 'unit': unit})
        return _Awaitable()
    @staticmethod
    def start(pair_id, steering=0, speed=500):
        _bridge_call({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': speed})
        return _Awaitable()
    @staticmethod
    def start_tank(pair_id, left_speed, right_speed):
        _bridge_call({'type': 'start_tank', 'pair_id': pair_id, 'left_speed': left_speed, 'right_speed': right_speed})
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
    def get_default_speed(): return 500

class color_sensor:
    @staticmethod
    def color(p):       return str(_state.get('color', 'none'))
    @staticmethod
    def reflection(p):  return int(_state.get('reflection', 50))
    @staticmethod
    def ambient_light(p): return 30
    @staticmethod
    def rgb(p):
        raw = _state.get('rgb', [128, 128, 128])
        return (int(raw[0]), int(raw[1]), int(raw[2]))
    @staticmethod
    def rgbi(p):
        raw = _state.get('rgb', [128, 128, 128])
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)

class distance_sensor:
    @staticmethod
    def distance(p):         return int(_state.get('distance_mm', 300))
    @staticmethod
    def presence(p):         return int(_state.get('distance_mm', 300)) < 100
    @staticmethod
    def get_distance_cm(p):  return _state.get('distance_mm', 300) / 10
    @staticmethod
    def get_distance_inches(p): return _state.get('distance_mm', 300) / 25.4

class force_sensor:
    @staticmethod
    def force(p):   return 0
    @staticmethod
    def pressed(p): return False
    @staticmethod
    def raw(p):     return 0

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
    def stop(self): return _Awaitable()

class _Motion:
    def tilt_angles(self):      return (0, 0, 0)
    def angular_velocity(self): return (0, 0, 0)
    def acceleration(self):     return (0, 0, 981)
    def reset_yaw_angle(self):  return _Awaitable()
    def get_yaw_angle(self):    return 0

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

class runloop:
    @staticmethod
    def run(coro):
        try:
            while True:
                coro.send(None)
        except StopIteration:
            pass

def wait(ms):
    _bridge_call({'type': 'wait', 'ms': int(ms)})
    return _Awaitable()

# ── Phase 3: print override ──────────────────────────────────────────────────
class _StdoutBridge:
    def __init__(self): self._buf = ''
    def write(self, text):
        self._buf += str(text)
        while '\n' in self._buf:
            nl = self._buf.index('\n')
            line = self._buf[:nl]
            self._buf = self._buf[nl+1:]
            if _flag_view is not None:
                _bridge_call({'type': 'print', 'text': line})
    def flush(self): pass

def _install_print_override():
    try:
        import builtins as _b
        _orig = _b.print
        def _py_print(*args, **kwargs):
            text = kwargs.get('sep', ' ').join(str(a) for a in args)
            if _flag_view is not None:
                _bridge_call({'type': 'print', 'text': text})
            _orig(*args, **kwargs)
        _b.print = _py_print
        return
    except Exception:
        pass
    try:
        sys.stdout = _StdoutBridge()
    except Exception:
        pass

_install_print_override()

# ── Phase 4: Module injection ────────────────────────────────────────────────
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

# ── Worker message handler ───────────────────────────────────────────────────
def _on_message(event):
    msg_type = str(event.data.type)
    if msg_type == 'sab':
        _init_bridge(event.data.sab)
        _signal_status(_STATUS_READY_ACK)
    elif msg_type == 'run':
        try:
            exec(str(event.data.code), {})
            _signal_status(_STATUS_DONE)
        except SystemExit:
            _signal_status(_STATUS_DONE)
        except Exception as e:
            _signal_error(e)

# Main thread uses xworker.ready Promise — no postMessage needed here.
js.addEventListener('message', _on_message)
