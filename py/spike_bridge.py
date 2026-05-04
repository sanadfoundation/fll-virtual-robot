import json
import sys
import math
import builtins
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
    return _await_and_update(js.bridgeSend(json.dumps(cmd)))

class _NoopAwaitable:
    def __iter__(self):  return self
    def __next__(self):  raise StopIteration(None)
    def __await__(self): return self

async def _await_and_update(promise):
    """Awaits the JS Promise, updates _state from its JSON reply."""
    result_str = await promise
    _state.update(json.loads(str(result_str)))
    if _state.get('stopped'):
        raise SystemExit

_COLOR_INT_MAP = {
    'none': -1, 'black': 0, 'magenta': 1, 'purple': 2, 'blue': 3,
    'azure': 4, 'turquoise': 5, 'green': 6, 'yellow': 7,
    'orange': 8, 'red': 9, 'white': 10,
}

# ── Phase 3: Spike Prime v3 API ──────────────────────────────────────────────
class color:
    BLACK     = 0
    MAGENTA   = 1
    PURPLE    = 2
    BLUE      = 3
    AZURE     = 4
    TURQUOISE = 5
    GREEN     = 6
    YELLOW    = 7
    ORANGE    = 8
    RED       = 9
    WHITE     = 10
    UNKNOWN   = -1

class port:
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'

Port = port

class motor:
    # Stop-mode constants
    COAST       = 0
    BRAKE       = 1
    HOLD        = 2
    CONTINUE    = 3
    SMART_COAST = 4
    SMART_BRAKE = 5
    # Direction constants
    CLOCKWISE        = 0
    COUNTERCLOCKWISE = 1
    SHORTEST_PATH    = 2
    LONGEST_PATH     = 3
    # Status constants
    READY        = 0
    RUNNING      = 1
    STALLED      = 2
    CANCELLED    = 3
    ERROR        = 4
    DISCONNECTED = 5

    @staticmethod
    def run_for_degrees(port, degrees, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _bridge_call({'type': 'motor_degrees', 'port': str(port), 'degrees': degrees, 'velocity': velocity})

    @staticmethod
    def run_for_time(port, duration, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _bridge_call({'type': 'motor_time', 'port': str(port), 'time_ms': duration, 'velocity': velocity})

    @staticmethod
    def run_to_absolute_position(port, position, velocity=360, *, direction=2, stop=1, acceleration=1000, deceleration=1000):
        return _bridge_call({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run_to_relative_position(port, position, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _bridge_call({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run(port, velocity=360, *, acceleration=1000):
        return _bridge_call({'type': 'motor_run', 'port': str(port), 'velocity': velocity})

    @staticmethod
    def stop(port, *, stop=1):
        return _bridge_call({'type': 'motor_stop', 'port': str(port)})

    @staticmethod
    def velocity(port):
        return 0

    @staticmethod
    def absolute_position(port):
        return int((_state.get('motors') or {}).get(str(port), 0))

    @staticmethod
    def relative_position(port):
        return int((_state.get('motors') or {}).get(str(port), 0))

    @staticmethod
    def reset_relative_position(port, position=0):
        return _NoopAwaitable()

    @staticmethod
    def get_duty_cycle(port):
        return 0

    @staticmethod
    def set_duty_cycle(port, pwm):
        return _NoopAwaitable()


class motor_pair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2

    @staticmethod
    def pair(pair, left_motor, right_motor):
        return _bridge_call({'type': 'pair', 'pair_id': pair,
                             'left': str(left_motor), 'right': str(right_motor)})

    @staticmethod
    def unpair(pair):
        return _NoopAwaitable()

    @staticmethod
    def move(pair, steering, *, velocity=360, acceleration=1000):
        return _bridge_call({'type': 'start', 'pair_id': pair, 'steering': steering, 'speed': velocity})

    @staticmethod
    def move_for_degrees(pair, degrees, steering=0, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        return _bridge_call({'type': 'move', 'pair_id': pair, 'steering': steering,
                             'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_for_time(pair, duration, steering=0, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        degrees = velocity * (duration / 1000.0)
        return _bridge_call({'type': 'move', 'pair_id': pair, 'steering': steering,
                             'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=1, acceleration=1000, deceleration=1000):
        max_v = max(abs(left_velocity), abs(right_velocity), 1)
        degrees = max_v * (duration / 1000.0)
        return _bridge_call({'type': 'move_tank', 'pair_id': pair,
                             'left_speed': left_velocity, 'right_speed': right_velocity,
                             'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def stop(pair, *, stop=1):
        return _bridge_call({'type': 'stop', 'pair_id': pair})

    # ── Backward-compat aliases (positional, not in completions) ───────────────
    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees',
                  acceleration=100, deceleration=100):
        return _bridge_call({'type': 'move_tank', 'pair_id': pair_id,
                             'left_speed': left_speed, 'right_speed': right_speed,
                             'amount': amount, 'unit': unit})


class color_sensor:
    @staticmethod
    def color(port):
        return int(_COLOR_INT_MAP.get(str(_state.get('color', 'none')), -1))

    @staticmethod
    def reflection(port):
        return int(_state.get('reflection', 50))

    @staticmethod
    def rgbi(port):
        raw = _state.get('rgb', [128, 128, 128])
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)


class distance_sensor:
    @staticmethod
    def distance(port):
        v = int(_state.get('distance_mm', 300))
        return v if v < 9999 else -1

    @staticmethod
    def clear(port):
        pass

    @staticmethod
    def get_pixel(port, x, y):
        return 0

    @staticmethod
    def set_pixel(port, x, y, intensity):
        pass

    @staticmethod
    def show(port, pixels):
        pass


class force_sensor:
    @staticmethod
    def force(port):   return 0

    @staticmethod
    def pressed(port): return False

    @staticmethod
    def raw(port):     return 0


class _LightMatrix:
    def write(self, text, intensity=100, time_per_character=500):
        return _bridge_call({'type': 'hub_display', 'text': str(text)})

    def show(self, pixels):
        return _bridge_call({'type': 'hub_image', 'image': 'CUSTOM'})

    def show_image(self, image):
        return _bridge_call({'type': 'hub_image', 'image': str(image)})

    def set_pixel(self, x, y, intensity=100):
        return _bridge_call({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': intensity})

    def get_pixel(self, x, y):
        return 0

    def clear(self):
        return _bridge_call({'type': 'hub_display_off'})

    def off(self):
        return _bridge_call({'type': 'hub_display_off'})

    def get_orientation(self):
        return 0

    def set_orientation(self, top):
        return 0


class _Speaker:
    def beep(self, freq=440, duration=500, volume=100, *,
             attack=0, decay=0, sustain=100, release=0, transition=10):
        # Convert Hz → MIDI note for the simulator's audio engine
        note = round(69 + 12 * math.log2(freq / 440)) if freq > 0 else 69
        return _bridge_call({'type': 'beep', 'note': note, 'duration': duration / 1000.0})

    def stop(self):
        return _NoopAwaitable()

    def volume(self, volume):
        return _NoopAwaitable()


class _MotionSensor:
    TAPPED        = 0
    DOUBLE_TAPPED = 1
    SHAKEN        = 2
    FALLING       = 3
    UNKNOWN       = -1
    TOP    = 0; FRONT  = 1; RIGHT  = 2
    BOTTOM = 3; BACK   = 4; LEFT   = 5

    def tilt_angles(self):                            return (0, 0, 0)
    def angular_velocity(self, raw_unfiltered=False): return (0, 0, 0)
    def acceleration(self, raw_unfiltered=False):     return (0, 0, 981)
    def reset_yaw(self, angle=0):                     return _NoopAwaitable()
    def gesture(self):                                return self.UNKNOWN
    def stable(self):                                 return True
    def up_face(self):                                return self.TOP
    def quaternion(self):                             return (1.0, 0.0, 0.0, 0.0)
    def tap_count(self):                              return 0
    def reset_tap_count(self):                        pass
    def get_yaw_face(self):                           return self.TOP
    def set_yaw_face(self, up):                       return True


class _Button:
    LEFT  = 1
    RIGHT = 2

    def pressed(self, button):     return 0
    def was_pressed(self, button): return False


class _Light:
    POWER   = 0
    CONNECT = 1

    def color(self, light, c): pass


class _Hub:
    def __init__(self):
        self.light_matrix  = _LightMatrix()
        self.speaker       = _Speaker()
        self.sound         = self.speaker   # alias
        self.motion_sensor = _MotionSensor()
        self.button        = _Button()
        self.light         = _Light()

    def device_uuid(self): return 'simulator'
    def hardware_id(self): return 'simulator'
    def power_off(self):   return 0
    def temperature(self): return 250


hub = _Hub()

# Stores the user's coroutine from runloop.run() so _handle_run can await it.
_user_coro = None

class runloop:
    @staticmethod
    def run(*funcs):
        global _user_coro
        if _test_intercept is not None:
            # Test mode: drive synchronously — _NoopAwaitable terminates
            # immediately, so commands captured by _test_intercept are
            # recorded in order.
            for coro in funcs:
                try:
                    while True:
                        coro.send(None)
                except StopIteration:
                    pass
        else:
            # Production: store coroutine(s) for _handle_run to await on the
            # asyncio loop (where JS Promises actually resolve).
            if len(funcs) == 1:
                _user_coro = funcs[0]
            else:
                async def _all():
                    for c in funcs:
                        await c
                _user_coro = _all()

    @staticmethod
    def sleep_ms(duration):
        return _bridge_call({'type': 'wait', 'ms': int(duration)})

    @staticmethod
    def until(function, timeout=0):
        return _NoopAwaitable()


def wait(ms):
    return _bridge_call({'type': 'wait', 'ms': int(ms)})


# ── Phase 4: print override ──────────────────────────────────────────────────
_orig_print = builtins.print

def _py_print(*args, **kwargs):
    text = kwargs.get('sep', ' ').join(str(a) for a in args)
    _bridge_call({'type': 'print', 'text': text})
    _orig_print(*args, **kwargs)

builtins.print = _py_print


# ── Phase 5: SPIKE3 stub modules ─────────────────────────────────────────────
class orientation:
    UP = 0; RIGHT = 1; DOWN = 2; LEFT = 3


class device:
    @staticmethod
    def data(port):                       return ()
    @staticmethod
    def id(port):                         return 0
    @staticmethod
    def ready(port):                      return False
    @staticmethod
    def get_duty_cycle(port):             return 0
    @staticmethod
    def set_duty_cycle(port, duty_cycle): pass


class color_matrix:
    @staticmethod
    def clear(port):                  pass
    @staticmethod
    def get_pixel(port, x, y):        return (0, 0)
    @staticmethod
    def set_pixel(port, x, y, pixel): pass
    @staticmethod
    def show(port, pixels):           pass


class _AppSound:
    @staticmethod
    def play(sound_name, volume=100, pitch=0, pan=0): return _NoopAwaitable()
    @staticmethod
    def stop():                                       return _NoopAwaitable()
    @staticmethod
    def set_attributes(volume, pitch, pan):           pass


class _AppMusic:
    DRUM_SNARE=1; DRUM_BASS=2; DRUM_SIDE_STICK=3; DRUM_CRASH_CYMBAL=4
    INSTRUMENT_PIANO=1; INSTRUMENT_ELECTRIC_PIANO=2; INSTRUMENT_ORGAN=3
    INSTRUMENT_GUITAR=4; INSTRUMENT_ELECTRIC_GUITAR=5; INSTRUMENT_BASS=6
    INSTRUMENT_PIZZICATO=7; INSTRUMENT_CELLO=8; INSTRUMENT_TROMBONE=9
    INSTRUMENT_CLARINET=10; INSTRUMENT_SAXOPHONE=11; INSTRUMENT_FLUTE=12
    INSTRUMENT_WOODEN_FLUTE=13; INSTRUMENT_BASSOON=14; INSTRUMENT_CHOIR=15
    INSTRUMENT_VIBRAPHONE=16; INSTRUMENT_MUSIC_BOX=17; INSTRUMENT_STEEL_DRUM=18
    INSTRUMENT_MARIMBA=19; INSTRUMENT_SYNTH_LEAD=20; INSTRUMENT_SYNTH_PAD=21

    @staticmethod
    def play_drum(drum):                             pass
    @staticmethod
    def play_instrument(instrument, note, duration): pass


class _AppDisplay:
    IMAGE_ROBOT_1=1; IMAGE_ROBOT_2=2; IMAGE_ROBOT_3=3; IMAGE_ROBOT_4=4
    IMAGE_ROBOT_5=5; IMAGE_AMUSEMENT_PARK=6; IMAGE_BEACH=7
    IMAGE_HAUNTED_HOUSE=8; IMAGE_MOON=9; IMAGE_RAINBOW=10
    IMAGE_EMPTY=11; IMAGE_RANDOM=21

    @staticmethod
    def show(fullscreen=False): pass
    @staticmethod
    def hide():                 pass
    @staticmethod
    def image(image):           pass
    @staticmethod
    def text(text):             pass


class _AppBarGraph:
    @staticmethod
    def show(fullscreen=False):  pass
    @staticmethod
    def hide():                  pass
    @staticmethod
    def set_value(color, value): pass
    @staticmethod
    def change(color, value):    pass
    @staticmethod
    def get_value(color):        return _NoopAwaitable()
    @staticmethod
    def clear_all():             pass


class _AppLineGraph:
    @staticmethod
    def show(fullscreen=False): pass
    @staticmethod
    def hide():                 pass
    @staticmethod
    def plot(color, x, y):      pass
    @staticmethod
    def clear(color):           pass
    @staticmethod
    def clear_all():            pass
    @staticmethod
    def get_last(color):        return _NoopAwaitable()
    @staticmethod
    def get_average(color):     return _NoopAwaitable()
    @staticmethod
    def get_min(color):         return _NoopAwaitable()
    @staticmethod
    def get_max(color):         return _NoopAwaitable()


class _App:
    sound     = _AppSound()
    music     = _AppMusic()
    display   = _AppDisplay()
    bargraph  = _AppBarGraph()
    linegraph = _AppLineGraph()


app = _App()


# ── Phase 6: Module injection ────────────────────────────────────────────────
class _HubModule:
    light_matrix  = hub.light_matrix
    speaker       = hub.speaker
    sound         = hub.speaker
    motion_sensor = hub.motion_sensor
    button        = hub.button
    light         = hub.light
    port          = port

    def device_uuid(self): return hub.device_uuid()
    def hardware_id(self): return hub.hardware_id()
    def power_off(self):   return hub.power_off()
    def temperature(self): return hub.temperature()


sys.modules['hub']             = _HubModule()
sys.modules['app']             = app
sys.modules['motor']           = motor
sys.modules['motor_pair']      = motor_pair
sys.modules['runloop']         = runloop
sys.modules['color_sensor']    = color_sensor
sys.modules['distance_sensor'] = distance_sensor
sys.modules['force_sensor']    = force_sensor
sys.modules['color']           = color
sys.modules['orientation']     = orientation
sys.modules['device']          = device
sys.modules['color_matrix']    = color_matrix


# ── Phase 7: Worker message handler ──────────────────────────────────────────
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

# Main thread uses xworker.ready Promise to detect worker readiness,
# so we don't post a 'ready' message here — that would trigger polyscript's
# internal one-shot RPC listener and fire a runEvent console error.
js.addEventListener('message', _on_message)
