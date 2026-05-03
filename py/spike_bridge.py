from js import window
import json
import builtins
import sys
import math

# ── _Awaitable ─────────────────────────────────────────────────────────────────

_cmds = []

class _Awaitable:
    def __init__(self, cmd=None):
        if cmd is not None:
            _cmds.append(cmd)
    def __iter__(self):  return self
    def __next__(self):  raise StopIteration(None)
    def __await__(self): return self

def _q(cmd):
    _cmds.append(cmd)
    window.shadowCmd(json.dumps(cmd))
    return _Awaitable(None)

# ── color ──────────────────────────────────────────────────────────────────────

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

# ── port ──────────────────────────────────────────────────────────────────────

class port:
    A = 'A'; B = 'B'; C = 'C'; D = 'D'; E = 'E'; F = 'F'

Port = port

# ── motor ──────────────────────────────────────────────────────────────────────

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
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': degrees, 'velocity': velocity})

    @staticmethod
    def run_for_time(port, duration, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_time', 'port': str(port), 'time_ms': duration, 'velocity': velocity})

    @staticmethod
    def run_to_absolute_position(port, position, velocity=360, *, direction=2, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run_to_relative_position(port, position, velocity=360, *, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'motor_degrees', 'port': str(port), 'degrees': int(position), 'velocity': velocity})

    @staticmethod
    def run(port, velocity=360, *, acceleration=1000):
        return _q({'type': 'motor_run', 'port': str(port), 'velocity': velocity})

    @staticmethod
    def stop(port, *, stop=1):
        return _q({'type': 'motor_stop', 'port': str(port)})

    @staticmethod
    def velocity(port):
        return int(window.getMotorSpeed(str(port)))

    @staticmethod
    def absolute_position(port):
        return int(window.getMotorPosition(str(port)))

    @staticmethod
    def relative_position(port):
        return int(window.getMotorPosition(str(port)))

    @staticmethod
    def reset_relative_position(port, position=0):
        return _Awaitable()

    @staticmethod
    def get_duty_cycle(port):
        return 0

    @staticmethod
    def set_duty_cycle(port, pwm):
        return _Awaitable()

# ── motor_pair ─────────────────────────────────────────────────────────────────

class motor_pair:
    PAIR_1 = 0; PAIR_2 = 1; PAIR_3 = 2

    @staticmethod
    def pair(pair, left_motor, right_motor):
        return _q({'type': 'pair', 'pair_id': pair,
                   'left': str(left_motor), 'right': str(right_motor)})

    @staticmethod
    def unpair(pair):
        return _Awaitable()

    @staticmethod
    def move(pair, steering, *, velocity=360, acceleration=1000):
        return _q({'type': 'start', 'pair_id': pair, 'steering': steering, 'speed': velocity})

    @staticmethod
    def move_for_degrees(pair, degrees, steering=0, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        return _q({'type': 'move', 'pair_id': pair, 'steering': steering,
                   'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_for_time(pair, duration, steering=0, *, velocity=360, stop=1, acceleration=1000, deceleration=1000):
        degrees = velocity * (duration / 1000.0)
        return _q({'type': 'move', 'pair_id': pair, 'steering': steering,
                   'speed': velocity, 'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def move_tank_for_time(pair, left_velocity, right_velocity, duration, *, stop=1, acceleration=1000, deceleration=1000):
        max_v = max(abs(left_velocity), abs(right_velocity), 1)
        degrees = max_v * (duration / 1000.0)
        return _q({'type': 'move_tank', 'pair_id': pair,
                   'left_speed': left_velocity, 'right_speed': right_velocity,
                   'amount': degrees, 'unit': 'degrees'})

    @staticmethod
    def stop(pair, *, stop=1):
        return _q({'type': 'stop', 'pair_id': pair})

    # ── Backward-compat aliases (not in completions) ───────────────────────────

    @staticmethod
    def move_tank(pair_id, left_speed, right_speed, amount=0, unit='degrees',
                  acceleration=100, deceleration=100):
        return _q({'type': 'move_tank', 'pair_id': pair_id,
                   'left_speed': left_speed, 'right_speed': right_speed,
                   'amount': amount, 'unit': unit})

# ── color_sensor ───────────────────────────────────────────────────────────────

class color_sensor:
    @staticmethod
    def color(port):
        return int(window.getColorSensorColorInt())

    @staticmethod
    def reflection(port):
        return int(window.getColorSensorReflection())

    @staticmethod
    def rgbi(port):
        raw = window.getColorSensorRGB()
        return (int(raw[0]), int(raw[1]), int(raw[2]), 0)

# ── distance_sensor ────────────────────────────────────────────────────────────

class distance_sensor:
    @staticmethod
    def distance(port):
        v = int(window.getDistanceSensorValue())
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
    def write(self, text, intensity=100, time_per_character=500):
        return _q({'type': 'hub_display', 'text': str(text)})

    def show(self, pixels):
        return _q({'type': 'hub_image', 'image': 'CUSTOM'})

    def show_image(self, image):
        return _q({'type': 'hub_image', 'image': str(image)})

    def set_pixel(self, x, y, intensity=100):
        return _q({'type': 'hub_pixel', 'x': x, 'y': y, 'brightness': intensity})

    def get_pixel(self, x, y):
        return 0

    def clear(self):
        return _q({'type': 'hub_display_off'})

    def off(self):
        return _q({'type': 'hub_display_off'})

    def get_orientation(self):
        return 0

    def set_orientation(self, top):
        return 0


class _Speaker:
    def beep(self, freq=440, duration=500, volume=100, *,
             attack=0, decay=0, sustain=100, release=0, transition=10):
        # Convert Hz → MIDI note for the simulator's audio engine
        note = round(69 + 12 * math.log2(freq / 440)) if freq > 0 else 69
        return _q({'type': 'beep', 'note': note, 'duration': duration / 1000.0})

    def stop(self):
        return _Awaitable()

    def volume(self, volume):
        return _Awaitable()


class _MotionSensor:
    TAPPED        = 0
    DOUBLE_TAPPED = 1
    SHAKEN        = 2
    FALLING       = 3
    UNKNOWN       = -1
    TOP    = 0; FRONT  = 1; RIGHT  = 2
    BOTTOM = 3; BACK   = 4; LEFT   = 5

    def tilt_angles(self):                      return (0, 0, 0)
    def angular_velocity(self, raw_unfiltered=False): return (0, 0, 0)
    def acceleration(self, raw_unfiltered=False):     return (0, 0, 981)
    def reset_yaw(self, angle=0):               return _Awaitable()
    def gesture(self):                          return self.UNKNOWN
    def stable(self):                           return True
    def up_face(self):                          return self.TOP
    def quaternion(self):                       return (1.0, 0.0, 0.0, 0.0)
    def tap_count(self):                        return 0
    def reset_tap_count(self):                  pass
    def get_yaw_face(self):                     return self.TOP
    def set_yaw_face(self, up):                 return True


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

# ── runloop ────────────────────────────────────────────────────────────────────

class runloop:
    @staticmethod
    def run(*funcs):
        for coro in funcs:
            try:
                while True:
                    coro.send(None)
            except StopIteration:
                pass

    @staticmethod
    def sleep_ms(duration):
        return _q({'type': 'wait', 'ms': int(duration)})

    @staticmethod
    def until(function, timeout=0):
        return _Awaitable()

# ── wait ───────────────────────────────────────────────────────────────────────

def wait(ms):
    return _q({'type': 'wait', 'ms': int(ms)})

# ── print override ─────────────────────────────────────────────────────────────

_orig_print = builtins.print

def _py_print(*args, **kwargs):
    text = kwargs.get('sep', ' ').join(str(a) for a in args)
    _q({'type': 'print', 'text': text})
    _orig_print(*args, **kwargs)

builtins.print = _py_print

# ── Stub modules ───────────────────────────────────────────────────────────────

class orientation:
    UP = 0; RIGHT = 1; DOWN = 2; LEFT = 3


class device:
    @staticmethod
    def data(port):                      return ()
    @staticmethod
    def id(port):                        return 0
    @staticmethod
    def ready(port):                     return False
    @staticmethod
    def get_duty_cycle(port):            return 0
    @staticmethod
    def set_duty_cycle(port, duty_cycle): pass


class color_matrix:
    @staticmethod
    def clear(port):                      pass
    @staticmethod
    def get_pixel(port, x, y):            return (0, 0)
    @staticmethod
    def set_pixel(port, x, y, pixel):     pass
    @staticmethod
    def show(port, pixels):               pass


class _AppSound:
    @staticmethod
    def play(sound_name, volume=100, pitch=0, pan=0): return _Awaitable()
    @staticmethod
    def stop():                                        return _Awaitable()
    @staticmethod
    def set_attributes(volume, pitch, pan):            pass


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
    def play_drum(drum):                          pass
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
    def show(fullscreen=False):         pass
    @staticmethod
    def hide():                         pass
    @staticmethod
    def set_value(color, value):        pass
    @staticmethod
    def change(color, value):           pass
    @staticmethod
    def get_value(color):               return _Awaitable()
    @staticmethod
    def clear_all():                    pass


class _AppLineGraph:
    @staticmethod
    def show(fullscreen=False):         pass
    @staticmethod
    def hide():                         pass
    @staticmethod
    def plot(color, x, y):              pass
    @staticmethod
    def clear(color):                   pass
    @staticmethod
    def clear_all():                    pass
    @staticmethod
    def get_last(color):                return _Awaitable()
    @staticmethod
    def get_average(color):             return _Awaitable()
    @staticmethod
    def get_min(color):                 return _Awaitable()
    @staticmethod
    def get_max(color):                 return _Awaitable()


class _App:
    sound     = _AppSound()
    music     = _AppMusic()
    display   = _AppDisplay()
    bargraph  = _AppBarGraph()
    linegraph = _AppLineGraph()


app = _App()

# ── Module injection ───────────────────────────────────────────────────────────

class _HubModule:
    light_matrix  = hub.light_matrix
    speaker       = hub.speaker
    sound         = hub.speaker
    motion_sensor = hub.motion_sensor
    button        = hub.button
    light         = hub.light
    port          = port

    def device_uuid(self): return hub.device_uuid()
    def hardware_id(self):  return hub.hardware_id()
    def power_off(self):    return hub.power_off()
    def temperature(self):  return hub.temperature()


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

# ── User code runner ───────────────────────────────────────────────────────────

def run_user_code(code):
    global _cmds
    _cmds = []

    ns = {
        '__name__':        '__main__',
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
        'orientation':     orientation,
        'device':          device,
        'color_matrix':    color_matrix,
        'app':             app,
        'print':           _py_print,
    }

    try:
        window.resetShadow()
        exec(compile(str(code), '<user>', 'exec'), ns)
        window.receiveCommands(json.dumps(_cmds))
    except Exception as exc:
        window.appendOutput('[Error] ' + str(type(exc).__name__) + ': ' + str(exc))
    finally:
        _cmds = []


window.pyRunCode = run_user_code
window.onPyReady()
