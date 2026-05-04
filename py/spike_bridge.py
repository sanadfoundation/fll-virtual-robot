import json
import sys
import js

# ── Phase 1: JS-side messaging shim ──────────────────────────────────────────
# Installed in worker globalThis. Python calls these JS functions instead of
# js.postMessage(...) directly — polyscript intercepts Python-side postMessage
# and triggers a 'runEvent' error, but JS-side self.postMessage is fine.
js.eval(
    "(function(){"
    "  var pending={}, nextId=0;"
    "  globalThis.bridgeSend=function(cmdJson){"
    "    return new Promise(function(resolve){"
    "      var id=++nextId;"
    "      pending[id]=resolve;"
    "      self.postMessage({type:'cmd',id:id,cmd:JSON.parse(cmdJson)});"
    "    });"
    "  };"
    "  globalThis.signalReady=function(){self.postMessage({type:'ready'});};"
    "  globalThis.signalDone =function(){self.postMessage({type:'done'});};"
    "  globalThis.signalError=function(msg){self.postMessage({type:'error',message:msg});};"
    "  self.addEventListener('message',function(e){"
    "    var d=e.data;"
    "    if(d&&d.type==='cmd_result'){"
    "      var r=pending[d.id]; delete pending[d.id];"
    "      if(r) r(JSON.stringify(d.result));"
    "    }"
    "  });"
    "})();"
)

# ── Phase 2: Bridge call ─────────────────────────────────────────────────────
_state = {
    'x': 350, 'y': 980, 'heading': -90,
    'color': 'none', 'distance_mm': 300,
    'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
    'stopped': False,
}

# Tests set this to capture commands without round-tripping through JS.
_test_intercept = None

def _bridge_call(cmd):
    """Send a command, return an awaitable that updates _state on reply."""
    if _test_intercept is not None:
        _test_intercept(cmd)
        return _NoopAwaitable()
    return _PromiseAwaitable(js.bridgeSend(json.dumps(cmd)))

class _NoopAwaitable:
    def __iter__(self):  return self
    def __next__(self):  raise StopIteration(None)
    def __await__(self): return self

class _PromiseAwaitable:
    """Wraps a JS Promise; awaiting it updates _state from the JSON reply."""
    def __init__(self, promise):
        self._promise = promise
    def __await__(self):
        return self._inner().__await__()
    async def _inner(self):
        result_str = await self._promise
        _state.update(json.loads(str(result_str)))
        if _state.get('stopped'):
            raise SystemExit

# ── Phase 3: Spike Prime API ─────────────────────────────────────────────────
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
        return _bridge_call({'type': 'motor_degrees', 'port': str(p), 'degrees': degrees, 'velocity': velocity})
    @staticmethod
    def run_for_time(p, duration, velocity=500, stop=1, acceleration=100, deceleration=100):
        return _bridge_call({'type': 'motor_time', 'port': str(p), 'time_ms': duration, 'velocity': velocity})
    @staticmethod
    def run_to_absolute_position(p, position, velocity=500, stop=1, direction=1):
        return _bridge_call({'type': 'motor_degrees', 'port': str(p), 'degrees': int(position), 'velocity': velocity})
    @staticmethod
    def run_to_relative_position(p, position, velocity=500, stop=1):
        return _bridge_call({'type': 'motor_degrees', 'port': str(p), 'degrees': int(position), 'velocity': velocity})
    @staticmethod
    def run(p, velocity=500):
        return _bridge_call({'type': 'motor_run', 'port': str(p), 'velocity': velocity})
    @staticmethod
    def stop(p, stop=1):
        return _bridge_call({'type': 'motor_stop', 'port': str(p)})
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
        return _bridge_call({'type': 'pair', 'pair_id': pair_id, 'left': str(left_port), 'right': str(right_port)})
    @staticmethod
    def unpair(pair_id): return _NoopAwaitable()
    @staticmethod
    def move_for_time(pair_id, duration, steering=0, velocity=1000):
        v = velocity / 1000.0
        dist_cm = abs(v) * _MM_PER_MS * abs(duration) / 10.0
        return _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': velocity, 'amount': dist_cm, 'unit': 'cm'})
    @staticmethod
    def move_for_degrees(pair_id, degrees, steering=0, velocity=1000):
        return _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': velocity, 'amount': degrees, 'unit': 'degrees'})
    @staticmethod
    def move_for_rotations(pair_id, rotations, steering=0, velocity=1000):
        return _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': velocity, 'amount': rotations, 'unit': 'rotations'})
    @staticmethod
    def move(pair_id, steering, speed=500, amount=0, unit='degrees', acceleration=100, deceleration=100):
        return _bridge_call({'type': 'move', 'pair_id': pair_id, 'steering': steering, 'speed': speed, 'amount': amount, 'unit': unit})
    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees', acceleration=100, deceleration=100):
        return _bridge_call({'type': 'move_tank', 'pair_id': pair_id, 'left_speed': left_speed, 'right_speed': right_speed, 'amount': amount, 'unit': unit})
    @staticmethod
    def start(pair_id, steering=0, speed=500):
        return _bridge_call({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': speed})
    @staticmethod
    def start_tank(pair_id, left_speed, right_speed):
        return _bridge_call({'type': 'start_tank', 'pair_id': pair_id, 'left_speed': left_speed, 'right_speed': right_speed})
    @staticmethod
    def start_at_power(pair_id, power, steering=0):
        return _bridge_call({'type': 'start', 'pair_id': pair_id, 'steering': steering, 'speed': power * 10})
    @staticmethod
    def stop(pair_id, stop=1):
        return _bridge_call({'type': 'stop', 'pair_id': pair_id})
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
        return _bridge_call({'type': 'hub_display', 'text': str(text)})
    def show_image(self, image):
        return _bridge_call({'type': 'hub_image', 'image': str(image)})
    def set_pixel(self, x, y, brightness=100):
        return _bridge_call({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': brightness})
    def show(self, image):
        return _bridge_call({'type': 'hub_image', 'image': str(image)})
    def off(self):
        return _bridge_call({'type': 'hub_display_off'})

class _Speaker:
    def beep(self, note=60, seconds=0.2, volume=100):
        return _bridge_call({'type': 'beep', 'note': note, 'duration': seconds})
    def play_notes(self, notes, tempo=120):
        return _bridge_call({'type': 'play_notes', 'notes': list(notes), 'tempo': tempo})
    def stop(self): return _NoopAwaitable()

class _Motion:
    def tilt_angles(self):      return (0, 0, 0)
    def angular_velocity(self): return (0, 0, 0)
    def acceleration(self):     return (0, 0, 981)
    def reset_yaw_angle(self):  return _NoopAwaitable()
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

# Stores the user's coroutine from runloop.run() so _handle_run can await it.
_user_coro = None

class runloop:
    @staticmethod
    def run(coro):
        # Production: store the coroutine for _handle_run to await on the
        # asyncio loop (where JS Promises actually resolve).
        # Tests: drive synchronously — _NoopAwaitable terminates immediately,
        # so commands captured by _test_intercept are recorded in order.
        global _user_coro
        if _test_intercept is not None:
            try:
                while True:
                    coro.send(None)
            except StopIteration:
                pass
        else:
            _user_coro = coro

def wait(ms):
    return _bridge_call({'type': 'wait', 'ms': int(ms)})

# ── Phase 4: print override ──────────────────────────────────────────────────
def _install_print_override():
    try:
        import builtins as _b
        _orig = _b.print
        def _py_print(*args, **kwargs):
            text = kwargs.get('sep', ' ').join(str(a) for a in args)
            _bridge_call({'type': 'print', 'text': text})
            _orig(*args, **kwargs)
        _b.print = _py_print
    except Exception:
        pass

_install_print_override()

# ── Phase 5: Module injection ────────────────────────────────────────────────
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

# ── Phase 6: Worker message handler ──────────────────────────────────────────
async def _handle_run(code):
    global _user_coro
    _user_coro = None
    try:
        exec(code, {})
        if _user_coro is not None:
            await _user_coro
        js.signalDone()
    except SystemExit:
        js.signalDone()
    except Exception as e:
        msg = str(type(e).__name__) + ': ' + str(e)
        js.signalError(msg)

try:
    import asyncio
except ImportError:
    import uasyncio as asyncio

def _on_message(event):
    msg_type = str(event.data.type)
    if msg_type == 'run':
        asyncio.create_task(_handle_run(str(event.data.code)))

js.addEventListener('message', _on_message)
js.signalReady()
