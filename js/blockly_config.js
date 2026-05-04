'use strict';

// ── Category hue values (SPIKE Prime palette) ────────────────────────────────
const H_MOTOR    = 0;
const H_MOVEMENT = 210;
const H_LIGHT    = 52;
const H_SOUND    = 295;
const H_EVENT    = 38;
const H_CONTROL  = 30;
const H_SENSOR   = 185;

// ── Shared dropdown data ─────────────────────────────────────────────────────
const _PORTS   = [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']];
const _CW_CCW  = [['clockwise','1'],['counterclockwise','-1']];
const _FWD_BWD = [['forward','1'],['backward','-1']];
const _COLORS  = [
  ['black','black'],['violet','violet'],['blue','blue'],['cyan','cyan'],
  ['green','green'],['yellow','yellow'],['red','red'],['white','white'],['no color','none'],
];
const _TILT    = [['forward','FORWARD'],['backward','BACKWARD'],['left','LEFT'],['right','RIGHT'],['any direction','ANY']];
const _ORIENT  = [
  ['face up','FACE_UP'],['face down','FACE_DOWN'],['upright','UPRIGHT'],
  ['upside down','UPSIDE_DOWN'],['left side up','LEFT'],['right side up','RIGHT'],
];
const _HUB_BTN = [['left','LEFT'],['right','RIGHT'],['center','CENTER']];
const _STOP    = [['all','ALL'],['this stack','THIS'],['other stacks','OTHER']];
const _MV_PAIRS = [['A+B','A:B'],['C+D','C:D'],['E+F','E:F']];
const _SOUNDS  = [['Cat Meow','cat'],['Dog Bark','dog'],['Tada','tada'],['Motor Start','motor'],['Beep','beep']];
const _EFFECTS = [['Robot','robot'],['Space','space'],['Alien','alien'],['Underwater','water'],['Telephone','tel']];
const _LIGHT_COLORS = [
  ['white','white'],['red','red'],['green','green'],['blue','blue'],
  ['yellow','yellow'],['cyan','cyan'],['magenta','magenta'],['orange','orange'],['off','off'],
];
const _ANGLE_AXES = [['yaw','yaw'],['pitch','pitch'],['roll','roll']];
const _DISPLAY_ORIENT = [['upright','UPRIGHT'],['upside down','UPSIDE_DOWN'],['left','LEFT'],['right','RIGHT']];

// ── Block definitions ────────────────────────────────────────────────────────
const SPIKE_BLOCKS = [

  // ── MOTORS ──────────────────────────────────────────────────────────────────

  { type: 'spike_motor_rotations',
    message0: 'run motor %1 for %2 rotations %3',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
      { type: 'field_number',   name: 'ROTS', value: 1, min: -1000, max: 1000 },
      { type: 'field_dropdown', name: 'DIR',  options: _CW_CCW },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Run a motor for a number of rotations',
  },

  { type: 'spike_motor_degrees',
    message0: 'run motor %1 for %2 degrees %3',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
      { type: 'field_number',   name: 'DEG',  value: 360, min: -36000, max: 36000 },
      { type: 'field_dropdown', name: 'DIR',  options: _CW_CCW },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Run a motor for a number of degrees',
  },

  { type: 'spike_motor_seconds',
    message0: 'run motor %1 for %2 seconds %3',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
      { type: 'field_number',   name: 'SEC',  value: 1, min: 0, max: 100 },
      { type: 'field_dropdown', name: 'DIR',  options: _CW_CCW },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Run a motor for a number of seconds',
  },

  { type: 'spike_motor_go_position',
    message0: 'go to position %1 degrees on motor %2',
    args0: [
      { type: 'field_number',   name: 'POS',  value: 0, min: -180, max: 180 },
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Rotate a motor to an absolute position in degrees',
  },

  { type: 'spike_motor_start',
    message0: 'start motor %1 %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
      { type: 'field_dropdown', name: 'DIR',  options: _CW_CCW },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Start a motor running continuously',
  },

  { type: 'spike_motor_stop',
    message0: 'stop motor %1',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Stop a motor',
  },

  { type: 'spike_motor_set_speed',
    message0: 'set %1 motor speed to %2 %',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS },
      { type: 'field_number',   name: 'SPEED', value: 75, min: -100, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOTOR,
    tooltip: 'Set the default speed of a motor',
  },

  { type: 'spike_motor_position',
    message0: '%1 motor position',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: 'Number', colour: H_MOTOR,
    tooltip: 'Position of a motor in degrees',
  },

  { type: 'spike_motor_speed_reporter',
    message0: '%1 motor speed',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: 'Number', colour: H_MOTOR,
    tooltip: 'Speed of a motor as a percentage',
  },

  // ── MOVEMENT ────────────────────────────────────────────────────────────────

  { type: 'spike_move_straight',
    message0: 'move %1 for %2 cm',
    args0: [
      { type: 'field_dropdown', name: 'DIR',  options: _FWD_BWD },
      { type: 'field_number',   name: 'DIST', value: 20, min: 0, max: 10000 },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Move forward or backward a set distance',
  },

  { type: 'spike_move_start',
    message0: 'start moving %1',
    args0: [
      { type: 'field_dropdown', name: 'DIR', options: _FWD_BWD },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Start moving (continues until stop moving)',
  },

  { type: 'spike_move_steering',
    message0: 'move with steering %1 for %2 cm',
    args0: [
      { type: 'field_number', name: 'STEERING', value: 0,  min: -100, max: 100 },
      { type: 'field_number', name: 'DIST',     value: 20, min: 0,    max: 10000 },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Move with steering: -100 = full left, 0 = straight, 100 = full right',
  },

  { type: 'spike_move_steering_start',
    message0: 'start moving with steering %1',
    args0: [
      { type: 'field_number', name: 'STEERING', value: 0, min: -100, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Start moving with steering (continues until stop moving)',
  },

  { type: 'spike_move_stop',
    message0: 'stop moving',
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Stop the movement motors',
  },

  { type: 'spike_move_set_speed',
    message0: 'set movement speed to %1 %',
    args0: [
      { type: 'field_number', name: 'SPEED', value: 50, min: -100, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Set the default movement speed percentage',
  },

  { type: 'spike_move_set_motors',
    message0: 'set movement motors to %1',
    args0: [
      { type: 'field_dropdown', name: 'PAIR', options: _MV_PAIRS },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Select which motor ports drive the robot',
  },

  { type: 'spike_move_set_rotation',
    message0: 'set 1 rotation = %1 cm',
    args0: [
      { type: 'field_number', name: 'CM', value: 17.6, min: 0.1, max: 999 },
    ],
    previousStatement: null, nextStatement: null, colour: H_MOVEMENT,
    tooltip: 'Calibrate how many cm the robot travels per wheel rotation',
  },

  { type: 'spike_move_distance',
    message0: 'moved cm',
    output: 'Number', colour: H_MOVEMENT,
    tooltip: 'Total distance moved in this run (cm)',
  },

  // ── LIGHT ────────────────────────────────────────────────────────────────────

  { type: 'spike_light_on_timed',
    message0: 'turn on for %1 seconds at %2 % brightness',
    args0: [
      { type: 'field_number', name: 'SEC', value: 1,   min: 0, max: 60 },
      { type: 'field_number', name: 'BRI', value: 100, min: 0, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Light up all pixels for a set time then turn off',
  },

  { type: 'spike_light_on',
    message0: 'turn on at %1 % brightness',
    args0: [
      { type: 'field_number', name: 'BRI', value: 100, min: 0, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Light up all pixels at a given brightness',
  },

  { type: 'spike_light_write',
    message0: 'write %1',
    args0: [{ type: 'input_value', name: 'TEXT', check: ['String', 'Number'] }],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Scroll text across the LED matrix',
  },

  { type: 'spike_light_off',
    message0: 'turn off pixels',
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Turn off all LED pixels',
  },

  { type: 'spike_light_pixel_brightness',
    message0: 'set pixel brightness %1 at x: %2 y: %3',
    args0: [
      { type: 'field_number', name: 'BRI', value: 100, min: 0, max: 100 },
      { type: 'field_number', name: 'X',   value: 2,   min: 0, max: 4 },
      { type: 'field_number', name: 'Y',   value: 2,   min: 0, max: 4 },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Set a specific LED pixel brightness',
  },

  { type: 'spike_light_set_pixel',
    message0: 'set pixel at x: %1 y: %2 to %3 %',
    args0: [
      { type: 'field_number', name: 'X',   value: 2,   min: 0, max: 4 },
      { type: 'field_number', name: 'Y',   value: 2,   min: 0, max: 4 },
      { type: 'field_number', name: 'BRI', value: 100, min: 0, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Set a specific LED pixel',
  },

  { type: 'spike_light_orientation',
    message0: 'set display orientation %1',
    args0: [
      { type: 'field_dropdown', name: 'ORIENT', options: _DISPLAY_ORIENT },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Set the LED matrix display orientation',
  },

  { type: 'spike_light_button_color',
    message0: 'set center button light to %1',
    args0: [
      { type: 'field_dropdown', name: 'COLOR', options: _LIGHT_COLORS },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Set the center button LED color',
  },

  { type: 'spike_light_port',
    message0: 'turn on port %1 light %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS },
      { type: 'field_dropdown', name: 'COLOR', options: _LIGHT_COLORS },
    ],
    previousStatement: null, nextStatement: null, colour: H_LIGHT,
    tooltip: 'Turn on a port indicator light',
  },

  // ── SOUND ────────────────────────────────────────────────────────────────────

  { type: 'spike_sound_play',
    message0: 'play %1 until done',
    args0: [
      { type: 'field_dropdown', name: 'SOUND', options: _SOUNDS },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Play a sound and wait until it finishes',
  },

  { type: 'spike_sound_start',
    message0: 'start %1',
    args0: [
      { type: 'field_dropdown', name: 'SOUND', options: _SOUNDS },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Start playing a sound without waiting',
  },

  { type: 'spike_sound_beep',
    message0: 'play beep at note %1 for %2 seconds',
    args0: [
      { type: 'field_number', name: 'NOTE', value: 60, min: 21, max: 108 },
      { type: 'field_number', name: 'SEC',  value: 0.3, min: 0, max: 60 },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Play a beep (MIDI note 21–108) for a duration',
  },

  { type: 'spike_sound_beep_start',
    message0: 'start beep at note %1',
    args0: [
      { type: 'field_number', name: 'NOTE', value: 60, min: 21, max: 108 },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Start a beep without waiting',
  },

  { type: 'spike_sound_stop_all',
    message0: 'stop all sounds',
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Stop all playing sounds',
  },

  { type: 'spike_sound_volume',
    message0: 'volume',
    output: 'Number', colour: H_SOUND,
    tooltip: 'Current sound volume (0–100)',
  },

  { type: 'spike_sound_change_effect',
    message0: 'change %1 effect by %2',
    args0: [
      { type: 'field_dropdown', name: 'EFFECT', options: _EFFECTS },
      { type: 'field_number',   name: 'AMOUNT', value: 10, min: -100, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Change a sound effect parameter',
  },

  { type: 'spike_sound_set_effect',
    message0: 'set %1 effect to %2',
    args0: [
      { type: 'field_dropdown', name: 'EFFECT', options: _EFFECTS },
      { type: 'field_number',   name: 'VALUE',  value: 50, min: 0, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Set a sound effect parameter',
  },

  { type: 'spike_sound_clear_effects',
    message0: 'clear sound effects',
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Clear all sound effects',
  },

  { type: 'spike_sound_change_volume',
    message0: 'change volume by %1',
    args0: [
      { type: 'field_number', name: 'AMOUNT', value: -10, min: -100, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Change the volume by an amount',
  },

  { type: 'spike_sound_set_volume',
    message0: 'set volume to %1 %',
    args0: [
      { type: 'field_number', name: 'VALUE', value: 100, min: 0, max: 100 },
    ],
    previousStatement: null, nextStatement: null, colour: H_SOUND,
    tooltip: 'Set the sound volume',
  },

  // ── EVENTS (hat blocks — no previousStatement) ───────────────────────────────

  { type: 'spike_event_start',
    message0: 'when program starts',
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the program starts',
  },

  { type: 'spike_event_color',
    message0: 'when color sensor sees %1',
    args0: [
      { type: 'field_dropdown', name: 'COLOR', options: _COLORS },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the color sensor detects the selected color',
  },

  { type: 'spike_event_pressed',
    message0: 'when center button pressed %1 times',
    args0: [
      { type: 'field_number', name: 'TIMES', value: 1, min: 1, max: 10 },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the center button is pressed N times',
  },

  { type: 'spike_event_distance',
    message0: 'when distance < %1 cm',
    args0: [
      { type: 'field_number', name: 'DIST', value: 10, min: 1, max: 200 },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when an object is closer than the set distance',
  },

  { type: 'spike_event_tilted',
    message0: 'when tilted %1',
    args0: [
      { type: 'field_dropdown', name: 'DIR', options: _TILT },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the hub is tilted in a direction',
  },

  { type: 'spike_event_orientation',
    message0: 'when %1',
    args0: [
      { type: 'field_dropdown', name: 'ORIENT', options: _ORIENT },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the hub reaches a specific orientation',
  },

  { type: 'spike_event_shaken',
    message0: 'when hub is shaken',
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the hub is shaken',
  },

  { type: 'spike_event_button',
    message0: 'when %1 button pressed',
    args0: [
      { type: 'field_dropdown', name: 'BTN', options: _HUB_BTN },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when a hub button is pressed',
  },

  { type: 'spike_event_timer',
    message0: 'when timer > %1 seconds',
    args0: [
      { type: 'field_number', name: 'SEC', value: 5, min: 0, max: 3600 },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when the timer exceeds a value',
  },

  { type: 'spike_event_receive',
    message0: 'when I receive %1',
    args0: [
      { type: 'field_input', name: 'MSG', text: 'message1' },
    ],
    nextStatement: null, colour: H_EVENT,
    tooltip: 'Runs when a broadcast message is received',
  },

  { type: 'spike_event_broadcast',
    message0: 'broadcast %1',
    args0: [
      { type: 'input_value', name: 'MSG', check: ['String'] },
    ],
    previousStatement: null, nextStatement: null, colour: H_EVENT,
    tooltip: 'Broadcast a message to all when-receive blocks',
  },

  { type: 'spike_event_broadcast_wait',
    message0: 'broadcast %1 and wait',
    args0: [
      { type: 'input_value', name: 'MSG', check: ['String'] },
    ],
    previousStatement: null, nextStatement: null, colour: H_EVENT,
    tooltip: 'Broadcast a message and wait for receivers to finish',
  },

  // ── CONTROL (custom blocks) ──────────────────────────────────────────────────

  { type: 'spike_wait',
    message0: 'wait %1 seconds',
    args0: [
      { type: 'field_number', name: 'SEC', value: 1, min: 0, max: 3600 },
    ],
    previousStatement: null, nextStatement: null, colour: H_CONTROL,
    tooltip: 'Wait for a number of seconds',
  },

  { type: 'spike_forever',
    message0: 'forever %1',
    args0: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null, colour: H_CONTROL,
    tooltip: 'Repeat the enclosed blocks forever',
  },

  { type: 'spike_wait_until',
    message0: 'wait until %1',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    previousStatement: null, nextStatement: null, colour: H_CONTROL,
    tooltip: 'Wait until a condition becomes true',
  },

  { type: 'spike_stop',
    message0: 'stop %1',
    args0: [
      { type: 'field_dropdown', name: 'KIND', options: _STOP },
    ],
    previousStatement: null, colour: H_CONTROL,
    tooltip: 'Stop the program',
  },

  // ── SENSORS ─────────────────────────────────────────────────────────────────

  { type: 'spike_sensor_color_is',
    message0: 'color sensor on %1 color is %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS },
      { type: 'field_dropdown', name: 'COLOR', options: _COLORS },
    ],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the color sensor sees the specified color',
  },

  { type: 'spike_sensor_color',
    message0: 'color sensor on %1 color',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: null, colour: H_SENSOR,
    tooltip: 'The color detected by the color sensor',
  },

  { type: 'spike_sensor_reflection_lt',
    message0: 'color sensor on %1 reflection < %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS },
      { type: 'field_number',   name: 'VALUE', value: 50, min: 0, max: 100 },
    ],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if reflected light is less than the threshold',
  },

  { type: 'spike_sensor_reflection',
    message0: 'color sensor on %1 reflected light',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: 'Number', colour: H_SENSOR,
    tooltip: 'Reflected light intensity (0–100)',
  },

  { type: 'spike_sensor_pressed',
    message0: 'force sensor on %1 is pressed',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the force sensor is pressed',
  },

  { type: 'spike_sensor_pressure',
    message0: 'force sensor on %1 pressure',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: 'Number', colour: H_SENSOR,
    tooltip: 'Force sensor pressure (0–100)',
  },

  { type: 'spike_sensor_closer',
    message0: 'distance sensor on %1 closer than %2 cm',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS },
      { type: 'field_number',   name: 'DIST', value: 10, min: 0, max: 200 },
    ],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if an object is closer than the set distance',
  },

  { type: 'spike_sensor_distance',
    message0: 'distance sensor on %1 distance cm',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS }],
    output: 'Number', colour: H_SENSOR,
    tooltip: 'Distance to the nearest object in cm',
  },

  { type: 'spike_sensor_tilted',
    message0: 'hub tilted %1',
    args0: [{ type: 'field_dropdown', name: 'DIR', options: _TILT }],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the hub is tilted in the specified direction',
  },

  { type: 'spike_sensor_orientation',
    message0: 'hub is %1',
    args0: [{ type: 'field_dropdown', name: 'ORIENT', options: _ORIENT }],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the hub has the specified orientation',
  },

  { type: 'spike_sensor_shaken',
    message0: 'hub is shaken',
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the hub is being shaken',
  },

  { type: 'spike_sensor_angle',
    message0: 'hub %1 angle',
    args0: [{ type: 'field_dropdown', name: 'AXIS', options: _ANGLE_AXES }],
    output: 'Number', colour: H_SENSOR,
    tooltip: 'The hub angle on the specified axis (degrees)',
  },

  { type: 'spike_sensor_reset_yaw',
    message0: 'reset hub yaw angle',
    previousStatement: null, nextStatement: null, colour: H_SENSOR,
    tooltip: 'Reset the yaw (heading) angle to 0',
  },

  { type: 'spike_sensor_button',
    message0: '%1 button pressed',
    args0: [{ type: 'field_dropdown', name: 'BTN', options: _HUB_BTN }],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the specified hub button is pressed',
  },

  { type: 'spike_sensor_timer',
    message0: 'timer',
    output: 'Number', colour: H_SENSOR,
    tooltip: 'Seconds since program started or timer was reset',
  },

  { type: 'spike_sensor_reset_timer',
    message0: 'reset timer',
    previousStatement: null, nextStatement: null, colour: H_SENSOR,
    tooltip: 'Reset the timer to 0',
  },

  { type: 'spike_sensor_in_between',
    message0: '%1 is between %2 and %3',
    args0: [
      { type: 'input_value',  name: 'VAL',  check: 'Number' },
      { type: 'field_number', name: 'LOW',  value: 10,  min: -9999, max: 9999 },
      { type: 'field_number', name: 'HIGH', value: 90, min: -9999, max: 9999 },
    ],
    output: 'Boolean', colour: H_SENSOR,
    tooltip: 'True if the value is between the two bounds (inclusive)',
  },
];

// ── JavaScript Code Generators ───────────────────────────────────────────────

const _SOUND_NOTES = { cat: 69, dog: 57, tada: 72, motor: 50, beep: 65 };
const _WHEEL_CIRC  = Math.PI * 56;   // mm
const _MM_PER_MS   = 0.9;            // at 100% speed

function registerGenerators(Blockly) {
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return;

  // valueToCode helper that falls back to a default
  const val = (block, name, def = '0') =>
    js.valueToCode(block, name, js.ORDER_NONE ?? js.ORDER_ATOMIC ?? 0) || def;

  // ── Motors ─────────────────────────────────────────────────────────────────

  js['spike_motor_rotations'] = (block) => {
    const port   = block.getFieldValue('PORT');
    const rots   = parseFloat(block.getFieldValue('ROTS'));
    const dir    = parseFloat(block.getFieldValue('DIR'));
    const distMM = Math.abs(rots) * _WHEEL_CIRC;
    return `await window.sim._animateSingleMotor('${port}', ${0.75 * dir}, ${distMM.toFixed(2)});\n`;
  };

  js['spike_motor_degrees'] = (block) => {
    const port   = block.getFieldValue('PORT');
    const deg    = parseFloat(block.getFieldValue('DEG'));
    const dir    = parseFloat(block.getFieldValue('DIR'));
    const distMM = (Math.abs(deg) / 360) * _WHEEL_CIRC;
    return `await window.sim._animateSingleMotor('${port}', ${0.75 * dir}, ${distMM.toFixed(2)});\n`;
  };

  js['spike_motor_seconds'] = (block) => {
    const port   = block.getFieldValue('PORT');
    const sec    = parseFloat(block.getFieldValue('SEC'));
    const dir    = parseFloat(block.getFieldValue('DIR'));
    const distMM = 0.75 * _MM_PER_MS * sec * 1000;
    return `await window.sim._animateSingleMotor('${port}', ${0.75 * dir}, ${distMM.toFixed(2)});\n`;
  };

  js['spike_motor_go_position'] = (block) => {
    const port   = block.getFieldValue('PORT');
    const pos    = parseFloat(block.getFieldValue('POS'));
    const distMM = (Math.abs(pos) / 360) * _WHEEL_CIRC;
    return `await window.sim._animateSingleMotor('${port}', 0.5, ${distMM.toFixed(2)});\n`;
  };

  js['spike_motor_start'] = (block) => {
    const port = block.getFieldValue('PORT');
    const dir  = parseFloat(block.getFieldValue('DIR'));
    return `window.sim._animateSingleMotor('${port}', ${0.75 * dir}, 500);\n`;
  };

  js['spike_motor_stop'] = (block) => {
    const port = block.getFieldValue('PORT');
    return `// motor ${port} stopped\n`;
  };

  js['spike_motor_set_speed'] = (block) => {
    const port  = block.getFieldValue('PORT');
    const speed = block.getFieldValue('SPEED');
    return `// motor ${port} speed = ${speed}%\n`;
  };

  js['spike_motor_position'] = (block) => {
    const port = block.getFieldValue('PORT');
    return [`window.sim.getMotorPosition('${port}')`, 2];
  };

  js['spike_motor_speed_reporter'] = (block) => {
    const port = block.getFieldValue('PORT');
    return [`window.sim.getMotorSpeed('${port}')`, 2];
  };

  // ── Movement ───────────────────────────────────────────────────────────────

  js['spike_move_straight'] = (block) => {
    const dir    = parseFloat(block.getFieldValue('DIR'));
    const dist   = parseFloat(block.getFieldValue('DIST'));
    const distMM = dist * 10;
    return `_distMoved += ${dist}; await window.sim._animateTank(_moveSpeed/100*${dir}, _moveSpeed/100*${dir}, ${distMM});\n`;
  };

  js['spike_move_start'] = (block) => {
    const dir = parseFloat(block.getFieldValue('DIR'));
    return `window.sim._animateTank(_moveSpeed/100*${dir}, _moveSpeed/100*${dir}, 5000);\n`;
  };

  js['spike_move_steering'] = (block) => {
    const steer  = parseFloat(block.getFieldValue('STEERING')) / 100;
    const dist   = parseFloat(block.getFieldValue('DIST'));
    const distMM = dist * 10;
    const lv     = `_moveSpeed/100*(1+${steer})`;
    const rv     = `_moveSpeed/100*(1-${steer})`;
    return `_distMoved += ${dist}; await window.sim._animateTank(${lv}, ${rv}, ${distMM});\n`;
  };

  js['spike_move_steering_start'] = (block) => {
    const steer = parseFloat(block.getFieldValue('STEERING')) / 100;
    const lv    = `_moveSpeed/100*(1+${steer})`;
    const rv    = `_moveSpeed/100*(1-${steer})`;
    return `window.sim._animateTank(${lv}, ${rv}, 5000);\n`;
  };

  js['spike_move_stop'] = (_block) => `window.sim.stop();\nawait window.sim._sleep(50);\n`;

  js['spike_move_set_speed'] = (block) => {
    const speed = block.getFieldValue('SPEED');
    return `_moveSpeed = ${speed};\n`;
  };

  js['spike_move_set_motors'] = (block) => {
    const [l, r] = block.getFieldValue('PAIR').split(':');
    return `_movePairL = '${l}'; _movePairR = '${r}';\n`;
  };

  js['spike_move_set_rotation'] = (block) => {
    const cm = block.getFieldValue('CM');
    return `_moveRotCm = ${cm};\n`;
  };

  js['spike_move_distance'] = (_block) => ['_distMoved', 0];

  // ── Light ──────────────────────────────────────────────────────────────────

  js['spike_light_on_timed'] = (block) => {
    const sec = parseFloat(block.getFieldValue('SEC'));
    const bri = block.getFieldValue('BRI');
    return `window.sim.robot.display = Array(25).fill(${bri});\nawait window.sim._sleep(${sec * 1000} / window.sim.speedMult);\nwindow.sim.robot.display = Array(25).fill(0);\n`;
  };

  js['spike_light_on'] = (block) => {
    const bri = block.getFieldValue('BRI');
    return `window.sim.robot.display = Array(25).fill(${bri});\n`;
  };

  js['spike_light_write'] = (block) => {
    const text = val(block, 'TEXT', "''");
    return `window.sim._showText(String(${text}));\n`;
  };

  js['spike_light_off'] = (_block) => `window.sim.robot.display = Array(25).fill(0);\n`;

  js['spike_light_pixel_brightness'] = (block) => {
    const bri = block.getFieldValue('BRI');
    const x   = block.getFieldValue('X');
    const y   = block.getFieldValue('Y');
    return `if (${x}>=0&&${x}<5&&${y}>=0&&${y}<5) window.sim.robot.display[${y}*5+${x}]=${bri};\n`;
  };

  js['spike_light_set_pixel'] = (block) => {
    const x   = block.getFieldValue('X');
    const y   = block.getFieldValue('Y');
    const bri = block.getFieldValue('BRI');
    return `if (${x}>=0&&${x}<5&&${y}>=0&&${y}<5) window.sim.robot.display[${y}*5+${x}]=${bri};\n`;
  };

  js['spike_light_orientation']  = (_block) => `// display orientation\n`;
  js['spike_light_button_color'] = (block)  => `// button light: ${block.getFieldValue('COLOR')}\n`;
  js['spike_light_port']         = (block)  => `// port ${block.getFieldValue('PORT')} light: ${block.getFieldValue('COLOR')}\n`;

  // ── Sound ──────────────────────────────────────────────────────────────────

  js['spike_sound_play'] = (block) => {
    const note = _SOUND_NOTES[block.getFieldValue('SOUND')] || 60;
    return `window.sim._playBeep(${note}, 500); await window.sim._sleep(500 / window.sim.speedMult);\n`;
  };

  js['spike_sound_start'] = (block) => {
    const note = _SOUND_NOTES[block.getFieldValue('SOUND')] || 60;
    return `window.sim._playBeep(${note}, 500);\n`;
  };

  js['spike_sound_beep'] = (block) => {
    const note = block.getFieldValue('NOTE');
    const sec  = parseFloat(block.getFieldValue('SEC'));
    return `window.sim._playBeep(${note}, ${sec * 1000}); await window.sim._sleep(${sec * 1000} / window.sim.speedMult);\n`;
  };

  js['spike_sound_beep_start'] = (block) => {
    const note = block.getFieldValue('NOTE');
    return `window.sim._playBeep(${note}, 500);\n`;
  };

  js['spike_sound_stop_all']      = (_block) => `// stop all sounds\n`;
  js['spike_sound_volume']        = (_block) => [`(window._blkVolume ?? 100)`, 0];
  js['spike_sound_change_effect'] = (_block) => `// sound effect\n`;
  js['spike_sound_set_effect']    = (_block) => `// sound effect\n`;
  js['spike_sound_clear_effects'] = (_block) => `// clear effects\n`;

  js['spike_sound_change_volume'] = (block) => {
    const amount = block.getFieldValue('AMOUNT');
    return `window._blkVolume = Math.max(0, Math.min(100, (window._blkVolume ?? 100) + ${amount}));\n`;
  };

  js['spike_sound_set_volume'] = (block) => {
    const value = block.getFieldValue('VALUE');
    return `window._blkVolume = ${value};\n`;
  };

  // ── Events ─────────────────────────────────────────────────────────────────
  // Hat blocks return '' — their body runs inline via Blockly's next-block chaining.

  for (const type of [
    'spike_event_start', 'spike_event_color', 'spike_event_pressed',
    'spike_event_distance', 'spike_event_tilted', 'spike_event_orientation',
    'spike_event_shaken', 'spike_event_button', 'spike_event_timer',
    'spike_event_receive',
  ]) {
    js[type] = () => '';
  }

  js['spike_event_broadcast'] = (block) => {
    const msg = val(block, 'MSG', "''");
    return `window.appendOutput('[broadcast] ' + String(${msg}), 'info');\n`;
  };

  js['spike_event_broadcast_wait'] = (block) => {
    const msg = val(block, 'MSG', "''");
    return `window.appendOutput('[broadcast] ' + String(${msg}), 'info');\nawait window.sim._sleep(100);\n`;
  };

  // ── Control ────────────────────────────────────────────────────────────────

  js['spike_wait'] = (block) => {
    const sec = parseFloat(block.getFieldValue('SEC'));
    return `await window.sim._sleep(${sec * 1000} / window.sim.speedMult);\n`;
  };

  js['spike_forever'] = (block) => {
    const body = js.statementToCode(block, 'BODY');
    return `while (window.sim.isRunning) {\n${body}  await window.sim._sleep(0);\n}\n`;
  };

  js['spike_wait_until'] = (block) => {
    const cond = val(block, 'COND', 'false');
    return `while (!(${cond}) && window.sim.isRunning) { await window.sim._sleep(50 / window.sim.speedMult); }\n`;
  };

  js['spike_stop'] = (block) => {
    const kind = block.getFieldValue('KIND');
    if (kind === 'ALL' || kind === 'THIS') {
      return `window.sim.stop(); return;\n`;
    }
    return `// stop other stacks\n`;
  };

  // ── Sensors ────────────────────────────────────────────────────────────────

  js['spike_sensor_color_is'] = (block) => {
    const color = block.getFieldValue('COLOR');
    return [`window.sim.getColorSensorColor() === '${color}'`, 0];
  };

  js['spike_sensor_color']        = (_block) => [`window.sim.getColorSensorColor()`, 0];
  js['spike_sensor_reflection']   = (_block) => [`window.sim.getColorSensorReflection()`, 0];
  js['spike_sensor_pressed']      = (_block) => [`window.sim.getForceSensorPressed()`, 0];
  js['spike_sensor_pressure']     = (_block) => [`window.sim.getForceSensorValue()`, 0];
  js['spike_sensor_distance']     = (_block) => [`(window.sim.getDistanceSensorValue() / 10)`, 0];
  js['spike_sensor_shaken']       = (_block) => [`false`, 0];
  js['spike_sensor_button']       = (_block) => [`false`, 0];
  js['spike_sensor_tilted']       = (_block) => [`false`, 0];
  js['spike_sensor_orientation']  = (_block) => [`false`, 0];

  js['spike_sensor_reflection_lt'] = (block) => {
    const threshold = block.getFieldValue('VALUE');
    return [`window.sim.getColorSensorReflection() < ${threshold}`, 0];
  };

  js['spike_sensor_closer'] = (block) => {
    const dist = parseFloat(block.getFieldValue('DIST'));
    return [`window.sim.getDistanceSensorValue() < ${dist * 10}`, 0];
  };

  js['spike_sensor_angle'] = (block) => {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'yaw') return [`(((window.sim.robot.heading % 360) + 360) % 360)`, 0];
    return [`0`, 0];
  };

  js['spike_sensor_reset_yaw'] = (_block) => `window.sim.robot.heading = -90;\n`;

  js['spike_sensor_timer']       = (_block) => [`((performance.now() - _timerMs) / 1000)`, 0];
  js['spike_sensor_reset_timer'] = (_block) => `_timerMs = performance.now();\n`;

  js['spike_sensor_in_between'] = (block) => {
    const v    = val(block, 'VAL', '0');
    const low  = block.getFieldValue('LOW');
    const high = block.getFieldValue('HIGH');
    return [`(${v} >= ${low} && ${v} <= ${high})`, 0];
  };
}

// ── Toolbox XML ───────────────────────────────────────────────────────────────

const TOOLBOX_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">

  <category name="Motors" colour="${H_MOTOR}">
    <block type="spike_motor_rotations"/>
    <block type="spike_motor_degrees"/>
    <block type="spike_motor_seconds"/>
    <block type="spike_motor_go_position"/>
    <block type="spike_motor_start"/>
    <block type="spike_motor_stop"/>
    <block type="spike_motor_set_speed"/>
    <block type="spike_motor_position"/>
    <block type="spike_motor_speed_reporter"/>
  </category>

  <category name="Movement" colour="${H_MOVEMENT}">
    <block type="spike_move_straight">
      <field name="DIR">1</field><field name="DIST">20</field>
    </block>
    <block type="spike_move_start"><field name="DIR">1</field></block>
    <block type="spike_move_steering">
      <field name="STEERING">0</field><field name="DIST">20</field>
    </block>
    <block type="spike_move_steering_start"><field name="STEERING">0</field></block>
    <block type="spike_move_stop"/>
    <block type="spike_move_set_speed"><field name="SPEED">50</field></block>
    <block type="spike_move_set_motors"/>
    <block type="spike_move_set_rotation"><field name="CM">17.6</field></block>
    <block type="spike_move_distance"/>
  </category>

  <category name="Light" colour="${H_LIGHT}">
    <block type="spike_light_on_timed"/>
    <block type="spike_light_on"/>
    <block type="spike_light_write">
      <value name="TEXT">
        <shadow type="text"><field name="TEXT">Hello</field></shadow>
      </value>
    </block>
    <block type="spike_light_off"/>
    <block type="spike_light_pixel_brightness"/>
    <block type="spike_light_set_pixel"/>
    <block type="spike_light_orientation"/>
    <block type="spike_light_button_color"/>
    <block type="spike_light_port"/>
  </category>

  <category name="Sound" colour="${H_SOUND}">
    <block type="spike_sound_play"/>
    <block type="spike_sound_start"/>
    <block type="spike_sound_beep">
      <field name="NOTE">60</field><field name="SEC">0.3</field>
    </block>
    <block type="spike_sound_beep_start"/>
    <block type="spike_sound_stop_all"/>
    <block type="spike_sound_volume"/>
    <block type="spike_sound_change_effect"/>
    <block type="spike_sound_set_effect"/>
    <block type="spike_sound_clear_effects"/>
    <block type="spike_sound_change_volume"/>
    <block type="spike_sound_set_volume"/>
  </category>

  <category name="Events" colour="${H_EVENT}">
    <block type="spike_event_start"/>
    <block type="spike_event_color"/>
    <block type="spike_event_pressed"/>
    <block type="spike_event_distance"/>
    <block type="spike_event_tilted"/>
    <block type="spike_event_orientation"/>
    <block type="spike_event_shaken"/>
    <block type="spike_event_button"/>
    <block type="spike_event_timer"/>
    <block type="spike_event_receive"/>
    <block type="spike_event_broadcast">
      <value name="MSG">
        <shadow type="text"><field name="TEXT">message1</field></shadow>
      </value>
    </block>
    <block type="spike_event_broadcast_wait">
      <value name="MSG">
        <shadow type="text"><field name="TEXT">message1</field></shadow>
      </value>
    </block>
  </category>

  <category name="Control" colour="${H_CONTROL}">
    <block type="spike_wait"><field name="SEC">1</field></block>
    <block type="controls_repeat_ext">
      <value name="TIMES">
        <shadow type="math_number"><field name="NUM">10</field></shadow>
      </value>
    </block>
    <block type="spike_forever"/>
    <block type="controls_if"/>
    <block type="controls_if"><mutation else="1"></mutation></block>
    <block type="spike_wait_until">
      <value name="COND">
        <block type="logic_boolean"><field name="BOOL">TRUE</field></block>
      </value>
    </block>
    <block type="controls_whileUntil"><field name="MODE">UNTIL</field></block>
    <block type="spike_stop"/>
  </category>

  <category name="Sensors" colour="${H_SENSOR}">
    <block type="spike_sensor_color_is"/>
    <block type="spike_sensor_color"/>
    <block type="spike_sensor_reflection_lt"/>
    <block type="spike_sensor_reflection"/>
    <block type="spike_sensor_pressed"/>
    <block type="spike_sensor_pressure"/>
    <block type="spike_sensor_closer"/>
    <block type="spike_sensor_distance"/>
    <block type="spike_sensor_tilted"/>
    <block type="spike_sensor_orientation"/>
    <block type="spike_sensor_shaken"/>
    <block type="spike_sensor_angle"/>
    <block type="spike_sensor_reset_yaw"/>
    <block type="spike_sensor_button"/>
    <block type="spike_sensor_timer"/>
    <block type="spike_sensor_reset_timer"/>
    <block type="spike_sensor_in_between">
      <value name="VAL">
        <block type="spike_sensor_timer"/>
      </value>
    </block>
  </category>

  <sep></sep>

  <category name="Operators" colour="230">
    <block type="math_arithmetic"/>
    <block type="math_random_int">
      <value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
      <value name="TO"><shadow type="math_number"><field name="NUM">10</field></shadow></value>
    </block>
    <block type="math_number"><field name="NUM">0</field></block>
    <block type="logic_compare"/>
    <block type="logic_operation"/>
    <block type="logic_negate"/>
    <block type="logic_boolean"/>
    <block type="text"><field name="TEXT"></field></block>
    <block type="text_join"/>
    <block type="text_length"/>
  </category>

  <category name="Variables" colour="330" custom="VARIABLE"></category>
  <category name="My Blocks" colour="290" custom="PROCEDURE"></category>

</xml>`;

// ── Blockly workspace initializer ─────────────────────────────────────────────

const SPIKE_BLOCKLY_PALETTES = {
  dark: {
    workspaceBackgroundColour: '#1e1e2e',
    toolboxBackgroundColour:   '#2a2a3e',
    toolboxForegroundColour:   '#cdd6f4',
    flyoutBackgroundColour:    '#313145',
    flyoutForegroundColour:    '#cdd6f4',
    scrollbarColour:           '#3d3d5c',
    gridColour:                '#2a2a3e',
  },
  light: {
    workspaceBackgroundColour: '#ffffff',
    toolboxBackgroundColour:   '#f1f5f9',
    toolboxForegroundColour:   '#0f172a',
    flyoutBackgroundColour:    '#e2e8f0',
    flyoutForegroundColour:    '#0f172a',
    scrollbarColour:           '#cbd5e1',
    gridColour:                '#cbd5e1',
  },
};

function initBlockly(divId, themeName) {
  if (typeof Blockly === 'undefined') return null;

  Blockly.defineBlocksWithJsonArray(SPIKE_BLOCKS);
  registerGenerators(Blockly);

  const palette = SPIKE_BLOCKLY_PALETTES[themeName] || SPIKE_BLOCKLY_PALETTES.dark;
  const themeId = 'spike-' + (palette === SPIKE_BLOCKLY_PALETTES.light ? 'light' : 'dark');

  const workspace = Blockly.inject(divId, {
    toolbox:  TOOLBOX_XML,
    grid:     { spacing: 20, length: 3, colour: palette.gridColour, snap: true },
    zoom:     { controls: true, wheel: true, startScale: 0.9 },
    trashcan: true,
    theme: Blockly.Theme.defineTheme(themeId, {
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: palette.workspaceBackgroundColour,
        toolboxBackgroundColour:   palette.toolboxBackgroundColour,
        toolboxForegroundColour:   palette.toolboxForegroundColour,
        flyoutBackgroundColour:    palette.flyoutBackgroundColour,
        flyoutForegroundColour:    palette.flyoutForegroundColour,
        flyoutOpacity:             0.95,
        scrollbarColour:           palette.scrollbarColour,
        insertionMarkerColour:     '#7c6af7',
        markerColour:              '#7c6af7',
        cursorColour:              '#56d4c0',
      },
    }),
  });

  const starterXml = `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="spike_event_start" x="30" y="30">
        <next><block type="spike_move_straight">
          <field name="DIR">1</field><field name="DIST">20</field>
          <next><block type="spike_move_steering">
            <field name="STEERING">50</field><field name="DIST">15</field>
            <next><block type="spike_light_write">
              <value name="TEXT">
                <shadow type="text"><field name="TEXT">Done!</field></shadow>
              </value>
            </block></next>
          </block></next>
        </block></next>
      </block>
    </xml>`;
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(starterXml), workspace);

  return workspace;
}

// ── Code generator — prepends run-time state variables ────────────────────────

function generateBlocklyJS(workspace) {
  if (!workspace || typeof Blockly === 'undefined') return '';
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return '';

  const body = js.workspaceToCode(workspace);
  if (!body.trim()) return '';

  const preamble = [
    `var _moveSpeed  = 50;`,
    `var _movePairL  = 'A';`,
    `var _movePairR  = 'B';`,
    `var _moveRotCm  = ${(Math.PI * 56 / 10).toFixed(4)};`,
    `var _distMoved  = 0;`,
    `var _timerMs    = performance.now();`,
  ].join('\n');

  return preamble + '\n' + body;
}

window.initBlockly      = initBlockly;
window.generateBlocklyJS = generateBlocklyJS;
