'use strict';

// SPIKE Prime Blockly configuration.
// Block IDs, categories, colours and dropdown values mirror the LEGO Education
// SPIKE Prime word-block set, as documented at
//   https://spike.legoeducation.com/prime/help/lls-help-word-blocks
// and as implemented in https://github.com/alexandrehardy/lego-spike-simulator
// (Scratch-flavoured Blockly).  This project uses standard Google Blockly so
// shadow blocks live in the toolbox XML, and selector dropdowns are inlined as
// field_dropdown rather than via custom shadow-block selectors.

// ── Category colours (LEGO SPIKE palette) ────────────────────────────────────
const C_MOTOR    = '#0090f5';
const C_MOVEMENT = '#ff4ccd';
const C_LIGHT    = '#9b6af6';
const C_SOUND    = '#c061f1';
const C_EVENT    = '#f5c402';
const C_CONTROL  = '#ffb515';
const C_SENSOR   = '#3fccf1';
const C_OPERATOR = '#00b94d';
const C_VARS     = '#ff9835';
const C_MYBLOCKS = '#ff5d64';

// ── Dropdown option lists (values match the reference simulator) ─────────────
const _PORTS_SINGLE = [['A','A'],['B','B'],['C','C'],['D','D'],['E','E'],['F','F']];
const _PORTS_MULTI  = _PORTS_SINGLE; // multi-port selectors collapse to single in standard Blockly

const _PAIRS = [
  ['A+B','AB'],['C+D','CD'],['E+F','EF'],
  ['A+C','AC'],['A+D','AD'],['A+E','AE'],['A+F','AF'],
  ['B+C','BC'],['B+D','BD'],['B+E','BE'],['B+F','BF'],
  ['C+E','CE'],['C+F','CF'],['D+E','DE'],['D+F','DF'],['E+F','EF'],
];

// Direction selectors render as image-only dropdowns: a small white pill
// containing the LEGO arrow glyph. Standard Blockly's field_dropdown supports
// image options via [{src, width, height, alt}, value] tuples; no custom field
// type needed.
const _ARROW = (file, alt) =>
  ({ src: 'static/icons/' + file, width: 24, height: 24, alt });
const _DIR_CW_CCW = [
  [_ARROW('FieldCw.svg',  'clockwise'),        'clockwise'],
  [_ARROW('FieldCcw.svg', 'counterclockwise'), 'counterclockwise'],
];
const _DIR_FW_BW = [
  [_ARROW('FieldFw.svg', 'forward'),  'forward'],
  [_ARROW('FieldBw.svg', 'backward'), 'back'],
];
const _SHORTEST = [
  ['shortest path','shortest'],
  ['clockwise','clockwise'],
  ['counterclockwise','counterclockwise'],
];

const _MOTOR_UNITS  = [['rotations','rotations'],['degrees','degrees'],['seconds','seconds']];
const _MOVE_UNITS   = [['rotations','rotations'],['degrees','degrees'],['seconds','seconds'],['cm','cm'],['inches','inches']];
const _DIST_UNITS   = [['cm','cm'],['inches','inches']];
const _DIST_RANGE   = [['%','%'],['cm','cm'],['inches','inches']];
const _FORCE_UNITS  = [['newton','newton'],['%','%']];

const _COLORS = [
  ['no color','-1'], ['black','0'], ['magenta','1'], ['violet','3'],
  ['blue','4'], ['cyan','5'], ['green','7'], ['yellow','9'], ['white','10'],
];

const _CENTRE_BTN_COLORS = [
  ['off','0'],   ['pink','1'],  ['violet','2'], ['blue','3'],     ['light blue','4'],
  ['cyan','5'], ['green','6'], ['yellow','7'], ['orange','8'],   ['red','9'], ['white','10'],
];

const _TILT       = [['forward','1'],['backward','2'],['left','3'],['right','4']];
const _ORIENT     = [['front','front'],['back','back'],['top','top'],['bottom','bottom'],['left side','left side'],['right side','right side']];
const _ORIENT_UP  = [['front','front'],['back','back'],['top','up'],['bottom','down'],['left side','leftside'],['right side','rightside']];
const _DISP_ORIENT= [['upright','1'],['left','2'],['right','3'],['upside down','4']];
const _AXIS_PRY   = [['pitch','pitch'],['roll','roll'],['yaw','yaw']];
const _AXIS_XYZ   = [['x','x'],['y','y'],['z','z']];
const _RAW_RGB    = [['red','0'],['green','1'],['blue','2']];
const _GESTURE    = [['shaken','shake'],['tapped','tapped'],['falling','freefall']];
const _MOTION     = [['shaken','shake'],['tapped','tapped'],['falling','falling']];
const _BTN_LR     = [['left','left'],['right','right']];
const _BTN_EVT    = [['pressed','pressed'],['released','released']];
const _PRESS_OPT  = [['pressed','pressed'],['hard-pressed','hard-pressed'],['released','released'],['pressure changed','pressure changed']];
const _PRESS_IS   = [['pressed','pressed'],['hard-pressed','hard-pressed'],['released','released']];
const _COMPARE    = [['closer than','<'],['exactly at','='],['further than','>']];
const _COMPARE_LT = [['<','<'],['=','='],['>','>']];
const _STOP_KIND  = [['all','all'],['and exit program','program'],['this stack','this']];
const _STOP_METHOD= [['brake','brake'],['hold position','hold'],['coast','coast']];
const _ACCEL      = [['slow','slow'],['medium','medium'],['fast','fast']];
const _LIGHT_DIR  = [['clockwise','clockwise'],['counterclockwise','counterclockwise']];
const _SOUND_FX   = [['pitch','PITCH'],['pan left/right','PAN']];
const _MATHOP     = [
  ['abs','abs'],['floor','floor'],['ceiling','ceiling'],['sqrt','sqrt'],
  ['sin','sin'],['cos','cos'],['tan','tan'],['asin','asin'],['acos','acos'],
  ['atan','atan'],['ln','ln'],['log','log'],['e ^','e ^'],['10 ^','10 ^'],
];
const _SOUNDS = [
  ['Cat Meow','cat'],['Dog Bark','dog'],['Tada','tada'],
  ['Motor Start','motor'],['Beep','beep'],
];

// ── Per-block category emblems (from LEGO Education SPIKE Prime IDE) ─────────
// Each block gets a small white icon on the right edge identifying its
// category, mirroring the LEGO word-block UI. Blocks not listed here (Light,
// Control, Operator, plain timer) render without an emblem.
const _ICON_FOR_TYPE = {
  flippermotor_motorTurnForDirection:        'Motors.svg',
  flippermotor_motorGoDirectionToPosition:   'Motors.svg',
  flippermotor_motorStartDirection:          'Motors.svg',
  flippermotor_motorStop:                    'Motors.svg',
  flippermotor_motorSetSpeed:                'Motors.svg',
  flippermotor_absolutePosition:             'Motors.svg',
  flippermotor_speed:                        'Motors.svg',

  flippermove_move:                          'Movement.svg',
  flippermove_startMove:                     'Movement.svg',
  flippermove_steer:                         'Movement.svg',
  flippermove_startSteer:                    'Movement.svg',
  flippermove_stopMove:                      'Movement.svg',
  flippermove_movementSpeed:                 'Movement.svg',
  flippermove_setMovementPair:               'Movement.svg',
  flippermove_setDistance:                   'Movement.svg',

  flippersound_playSoundUntilDone:           'Sound.svg',
  flippersound_playSound:                    'Sound.svg',
  flippersound_beepForTime:                  'Sound.svg',
  flippersound_beep:                         'Sound.svg',
  flippersound_stopSound:                    'Sound.svg',

  flipperlight_lightDisplayImageOnForTime:   'Light.svg',
  flipperlight_lightDisplayImageOn:          'Light.svg',
  flipperlight_lightDisplayText:             'Light.svg',
  flipperlight_lightDisplayOff:              'Light.svg',
  flipperlight_lightDisplaySetBrightness:    'Light.svg',
  flipperlight_lightDisplaySetPixel:         'Light.svg',
  flipperlight_lightDisplayRotate:           'Light.svg',
  flipperlight_lightDisplaySetOrientation:   'Light.svg',
  flipperlight_centerButtonLight:            'Light.svg',
  flipperlight_ultrasonicLightUp:            'UltraSound.svg',

  flipperevents_whenProgramStarts:           'EventsStart.svg',
  flipperevents_whenColor:                   'ColorSensor.svg',
  flipperevents_whenPressed:                 'ForceSensor.svg',
  flipperevents_whenDistance:                'UltraSound.svg',
  flipperevents_whenTilted:                  'Hub.svg',
  flipperevents_whenOrientation:             'Hub.svg',
  flipperevents_whenGesture:                 'Hub.svg',
  flipperevents_whenButton:                  'Hub.svg',
  flipperevents_whenTimer:                   'Hub.svg',

  flippersensors_isColor:                    'ColorSensor.svg',
  flippersensors_color:                      'ColorSensor.svg',
  flippersensors_isReflectivity:             'ColorSensor.svg',
  flippersensors_reflectivity:               'ColorSensor.svg',
  flippersensors_isPressed:                  'ForceSensor.svg',
  flippersensors_force:                      'ForceSensor.svg',
  flippersensors_isDistance:                 'UltraSound.svg',
  flippersensors_distance:                   'UltraSound.svg',
  flippersensors_isTilted:                   'Hub.svg',
  flippersensors_isorientation:              'Hub.svg',
  flippersensors_ismotion:                   'Hub.svg',
  flippersensors_orientationAxis:            'Hub.svg',
  flippersensors_resetYaw:                   'Hub.svg',
  flippersensors_buttonIsPressed:            'Hub.svg',

  flippermoremotor_motorGoToRelativePosition:'Motors.svg',
  flippermoremotor_motorStartPower:          'Motors.svg',
  flippermoremotor_motorSetStopMethod:       'Motors.svg',
  flippermoremotor_motorSetAcceleration:     'Motors.svg',
  flippermoremotor_motorSetDegreeCounted:    'Motors.svg',
  flippermoremotor_power:                    'Motors.svg',
  flippermoremotor_position:                 'Motors.svg',
  flippermoremove_movementSetStopMethod:     'Movement.svg',
  flippermoremove_startDualSpeed:            'Movement.svg',
  flippermoremove_movementSetAcceleration:   'Movement.svg',
  flippermoresensors_setOrientation:         'Hub.svg',
  flippermoresensors_rawColor:               'ColorSensor.svg',
  flippermoresensors_acceleration:           'Hub.svg',
  flippermoresensors_angularVelocity:        'Hub.svg',
  flippermoresensors_orientation:            'Hub.svg',
  flippermoresensors_motion:                 'Hub.svg',
};

// Prepend a field_image to message0/args0 of every block that has an emblem.
// LEGO's SPIKE word blocks place the category icon on the LEFT edge of every
// block (hat, stack, reporter, boolean alike). To make room, every existing
// %N placeholder in message0 is shifted by 1 and the icon takes %1.
function _withEmblem(block) {
  const icon = _ICON_FOR_TYPE[block.type];
  if (!icon) return block;
  const shifted = (block.message0 || '').replace(/%(\d+)/g, (_, n) => `%${parseInt(n, 10) + 1}`);
  return {
    ...block,
    message0: `%1 ${shifted}`,
    args0: [
      { type: 'field_image', src: 'static/icons/' + icon, width: 24, height: 24, alt: '' },
      ...(block.args0 || []),
    ],
  };
}

// ── Block definitions ────────────────────────────────────────────────────────
const SPIKE_BLOCKS = [

  // ── MOTOR ───────────────────────────────────────────────────────────────────

  { type: 'flippermotor_motorTurnForDirection',
    message0: '%1 run %2 for %3 %4',
    args0: [
      { type: 'field_dropdown', name: 'PORT',      options: _PORTS_MULTI },
      { type: 'field_dropdown', name: 'DIRECTION', options: _DIR_CW_CCW },
      { type: 'input_value',    name: 'VALUE',     check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',      options: _MOTOR_UNITS },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Run a motor for the specified amount.',
  },

  { type: 'flippermotor_motorGoDirectionToPosition',
    message0: '%1 go %3 to position %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',      options: _PORTS_MULTI },
      { type: 'input_value',    name: 'POSITION',  check: ['Number','String'] },
      { type: 'field_dropdown', name: 'DIRECTION', options: _SHORTEST },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Rotate motor to an absolute position (0–359 degrees).',
  },

  { type: 'flippermotor_motorStartDirection',
    message0: '%1 start motor %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',      options: _PORTS_MULTI },
      { type: 'field_dropdown', name: 'DIRECTION', options: _DIR_CW_CCW },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Start a motor running until stopped.',
  },

  { type: 'flippermotor_motorStop',
    message0: '%1 stop motor',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_MULTI }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Stop a motor.',
  },

  { type: 'flippermotor_motorSetSpeed',
    message0: '%1 set speed to %2 %%',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS_MULTI },
      { type: 'input_value',    name: 'SPEED', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Set default motor speed (-100 to 100).',
  },

  { type: 'flippermotor_absolutePosition',
    message0: '%1 position',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE }],
    output: 'Number', colour: C_MOTOR,
    tooltip: 'Current motor position in degrees (0–359).',
  },

  { type: 'flippermotor_speed',
    message0: '%1 speed',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE }],
    output: 'Number', colour: C_MOTOR,
    tooltip: 'Current motor speed.',
  },

  // ── MOVEMENT ────────────────────────────────────────────────────────────────

  { type: 'flippermove_move',
    message0: 'move %1 for %2 %3',
    args0: [
      { type: 'field_dropdown', name: 'DIRECTION', options: _DIR_FW_BW },
      { type: 'input_value',    name: 'VALUE',     check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',      options: _MOVE_UNITS },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Move forward or backward for a given duration.',
  },

  { type: 'flippermove_startMove',
    message0: 'start moving %1',
    args0: [{ type: 'field_dropdown', name: 'DIRECTION', options: _DIR_FW_BW }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Start moving forward or backward.',
  },

  { type: 'flippermove_steer',
    message0: 'move at steering %1 for %2 %3',
    args0: [
      { type: 'input_value',    name: 'STEERING', check: ['Number','String'] },
      { type: 'input_value',    name: 'VALUE',    check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',     options: _MOTOR_UNITS },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Move with steering (-100..100) for a duration.',
  },

  { type: 'flippermove_startSteer',
    message0: 'start moving at steering %1',
    args0: [{ type: 'input_value', name: 'STEERING', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Start moving with steering.',
  },

  { type: 'flippermove_stopMove',
    message0: 'stop moving',
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Stop the movement motors.',
  },

  { type: 'flippermove_movementSpeed',
    message0: 'set movement speed to %1 %%',
    args0: [{ type: 'input_value', name: 'SPEED', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Set default movement speed (-100 to 100).',
  },

  { type: 'flippermove_setMovementPair',
    message0: 'set movement motors to %1',
    args0: [{ type: 'field_dropdown', name: 'PAIR', options: _PAIRS }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Choose which two ports drive the robot.',
  },

  { type: 'flippermove_setDistance',
    message0: 'set 1 motor rotation to %1 %2 moved',
    args0: [
      { type: 'input_value',    name: 'DISTANCE', check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',     options: _DIST_UNITS },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Calibrate distance per motor rotation.',
  },

  // ── LIGHT ───────────────────────────────────────────────────────────────────

  { type: 'flipperlight_lightDisplayImageOnForTime',
    message0: 'turn on %1 for %2 seconds',
    args0: [
      { type: 'input_value', name: 'MATRIX',  check: 'String' },
      { type: 'input_value', name: 'VALUE',   check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Light pattern (5×5 brightness, e.g. "9909999099000009000909990") for N seconds.',
  },

  { type: 'flipperlight_lightDisplayImageOn',
    message0: 'turn on %1',
    args0: [{ type: 'input_value', name: 'MATRIX', check: 'String' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Light a 5×5 brightness pattern.',
  },

  { type: 'flipperlight_lightDisplayText',
    message0: 'write %1',
    args0: [{ type: 'input_value', name: 'TEXT', check: ['String','Number'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Scroll text on the 5×5 light matrix.',
  },

  { type: 'flipperlight_lightDisplayOff',
    message0: 'turn off pixels',
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Turn off all light-matrix pixels.',
  },

  { type: 'flipperlight_lightDisplaySetBrightness',
    message0: 'set pixel brightness to %1 %%',
    args0: [{ type: 'input_value', name: 'BRIGHTNESS', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Set brightness for all already-lit pixels.',
  },

  { type: 'flipperlight_lightDisplaySetPixel',
    message0: 'set pixel at %1 , %2 to %3 %%',
    args0: [
      { type: 'input_value', name: 'X',          check: ['Number','String'] },
      { type: 'input_value', name: 'Y',          check: ['Number','String'] },
      { type: 'input_value', name: 'BRIGHTNESS', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Set one pixel (1..5, 1..5) to brightness %.',
  },

  { type: 'flipperlight_lightDisplayRotate',
    message0: 'rotate %1',
    args0: [{ type: 'field_dropdown', name: 'DIRECTION', options: _LIGHT_DIR }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Rotate the light-matrix orientation.',
  },

  { type: 'flipperlight_lightDisplaySetOrientation',
    message0: 'set orientation to %1',
    args0: [{ type: 'field_dropdown', name: 'ORIENTATION', options: _DISP_ORIENT }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Set the light-matrix orientation.',
  },

  { type: 'flipperlight_centerButtonLight',
    message0: 'set centre button light to %1',
    args0: [{ type: 'field_dropdown', name: 'COLOR', options: _CENTRE_BTN_COLORS }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Set the centre button colour.',
  },

  { type: 'flipperlight_ultrasonicLightUp',
    message0: 'distance sensor %1 light up %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS_SINGLE },
      { type: 'input_value',    name: 'VALUE', check: 'String' },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Light up the distance sensor LEDs (e.g. "100 100 100 100").',
  },

  // ── SOUND ───────────────────────────────────────────────────────────────────

  { type: 'flippersound_playSoundUntilDone',
    message0: 'play sound %1 until done',
    args0: [{ type: 'field_dropdown', name: 'SOUND', options: _SOUNDS }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Play a sound and wait for it to finish.',
  },

  { type: 'flippersound_playSound',
    message0: 'start sound %1',
    args0: [{ type: 'field_dropdown', name: 'SOUND', options: _SOUNDS }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Start a sound without waiting.',
  },

  { type: 'flippersound_beepForTime',
    message0: 'play beep %1 for %2 seconds',
    args0: [
      { type: 'input_value', name: 'NOTE',     check: ['Number','String'] },
      { type: 'input_value', name: 'DURATION', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Play a piano note (48–108) for N seconds.',
  },

  { type: 'flippersound_beep',
    message0: 'start playing beep %1',
    args0: [{ type: 'input_value', name: 'NOTE', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Start a piano note without waiting.',
  },

  { type: 'flippersound_stopSound',
    message0: 'stop all sounds',
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Stop every playing sound.',
  },

  { type: 'sound_changeeffectby',
    message0: 'change %1 effect by %2',
    args0: [
      { type: 'field_dropdown', name: 'EFFECT', options: _SOUND_FX },
      { type: 'input_value',    name: 'VALUE',  check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Change a sound effect parameter.',
  },

  { type: 'sound_seteffectto',
    message0: 'set %1 effect to %2',
    args0: [
      { type: 'field_dropdown', name: 'EFFECT', options: _SOUND_FX },
      { type: 'input_value',    name: 'VALUE',  check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Set a sound effect parameter.',
  },

  { type: 'sound_cleareffects',
    message0: 'clear sound effects',
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Clear all sound effects.',
  },

  { type: 'sound_changevolumeby',
    message0: 'change volume by %1',
    args0: [{ type: 'input_value', name: 'VOLUME', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Change volume by an amount.',
  },

  { type: 'sound_setvolumeto',
    message0: 'set volume to %1 %%',
    args0: [{ type: 'input_value', name: 'VOLUME', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_SOUND, tooltip: 'Set the sound volume (0–100).',
  },

  { type: 'sound_volume',
    message0: 'volume',
    output: 'Number', colour: C_SOUND,
    tooltip: 'Current volume reporter.',
  },

  // ── EVENTS (hat blocks) ─────────────────────────────────────────────────────

  { type: 'flipperevents_whenProgramStarts',
    message0: 'when program starts',
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the program starts.',
  },

  { type: 'flipperevents_whenColor',
    message0: 'when colour sensor on %1 sees %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',   options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'OPTION', options: _COLORS },
    ],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the colour sensor sees a specific colour.',
  },

  { type: 'flipperevents_whenPressed',
    message0: 'when force sensor on %1 is %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',   options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'OPTION', options: _PRESS_OPT },
    ],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the force sensor changes state.',
  },

  { type: 'flipperevents_whenDistance',
    message0: 'when distance sensor on %1 is %2 %3 %4',
    args0: [
      { type: 'field_dropdown', name: 'PORT',       options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'COMPARATOR', options: _COMPARE },
      { type: 'input_value',    name: 'VALUE',      check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',       options: _DIST_RANGE },
    ],
    inputsInline: true, nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when distance crosses a threshold.',
  },

  { type: 'flipperevents_whenTilted',
    message0: 'when tilted %1',
    args0: [{ type: 'field_dropdown', name: 'VALUE', options: _TILT }],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the hub is tilted in a direction.',
  },

  { type: 'flipperevents_whenOrientation',
    message0: 'when %1 is up',
    args0: [{ type: 'field_dropdown', name: 'VALUE', options: _ORIENT }],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the named hub face points up.',
  },

  { type: 'flipperevents_whenGesture',
    message0: 'when hub %1',
    args0: [{ type: 'field_dropdown', name: 'EVENT', options: _GESTURE }],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the hub is shaken, tapped or falling.',
  },

  { type: 'flipperevents_whenButton',
    message0: 'when %1 button %2',
    args0: [
      { type: 'field_dropdown', name: 'BUTTON', options: _BTN_LR },
      { type: 'field_dropdown', name: 'EVENT',  options: _BTN_EVT },
    ],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when a hub button is pressed or released.',
  },

  { type: 'flipperevents_whenTimer',
    message0: 'when timer > %1',
    args0: [{ type: 'input_value', name: 'VALUE', check: ['Number','String'] }],
    inputsInline: true, nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the timer exceeds a value.',
  },

  { type: 'flipperevents_whenCondition',
    message0: 'when %1',
    args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    inputsInline: true, nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when a boolean condition becomes true.',
  },

  { type: 'event_whenbroadcastreceived',
    message0: 'when I receive %1',
    args0: [{ type: 'field_input', name: 'BROADCAST_OPTION', text: 'message1' }],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the named broadcast is sent.',
  },

  { type: 'event_broadcast',
    message0: 'broadcast %1',
    args0: [{ type: 'input_value', name: 'BROADCAST_INPUT', check: ['String','broadcast'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_EVENT, tooltip: 'Send a broadcast.',
  },

  { type: 'event_broadcastandwait',
    message0: 'broadcast %1 and wait',
    args0: [{ type: 'input_value', name: 'BROADCAST_INPUT', check: ['String','broadcast'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_EVENT, tooltip: 'Send a broadcast and wait for receivers.',
  },

  // ── CONTROL ────────────────────────────────────────────────────────────────

  { type: 'control_wait',
    message0: 'wait %1 seconds',
    args0: [{ type: 'input_value', name: 'DURATION', check: ['Number','String'] }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'Wait for the given number of seconds.',
  },

  { type: 'control_repeat',
    message0: 'repeat %1',
    args0: [{ type: 'input_value', name: 'TIMES', check: ['Number','String'] }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'Repeat blocks N times.',
  },

  { type: 'control_forever',
    message0: 'forever',
    message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
    inputsInline: true, previousStatement: null,
    colour: C_CONTROL, tooltip: 'Repeat the enclosed blocks forever.',
  },

  { type: 'control_if',
    message0: 'if %1 then', args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'Run blocks when condition is true.',
  },

  { type: 'control_if_else',
    message0: 'if %1 then', args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
    message2: 'else',
    message3: '%1', args3: [{ type: 'input_statement', name: 'SUBSTACK2' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'If/else conditional.',
  },

  { type: 'control_wait_until',
    message0: 'wait until %1',
    args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'Pause until a condition becomes true.',
  },

  { type: 'control_repeat_until',
    message0: 'repeat until %1', args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'Repeat blocks until a condition becomes true.',
  },

  { type: 'flippercontrol_stopOtherStacks',
    message0: 'stop other stacks',
    previousStatement: null, nextStatement: null,
    colour: C_CONTROL, tooltip: 'Stop all other parallel stacks.',
  },

  { type: 'flippercontrol_stop',
    message0: 'stop %1',
    args0: [{ type: 'field_dropdown', name: 'STOP_OPTION', options: _STOP_KIND }],
    previousStatement: null,
    colour: C_CONTROL, tooltip: 'Stop this stack, all stacks, or the program.',
  },

  // ── SENSOR ──────────────────────────────────────────────────────────────────

  { type: 'flippersensors_isColor',
    message0: 'colour sensor on %1 is %2 ?',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'VALUE', options: _COLORS },
    ],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the sensor sees the given colour.',
  },

  { type: 'flippersensors_color',
    message0: 'colour sensor on %1 colour',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE }],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Detected colour code.',
  },

  { type: 'flippersensors_isReflectivity',
    message0: 'colour sensor on %1 reflection %2 %3 %%',
    args0: [
      { type: 'field_dropdown', name: 'PORT',       options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'COMPARATOR', options: _COMPARE_LT },
      { type: 'input_value',    name: 'VALUE',      check: ['Number','String'] },
    ],
    output: 'Boolean', inputsInline: true, colour: C_SENSOR,
    tooltip: 'Compare reflected light to a percentage.',
  },

  { type: 'flippersensors_reflectivity',
    message0: 'colour sensor on %1 reflected light',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE }],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Reflected-light percentage (0–100).',
  },

  { type: 'flippersensors_isPressed',
    message0: 'force sensor on %1 is %2 ?',
    args0: [
      { type: 'field_dropdown', name: 'PORT',   options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'OPTION', options: _PRESS_IS },
    ],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the force sensor is pressed/released.',
  },

  { type: 'flippersensors_force',
    message0: 'force sensor on %1 pressure in %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'UNIT', options: _FORCE_UNITS },
    ],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Pressure on the force sensor.',
  },

  { type: 'flippersensors_isDistance',
    message0: 'distance sensor on %1 is %2 %3 %4 ?',
    args0: [
      { type: 'field_dropdown', name: 'PORT',       options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'COMPARATOR', options: _COMPARE },
      { type: 'input_value',    name: 'VALUE',      check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',       options: _DIST_RANGE },
    ],
    output: 'Boolean', inputsInline: true, colour: C_SENSOR,
    tooltip: 'True when the distance comparator is satisfied.',
  },

  { type: 'flippersensors_distance',
    message0: 'distance sensor on %1 distance in %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'UNIT', options: _DIST_RANGE },
    ],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Distance to the nearest object.',
  },

  { type: 'flippersensors_isTilted',
    message0: 'is tilted %1 ?',
    args0: [{ type: 'field_dropdown', name: 'VALUE', options: _TILT }],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the hub is tilted in the direction.',
  },

  { type: 'flippersensors_isorientation',
    message0: 'is %1 up?',
    args0: [{ type: 'field_dropdown', name: 'ORIENTATION', options: _ORIENT }],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the named hub face points up.',
  },

  { type: 'flippersensors_ismotion',
    message0: 'is %1 ?',
    args0: [{ type: 'field_dropdown', name: 'MOTION', options: _MOTION }],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the hub is shaken, tapped or falling.',
  },

  { type: 'flippersensors_orientationAxis',
    message0: 'hub %1 angle',
    args0: [{ type: 'field_dropdown', name: 'AXIS', options: _AXIS_PRY }],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Hub pitch/roll/yaw in degrees.',
  },

  { type: 'flippersensors_resetYaw',
    message0: 'set yaw angle to 0',
    previousStatement: null, nextStatement: null,
    colour: C_SENSOR, tooltip: 'Reset the yaw (heading) angle.',
  },

  { type: 'flippersensors_buttonIsPressed',
    message0: 'is %1 button %2 ?',
    args0: [
      { type: 'field_dropdown', name: 'BUTTON', options: _BTN_LR },
      { type: 'field_dropdown', name: 'EVENT',  options: _BTN_EVT },
    ],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the named button is in that state.',
  },

  { type: 'flippersensors_timer',
    message0: 'timer',
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Seconds since last reset.',
  },

  { type: 'flippersensors_resetTimer',
    message0: 'reset timer',
    previousStatement: null, nextStatement: null,
    colour: C_SENSOR, tooltip: 'Reset the timer to 0.',
  },

  // ── OPERATOR ────────────────────────────────────────────────────────────────

  { type: 'operator_random',
    message0: 'pick random %1 to %2',
    args0: [
      { type: 'input_value', name: 'FROM' },
      { type: 'input_value', name: 'TO' },
    ],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
    tooltip: 'Random integer between FROM and TO inclusive.',
  },

  { type: 'operator_add',
    message0: '%1 + %2',
    args0: [{ type: 'input_value', name: 'NUM1' }, { type: 'input_value', name: 'NUM2' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_subtract',
    message0: '%1 − %2',
    args0: [{ type: 'input_value', name: 'NUM1' }, { type: 'input_value', name: 'NUM2' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_multiply',
    message0: '%1 × %2',
    args0: [{ type: 'input_value', name: 'NUM1' }, { type: 'input_value', name: 'NUM2' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_divide',
    message0: '%1 ÷ %2',
    args0: [{ type: 'input_value', name: 'NUM1' }, { type: 'input_value', name: 'NUM2' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_lt',
    message0: '%1 < %2',
    args0: [{ type: 'input_value', name: 'OPERAND1' }, { type: 'input_value', name: 'OPERAND2' }],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_equals',
    message0: '%1 = %2',
    args0: [{ type: 'input_value', name: 'OPERAND1' }, { type: 'input_value', name: 'OPERAND2' }],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_gt',
    message0: '%1 > %2',
    args0: [{ type: 'input_value', name: 'OPERAND1' }, { type: 'input_value', name: 'OPERAND2' }],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_and',
    message0: '%1 and %2',
    args0: [
      { type: 'input_value', name: 'OPERAND1', check: 'Boolean' },
      { type: 'input_value', name: 'OPERAND2', check: 'Boolean' },
    ],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_or',
    message0: '%1 or %2',
    args0: [
      { type: 'input_value', name: 'OPERAND1', check: 'Boolean' },
      { type: 'input_value', name: 'OPERAND2', check: 'Boolean' },
    ],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_not',
    message0: 'not %1',
    args0: [{ type: 'input_value', name: 'OPERAND', check: 'Boolean' }],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'flipperoperator_isInBetween',
    message0: 'is %1 between %2 and %3 ?',
    args0: [
      { type: 'input_value', name: 'VALUE' },
      { type: 'input_value', name: 'LOW' },
      { type: 'input_value', name: 'HIGH' },
    ],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_join',
    message0: 'join %1 %2',
    args0: [
      { type: 'input_value', name: 'STRING1', check: 'String' },
      { type: 'input_value', name: 'STRING2', check: 'String' },
    ],
    inputsInline: true, output: 'String', colour: C_OPERATOR,
  },

  { type: 'operator_letter_of',
    message0: 'letter %1 of %2',
    args0: [
      { type: 'input_value', name: 'LETTER' },
      { type: 'input_value', name: 'STRING', check: 'String' },
    ],
    inputsInline: true, output: 'String', colour: C_OPERATOR,
  },

  { type: 'operator_length',
    message0: 'length of %1',
    args0: [{ type: 'input_value', name: 'STRING', check: 'String' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_contains',
    message0: '%1 contains %2 ?',
    args0: [
      { type: 'input_value', name: 'STRING1', check: 'String' },
      { type: 'input_value', name: 'STRING2', check: 'String' },
    ],
    inputsInline: true, output: 'Boolean', colour: C_OPERATOR,
  },

  { type: 'operator_mod',
    message0: '%1 mod %2',
    args0: [{ type: 'input_value', name: 'NUM1' }, { type: 'input_value', name: 'NUM2' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_round',
    message0: 'round %1',
    args0: [{ type: 'input_value', name: 'NUM' }],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  { type: 'operator_mathop',
    message0: '%1 of %2',
    args0: [
      { type: 'field_dropdown', name: 'OPERATOR', options: _MATHOP },
      { type: 'input_value',    name: 'NUM' },
    ],
    inputsInline: true, output: 'Number', colour: C_OPERATOR,
  },

  // ── MORE-MOVEMENT ───────────────────────────────────────────────────────────

  { type: 'flippermoremove_movementSetStopMethod',
    message0: 'set movement motors to %1 at stop',
    args0: [{ type: 'field_dropdown', name: 'STOP', options: _STOP_METHOD }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Choose how the drive motors stop.',
  },

  { type: 'flippermoremove_startDualSpeed',
    message0: 'start moving at %1 %% / %2 %% speed',
    args0: [
      { type: 'input_value', name: 'LEFT',  check: ['Number','String'] },
      { type: 'input_value', name: 'RIGHT', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Start moving with independent left/right speeds.',
  },

  { type: 'flippermoremove_movementSetAcceleration',
    message0: 'set movement acceleration to %1',
    args0: [{ type: 'field_dropdown', name: 'ACCELERATION', options: _ACCEL }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Choose acceleration profile (slow/medium/fast).',
  },

  // ── MORE-MOTOR ──────────────────────────────────────────────────────────────

  { type: 'flippermoremotor_motorGoToRelativePosition',
    message0: 'go motor %1 to relative position %2 at %3 %% speed',
    args0: [
      { type: 'field_dropdown', name: 'PORT',     options: _PORTS_MULTI },
      { type: 'input_value',    name: 'POSITION', check: ['Number','String'] },
      { type: 'input_value',    name: 'SPEED',    check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Move motor to a relative position.',
  },

  { type: 'flippermoremotor_motorStartPower',
    message0: 'start motor %1 at %2 %% power',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS_MULTI },
      { type: 'input_value',    name: 'POWER', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Run motor at a specific power level.',
  },

  { type: 'flippermoremotor_motorSetStopMethod',
    message0: 'set motor %1 to %2 at stop',
    args0: [
      { type: 'field_dropdown', name: 'PORT', options: _PORTS_MULTI },
      { type: 'field_dropdown', name: 'STOP', options: _STOP_METHOD },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Choose stopping behaviour for a motor.',
  },

  { type: 'flippermoremotor_motorSetAcceleration',
    message0: 'set motor %1 acceleration to %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',         options: _PORTS_MULTI },
      { type: 'field_dropdown', name: 'ACCELERATION', options: _ACCEL },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Choose motor acceleration profile.',
  },

  { type: 'flippermoremotor_motorSetDegreeCounted',
    message0: 'set motor %1 relative position to %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS_MULTI },
      { type: 'input_value',    name: 'VALUE', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Reset the motor’s degree counter.',
  },

  { type: 'flippermoremotor_power',
    message0: 'motor %1 power',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE }],
    output: 'Number', colour: C_MOTOR, tooltip: 'Motor power reporter.',
  },

  { type: 'flippermoremotor_position',
    message0: 'motor %1 relative position',
    args0: [{ type: 'field_dropdown', name: 'PORT', options: _PORTS_SINGLE }],
    output: 'Number', colour: C_MOTOR, tooltip: 'Motor relative position reporter.',
  },

  // ── MORE-SENSOR ─────────────────────────────────────────────────────────────

  { type: 'flippermoresensors_setOrientation',
    message0: 'set yaw axis to %1',
    args0: [{ type: 'field_dropdown', name: 'UP', options: _ORIENT_UP }],
    previousStatement: null, nextStatement: null,
    colour: C_SENSOR, tooltip: 'Tell the hub which face is up.',
  },

  { type: 'flippermoresensors_rawColor',
    message0: 'colour sensor on %1 raw %2',
    args0: [
      { type: 'field_dropdown', name: 'PORT',  options: _PORTS_SINGLE },
      { type: 'field_dropdown', name: 'COLOR', options: _RAW_RGB },
    ],
    output: 'Number', colour: C_SENSOR, tooltip: 'Raw R/G/B reading from colour sensor.',
  },

  { type: 'flippermoresensors_acceleration',
    message0: 'acceleration %1',
    args0: [{ type: 'field_dropdown', name: 'AXIS', options: _AXIS_XYZ }],
    output: 'Number', colour: C_SENSOR, tooltip: 'Hub linear acceleration on axis.',
  },

  { type: 'flippermoresensors_angularVelocity',
    message0: 'angular velocity %1',
    args0: [{ type: 'field_dropdown', name: 'AXIS', options: _AXIS_XYZ }],
    output: 'Number', colour: C_SENSOR, tooltip: 'Hub angular velocity on axis.',
  },

  { type: 'flippermoresensors_orientation',
    message0: 'orientation',
    output: 'Number', colour: C_SENSOR, tooltip: 'Hub orientation reporter.',
  },

  { type: 'flippermoresensors_motion',
    message0: 'gesture',
    output: 'Number', colour: C_SENSOR, tooltip: 'Last detected gesture.',
  },
];

// ── JavaScript Code Generators ───────────────────────────────────────────────
//
// Generators emit JS that calls the existing RobotSimulator API directly via
// window.sim.  Run-time state variables (_moveSpeed, _movePair, _moveRotMM,
// _distMoved, _timerMs, _motorSpeed, _motorAccel, _moveAccel, _stopMethod, etc.)
// are seeded by generateBlocklyJS()'s preamble.

const _SOUND_NOTES = { cat: 69, dog: 57, tada: 72, motor: 50, beep: 65 };
const _WHEEL_CIRC_MM = Math.PI * 56;
const _MM_PER_MS_AT_100 = 0.9;

// Map LEGO colour index → simulator colour name.
const _COLOR_INDEX_TO_NAME = {
  '-1': 'none',
  '0':  'black',
  '1':  'violet',
  '3':  'blue',
  '4':  'cyan',
  '5':  'cyan',
  '7':  'green',
  '9':  'yellow',
  '10': 'white',
};

function _colorIndexToName(idx) { return _COLOR_INDEX_TO_NAME[String(idx)] || 'none'; }

function registerGenerators(Blockly) {
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return;

  const ORDER_NONE   = js.ORDER_NONE   ?? js.ORDER_ATOMIC ?? 0;
  const ORDER_ATOMIC = js.ORDER_ATOMIC ?? 0;

  // valueToCode helper that supplies a literal default
  const val = (block, name, def = '0') => js.valueToCode(block, name, ORDER_NONE) || def;

  const motorVDir = (dir) => dir === 'counterclockwise' ? -1 : 1;
  const moveDir   = (dir) => dir === 'back' ? -1 : 1;

  // ── Motor ──────────────────────────────────────────────────────────────────

  js['flippermotor_motorTurnForDirection'] = (block) => {
    const port = block.getFieldValue('PORT');
    const dir  = motorVDir(block.getFieldValue('DIRECTION'));
    const unit = block.getFieldValue('UNIT');
    const v    = val(block, 'VALUE', '1');
    let distMM;
    if (unit === 'rotations') distMM = `(Math.abs(${v}) * ${_WHEEL_CIRC_MM})`;
    else if (unit === 'degrees') distMM = `((Math.abs(${v}) / 360) * ${_WHEEL_CIRC_MM})`;
    else distMM = `(Math.abs(${v}) * ${_MM_PER_MS_AT_100} * 1000 * (_motorSpeed/100))`;
    return `await window.sim._animateSingleMotor('${port}', _motorSpeed/100*${dir}, ${distMM});\n`;
  };

  js['flippermotor_motorGoDirectionToPosition'] = (block) => {
    const port = block.getFieldValue('PORT');
    const dir  = block.getFieldValue('DIRECTION');
    const pos  = val(block, 'POSITION', '0');
    let sign;
    if (dir === 'clockwise') sign = '1';
    else if (dir === 'counterclockwise') sign = '-1';
    else sign = '(((window.sim.getMotorPosition("' + port + '") - ' + pos + ' + 540) % 360 - 180) > 0 ? -1 : 1)';
    return `await window.sim._animateSingleMotor('${port}', _motorSpeed/100*${sign}, (Math.abs(${pos}) / 360) * ${_WHEEL_CIRC_MM});\n`;
  };

  js['flippermotor_motorStartDirection'] = (block) => {
    const port = block.getFieldValue('PORT');
    const dir  = motorVDir(block.getFieldValue('DIRECTION'));
    return `window.sim._animateSingleMotor('${port}', _motorSpeed/100*${dir}, 5000);\n`;
  };

  js['flippermotor_motorStop'] = (_block) => `window.sim.stop();\nawait window.sim._sleep(50);\n`;

  js['flippermotor_motorSetSpeed'] = (block) => {
    const speed = val(block, 'SPEED', '75');
    return `_motorSpeed = ${speed};\n`;
  };

  js['flippermotor_absolutePosition'] = (block) => {
    const port = block.getFieldValue('PORT');
    return [`((window.sim.getMotorPosition('${port}') % 360 + 360) % 360)`, ORDER_ATOMIC];
  };

  js['flippermotor_speed'] = (block) => {
    const port = block.getFieldValue('PORT');
    return [`window.sim.getMotorSpeed('${port}')`, ORDER_ATOMIC];
  };

  // ── Movement ───────────────────────────────────────────────────────────────

  js['flippermove_move'] = (block) => {
    const dir  = moveDir(block.getFieldValue('DIRECTION'));
    const unit = block.getFieldValue('UNIT');
    const v    = val(block, 'VALUE', '10');
    let distMM;
    if (unit === 'cm')           distMM = `(${v} * 10)`;
    else if (unit === 'inches')  distMM = `(${v} * 25.4)`;
    else if (unit === 'rotations') distMM = `(${v} * _moveRotMM)`;
    else if (unit === 'degrees')  distMM = `((${v} / 360) * _moveRotMM)`;
    else                         distMM = `(${v} * _moveSpeed/100 * ${_MM_PER_MS_AT_100} * 1000)`;
    return `_distMoved += ${distMM} / 10;\nawait window.sim._animateTank(_moveSpeed/100*${dir}, _moveSpeed/100*${dir}, ${distMM});\n`;
  };

  js['flippermove_startMove'] = (block) => {
    const dir = moveDir(block.getFieldValue('DIRECTION'));
    return `window.sim._animateTank(_moveSpeed/100*${dir}, _moveSpeed/100*${dir}, 5000);\n`;
  };

  js['flippermove_steer'] = (block) => {
    const steer = val(block, 'STEERING', '0');
    const v     = val(block, 'VALUE', '10');
    const unit  = block.getFieldValue('UNIT');
    let distMM;
    if (unit === 'rotations')      distMM = `(${v} * _moveRotMM)`;
    else if (unit === 'degrees')   distMM = `((${v} / 360) * _moveRotMM)`;
    else                           distMM = `(${v} * _moveSpeed/100 * ${_MM_PER_MS_AT_100} * 1000)`;
    return `{ const _s = (${steer})/100; _distMoved += ${distMM} / 10; await window.sim._animateTank(_moveSpeed/100*(1+_s), _moveSpeed/100*(1-_s), ${distMM}); }\n`;
  };

  js['flippermove_startSteer'] = (block) => {
    const steer = val(block, 'STEERING', '0');
    return `{ const _s = (${steer})/100; window.sim._animateTank(_moveSpeed/100*(1+_s), _moveSpeed/100*(1-_s), 5000); }\n`;
  };

  js['flippermove_stopMove'] = (_block) => `window.sim.stop();\nawait window.sim._sleep(50);\n`;

  js['flippermove_movementSpeed'] = (block) => {
    const speed = val(block, 'SPEED', '50');
    return `_moveSpeed = ${speed};\n`;
  };

  js['flippermove_setMovementPair'] = (block) => {
    const pair = block.getFieldValue('PAIR');
    return `_movePairL = '${pair[0]}'; _movePairR = '${pair[1]}';\n`;
  };

  js['flippermove_setDistance'] = (block) => {
    const dist = val(block, 'DISTANCE', '17.5');
    const unit = block.getFieldValue('UNIT');
    const factor = unit === 'inches' ? '25.4' : '10';
    return `_moveRotMM = (${dist}) * ${factor};\n`;
  };

  // ── Light ──────────────────────────────────────────────────────────────────

  js['flipperlight_lightDisplayImageOnForTime'] = (block) => {
    const matrix = val(block, 'MATRIX', "'9909999099000009000909990'");
    const sec    = val(block, 'VALUE',  '2');
    return `{ const _m = String(${matrix}).padEnd(25, '0'); window.sim.robot.display = Array.from(_m).slice(0,25).map(c => Number(c)*11); await window.sim._sleep((${sec}) * 1000 / window.sim.speedMult); window.sim.robot.display = Array(25).fill(0); }\n`;
  };

  js['flipperlight_lightDisplayImageOn'] = (block) => {
    const matrix = val(block, 'MATRIX', "'9909999099000009000909990'");
    return `{ const _m = String(${matrix}).padEnd(25, '0'); window.sim.robot.display = Array.from(_m).slice(0,25).map(c => Number(c)*11); }\n`;
  };

  js['flipperlight_lightDisplayText'] = (block) => {
    const text = val(block, 'TEXT', "'Hello'");
    return `window.sim._showText(String(${text}));\n`;
  };

  js['flipperlight_lightDisplayOff'] = (_block) =>
    `window.sim.robot.display = Array(25).fill(0);\n`;

  js['flipperlight_lightDisplaySetBrightness'] = (block) => {
    const bri = val(block, 'BRIGHTNESS', '75');
    return `{ const _b = ${bri}; window.sim.robot.display = window.sim.robot.display.map(p => p > 0 ? _b : 0); }\n`;
  };

  js['flipperlight_lightDisplaySetPixel'] = (block) => {
    const x   = val(block, 'X', '1');
    const y   = val(block, 'Y', '1');
    const bri = val(block, 'BRIGHTNESS', '100');
    return `{ const _x = (${x})-1, _y = (${y})-1; if (_x>=0 && _x<5 && _y>=0 && _y<5) window.sim.robot.display[_y*5 + _x] = ${bri}; }\n`;
  };

  js['flipperlight_lightDisplayRotate']        = (_b) => `// rotate light display\n`;
  js['flipperlight_lightDisplaySetOrientation']= (_b) => `// set light orientation\n`;
  js['flipperlight_centerButtonLight']         = (b)  => `// centre button → ${b.getFieldValue('COLOR')}\n`;
  js['flipperlight_ultrasonicLightUp']         = (_b) => `// distance sensor LEDs\n`;

  // ── Sound ──────────────────────────────────────────────────────────────────

  js['flippersound_playSoundUntilDone'] = (block) => {
    const note = _SOUND_NOTES[block.getFieldValue('SOUND')] || 60;
    return `window.sim._playBeep(${note}, 500); await window.sim._sleep(500 / window.sim.speedMult);\n`;
  };

  js['flippersound_playSound'] = (block) => {
    const note = _SOUND_NOTES[block.getFieldValue('SOUND')] || 60;
    return `window.sim._playBeep(${note}, 500);\n`;
  };

  js['flippersound_beepForTime'] = (block) => {
    const note = val(block, 'NOTE', '60');
    const dur  = val(block, 'DURATION', '0.2');
    return `{ const _n = ${note}, _d = (${dur}) * 1000; window.sim._playBeep(_n, _d); await window.sim._sleep(_d / window.sim.speedMult); }\n`;
  };

  js['flippersound_beep'] = (block) => {
    const note = val(block, 'NOTE', '60');
    return `window.sim._playBeep(${note}, 500);\n`;
  };

  js['flippersound_stopSound'] = (_b) => `// stop all sounds\n`;
  js['sound_changeeffectby']   = (_b) => `// change sound effect\n`;
  js['sound_seteffectto']      = (_b) => `// set sound effect\n`;
  js['sound_cleareffects']     = (_b) => `// clear sound effects\n`;

  js['sound_changevolumeby'] = (block) => {
    const v = val(block, 'VOLUME', '-10');
    return `window._blkVolume = Math.max(0, Math.min(100, (window._blkVolume ?? 100) + (${v})));\n`;
  };

  js['sound_setvolumeto'] = (block) => {
    const v = val(block, 'VOLUME', '100');
    return `window._blkVolume = ${v};\n`;
  };

  js['sound_volume'] = (_b) => [`(window._blkVolume ?? 100)`, ORDER_ATOMIC];

  // ── Events (hat blocks → empty body chain) ─────────────────────────────────

  for (const t of [
    'flipperevents_whenProgramStarts','flipperevents_whenColor','flipperevents_whenPressed',
    'flipperevents_whenDistance','flipperevents_whenTilted','flipperevents_whenOrientation',
    'flipperevents_whenGesture','flipperevents_whenButton','flipperevents_whenTimer',
    'flipperevents_whenCondition','event_whenbroadcastreceived',
  ]) {
    js[t] = () => '';
  }

  js['event_broadcast'] = (block) => {
    const msg = val(block, 'BROADCAST_INPUT', "''");
    return `window.appendOutput('[broadcast] ' + String(${msg}), 'info');\n`;
  };

  js['event_broadcastandwait'] = (block) => {
    const msg = val(block, 'BROADCAST_INPUT', "''");
    return `window.appendOutput('[broadcast] ' + String(${msg}), 'info');\nawait window.sim._sleep(100);\n`;
  };

  // ── Control ────────────────────────────────────────────────────────────────

  js['control_wait'] = (block) => {
    const sec = val(block, 'DURATION', '1');
    return `await window.sim._sleep((${sec}) * 1000 / window.sim.speedMult);\n`;
  };

  js['control_repeat'] = (block) => {
    const times = val(block, 'TIMES', '10');
    const body  = js.statementToCode(block, 'SUBSTACK');
    return `for (let _i = 0; _i < (${times}); _i++) {\n${body}  if (!window.sim.isRunning) break;\n}\n`;
  };

  js['control_forever'] = (block) => {
    const body = js.statementToCode(block, 'SUBSTACK');
    return `while (window.sim.isRunning) {\n${body}  await window.sim._sleep(0);\n}\n`;
  };

  js['control_if'] = (block) => {
    const cond = val(block, 'CONDITION', 'false');
    const body = js.statementToCode(block, 'SUBSTACK');
    return `if (${cond}) {\n${body}}\n`;
  };

  js['control_if_else'] = (block) => {
    const cond  = val(block, 'CONDITION', 'false');
    const body1 = js.statementToCode(block, 'SUBSTACK');
    const body2 = js.statementToCode(block, 'SUBSTACK2');
    return `if (${cond}) {\n${body1}} else {\n${body2}}\n`;
  };

  js['control_wait_until'] = (block) => {
    const cond = val(block, 'CONDITION', 'false');
    return `while (!(${cond}) && window.sim.isRunning) { await window.sim._sleep(50 / window.sim.speedMult); }\n`;
  };

  js['control_repeat_until'] = (block) => {
    const cond = val(block, 'CONDITION', 'false');
    const body = js.statementToCode(block, 'SUBSTACK');
    return `while (!(${cond}) && window.sim.isRunning) {\n${body}  await window.sim._sleep(0);\n}\n`;
  };

  js['flippercontrol_stopOtherStacks'] = (_b) => `// stop other stacks\n`;

  js['flippercontrol_stop'] = (block) => {
    const kind = block.getFieldValue('STOP_OPTION');
    if (kind === 'all' || kind === 'program' || kind === 'this') {
      return `window.sim.stop(); return;\n`;
    }
    return ``;
  };

  // ── Sensor ─────────────────────────────────────────────────────────────────

  js['flippersensors_isColor'] = (block) => {
    const idx  = block.getFieldValue('VALUE');
    const name = _colorIndexToName(idx);
    return [`window.sim.getColorSensorColor() === '${name}'`, ORDER_ATOMIC];
  };

  js['flippersensors_color'] = (_b) => {
    // Convert simulator color name back to a numeric LEGO index.
    return [`(({black:0,violet:1,blue:3,cyan:5,green:7,yellow:9,red:9,white:10,none:-1})[window.sim.getColorSensorColor()] ?? -1)`, ORDER_ATOMIC];
  };

  js['flippersensors_isReflectivity'] = (block) => {
    const op  = block.getFieldValue('COMPARATOR');
    const v   = val(block, 'VALUE', '50');
    return [`(window.sim.getColorSensorReflection() ${op} (${v}))`, ORDER_ATOMIC];
  };

  js['flippersensors_reflectivity'] = (_b) =>
    [`window.sim.getColorSensorReflection()`, ORDER_ATOMIC];

  js['flippersensors_isPressed'] = (block) => {
    const opt = block.getFieldValue('OPTION');
    if (opt === 'released') return [`(!window.sim.getForceSensorPressed())`, ORDER_ATOMIC];
    if (opt === 'hard-pressed') return [`(window.sim.getForceSensorValue() > 70)`, ORDER_ATOMIC];
    return [`window.sim.getForceSensorPressed()`, ORDER_ATOMIC];
  };

  js['flippersensors_force'] = (block) => {
    const unit = block.getFieldValue('UNIT');
    if (unit === 'newton') return [`(window.sim.getForceSensorValue() / 10)`, ORDER_ATOMIC];
    return [`window.sim.getForceSensorValue()`, ORDER_ATOMIC];
  };

  js['flippersensors_isDistance'] = (block) => {
    const op   = block.getFieldValue('COMPARATOR');
    const unit = block.getFieldValue('UNIT');
    const v    = val(block, 'VALUE', '15');
    let scale;
    if (unit === 'cm') scale = `(${v} * 10)`;
    else if (unit === 'inches') scale = `(${v} * 25.4)`;
    else scale = `(${v} * 20)`; // % rough mapping
    return [`(window.sim.getDistanceSensorValue() ${op} ${scale})`, ORDER_ATOMIC];
  };

  js['flippersensors_distance'] = (block) => {
    const unit = block.getFieldValue('UNIT');
    if (unit === 'cm')      return [`(window.sim.getDistanceSensorValue() / 10)`, ORDER_ATOMIC];
    if (unit === 'inches')  return [`(window.sim.getDistanceSensorValue() / 25.4)`, ORDER_ATOMIC];
    return [`Math.min(100, window.sim.getDistanceSensorValue() / 20)`, ORDER_ATOMIC];
  };

  js['flippersensors_isTilted']     = (_b) => [`false`, ORDER_ATOMIC];
  js['flippersensors_isorientation']= (_b) => [`false`, ORDER_ATOMIC];
  js['flippersensors_ismotion']     = (_b) => [`false`, ORDER_ATOMIC];

  js['flippersensors_orientationAxis'] = (block) => {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'yaw') return [`(((window.sim.robot.heading % 360) + 360) % 360)`, ORDER_ATOMIC];
    return [`0`, ORDER_ATOMIC];
  };

  js['flippersensors_resetYaw'] = (_b) => `window.sim.robot.heading = -90;\n`;

  js['flippersensors_buttonIsPressed'] = (_b) => [`false`, ORDER_ATOMIC];
  js['flippersensors_timer']           = (_b) => [`((performance.now() - _timerMs) / 1000)`, ORDER_ATOMIC];
  js['flippersensors_resetTimer']      = (_b) => `_timerMs = performance.now();\n`;

  // ── Operator ───────────────────────────────────────────────────────────────

  const _bin = (op) => (block) => [`(${val(block,'NUM1','0')} ${op} ${val(block,'NUM2','0')})`, ORDER_ATOMIC];
  const _cmp = (op) => (block) => [`(${val(block,'OPERAND1','0')} ${op} ${val(block,'OPERAND2','0')})`, ORDER_ATOMIC];

  js['operator_add']      = _bin('+');
  js['operator_subtract'] = _bin('-');
  js['operator_multiply'] = _bin('*');
  js['operator_divide']   = _bin('/');
  js['operator_mod']      = _bin('%');
  js['operator_lt']       = _cmp('<');
  js['operator_equals']   = _cmp('==');
  js['operator_gt']       = _cmp('>');
  js['operator_and']      = (b) => [`(${val(b,'OPERAND1','false')} && ${val(b,'OPERAND2','false')})`, ORDER_ATOMIC];
  js['operator_or']       = (b) => [`(${val(b,'OPERAND1','false')} || ${val(b,'OPERAND2','false')})`, ORDER_ATOMIC];
  js['operator_not']      = (b) => [`(!${val(b,'OPERAND','false')})`, ORDER_ATOMIC];

  js['operator_random'] = (b) => {
    const a = val(b,'FROM','1'), c = val(b,'TO','10');
    return [`(Math.floor(Math.random() * ((${c}) - (${a}) + 1)) + (${a}))`, ORDER_ATOMIC];
  };

  js['operator_join']    = (b) => [`(String(${val(b,'STRING1',"''")}) + String(${val(b,'STRING2',"''")}))`, ORDER_ATOMIC];
  js['operator_letter_of']=(b) => [`String(${val(b,'STRING',"''")}).charAt(((${val(b,'LETTER','1')})|0) - 1)`, ORDER_ATOMIC];
  js['operator_length']  = (b) => [`String(${val(b,'STRING',"''")}).length`, ORDER_ATOMIC];
  js['operator_contains']= (b) => [`String(${val(b,'STRING1',"''")}).indexOf(String(${val(b,'STRING2',"''")})) >= 0`, ORDER_ATOMIC];
  js['operator_round']   = (b) => [`Math.round(${val(b,'NUM','0')})`, ORDER_ATOMIC];

  js['operator_mathop'] = (b) => {
    const op = b.getFieldValue('OPERATOR');
    const n  = val(b, 'NUM', '0');
    const map = {
      'abs': `Math.abs(${n})`, 'floor': `Math.floor(${n})`, 'ceiling': `Math.ceil(${n})`,
      'sqrt': `Math.sqrt(${n})`, 'sin': `Math.sin((${n}) * Math.PI / 180)`,
      'cos': `Math.cos((${n}) * Math.PI / 180)`, 'tan': `Math.tan((${n}) * Math.PI / 180)`,
      'asin': `(Math.asin(${n}) * 180 / Math.PI)`, 'acos': `(Math.acos(${n}) * 180 / Math.PI)`,
      'atan': `(Math.atan(${n}) * 180 / Math.PI)`, 'ln': `Math.log(${n})`, 'log': `Math.log10(${n})`,
      'e ^': `Math.exp(${n})`, '10 ^': `Math.pow(10, ${n})`,
    };
    return [`(${map[op] ?? n})`, ORDER_ATOMIC];
  };

  js['flipperoperator_isInBetween'] = (b) => {
    const v   = val(b,'VALUE','0');
    const low = val(b,'LOW','0');
    const hi  = val(b,'HIGH','100');
    return [`((${v}) >= (${low}) && (${v}) <= (${hi}))`, ORDER_ATOMIC];
  };

  // ── More-Movement ──────────────────────────────────────────────────────────

  js['flippermoremove_movementSetStopMethod'] = (b) => `_stopMethod = '${b.getFieldValue('STOP')}';\n`;

  js['flippermoremove_startDualSpeed'] = (b) => {
    const l = val(b,'LEFT','50'), r = val(b,'RIGHT','50');
    return `window.sim._animateTank((${l})/100, (${r})/100, 5000);\n`;
  };

  js['flippermoremove_movementSetAcceleration'] = (b) => `_moveAccel = '${b.getFieldValue('ACCELERATION')}';\n`;

  // ── More-Motor ─────────────────────────────────────────────────────────────

  js['flippermoremotor_motorGoToRelativePosition'] = (b) => {
    const port = b.getFieldValue('PORT');
    const pos  = val(b,'POSITION','0');
    const spd  = val(b,'SPEED','100');
    return `await window.sim._animateSingleMotor('${port}', (${spd})/100, (Math.abs(${pos}) / 360) * ${_WHEEL_CIRC_MM});\n`;
  };

  js['flippermoremotor_motorStartPower'] = (b) => {
    const port = b.getFieldValue('PORT');
    const pwr  = val(b,'POWER','100');
    return `window.sim._animateSingleMotor('${port}', (${pwr})/100, 5000);\n`;
  };

  js['flippermoremotor_motorSetStopMethod'] = (b) => {
    const p = b.getFieldValue('PORT');
    return `_motorStop['${p}'] = '${b.getFieldValue('STOP')}';\n`;
  };

  js['flippermoremotor_motorSetAcceleration'] = (b) => {
    const p = b.getFieldValue('PORT');
    return `_motorAccel['${p}'] = '${b.getFieldValue('ACCELERATION')}';\n`;
  };

  js['flippermoremotor_motorSetDegreeCounted'] = (b) => {
    const p = b.getFieldValue('PORT');
    const v = val(b,'VALUE','0');
    return `_motorRelOffset['${p}'] = window.sim.getMotorPosition('${p}') - (${v});\n`;
  };

  js['flippermoremotor_power'] = (b) =>
    [`window.sim.getMotorSpeed('${b.getFieldValue('PORT')}')`, ORDER_ATOMIC];

  js['flippermoremotor_position'] = (b) => {
    const p = b.getFieldValue('PORT');
    return [`(window.sim.getMotorPosition('${p}') - (_motorRelOffset['${p}'] ?? 0))`, ORDER_ATOMIC];
  };

  // ── More-Sensor ────────────────────────────────────────────────────────────

  js['flippermoresensors_setOrientation'] = (_b) => `// set yaw axis\n`;

  js['flippermoresensors_rawColor'] = (b) => {
    const idx = b.getFieldValue('COLOR');
    return [`((window.sim.getColorSensorRGB && window.sim.getColorSensorRGB()[${idx}]) || 0)`, ORDER_ATOMIC];
  };

  js['flippermoresensors_acceleration']    = (_b) => [`0`, ORDER_ATOMIC];
  js['flippermoresensors_angularVelocity'] = (_b) => [`0`, ORDER_ATOMIC];
  js['flippermoresensors_orientation']     = (_b) => [`0`, ORDER_ATOMIC];
  js['flippermoresensors_motion']          = (_b) => [`0`, ORDER_ATOMIC];
}

// ── Toolbox XML ──────────────────────────────────────────────────────────────
// Shadow defaults follow LEGO's documented defaults where reasonable.

function _shadowNum(name, v) {
  return `<value name="${name}"><shadow type="math_number"><field name="NUM">${v}</field></shadow></value>`;
}

function _shadowText(name, v) {
  return `<value name="${name}"><shadow type="text"><field name="TEXT">${v}</field></shadow></value>`;
}

const TOOLBOX_XML = `
<xml xmlns="https://developers.google.com/blockly/xml">

  <category name="MOTORS" colour="${C_MOTOR}">
    <label text="Motors" web-class="flyout-header"/>
    <block type="flippermotor_motorTurnForDirection">
      ${_shadowNum('VALUE', 1)}
    </block>
    <block type="flippermotor_motorGoDirectionToPosition">
      ${_shadowNum('POSITION', 0)}
    </block>
    <block type="flippermotor_motorStartDirection"/>
    <block type="flippermotor_motorStop"/>
    <block type="flippermotor_motorSetSpeed">
      ${_shadowNum('SPEED', 75)}
    </block>
    <block type="flippermotor_absolutePosition"/>
    <block type="flippermotor_speed"/>
  </category>

  <category name="MOVEMENT" colour="${C_MOVEMENT}">
    <label text="Movement" web-class="flyout-header"/>
    <block type="flippermove_move">
      ${_shadowNum('VALUE', 10)}
    </block>
    <block type="flippermove_startMove"/>
    <block type="flippermove_steer">
      ${_shadowNum('STEERING', 0)}
      ${_shadowNum('VALUE', 1)}
    </block>
    <block type="flippermove_startSteer">
      ${_shadowNum('STEERING', 30)}
    </block>
    <block type="flippermove_stopMove"/>
    <block type="flippermove_movementSpeed">
      ${_shadowNum('SPEED', 50)}
    </block>
    <block type="flippermove_setMovementPair"/>
    <block type="flippermove_setDistance">
      ${_shadowNum('DISTANCE', 17.6)}
    </block>
  </category>

  <category name="LIGHT" colour="${C_LIGHT}">
    <label text="Light" web-class="flyout-header"/>
    <block type="flipperlight_lightDisplayImageOnForTime">
      ${_shadowText('MATRIX', '9909999099000009000909990')}
      ${_shadowNum('VALUE', 2)}
    </block>
    <block type="flipperlight_lightDisplayImageOn">
      ${_shadowText('MATRIX', '9909999099000009000909990')}
    </block>
    <block type="flipperlight_lightDisplayText">
      ${_shadowText('TEXT', 'Hello')}
    </block>
    <block type="flipperlight_lightDisplayOff"/>
    <block type="flipperlight_lightDisplaySetBrightness">
      ${_shadowNum('BRIGHTNESS', 75)}
    </block>
    <block type="flipperlight_lightDisplaySetPixel">
      ${_shadowNum('X', 1)}
      ${_shadowNum('Y', 1)}
      ${_shadowNum('BRIGHTNESS', 100)}
    </block>
    <block type="flipperlight_lightDisplayRotate"/>
    <block type="flipperlight_lightDisplaySetOrientation"/>
    <block type="flipperlight_centerButtonLight"/>
    <block type="flipperlight_ultrasonicLightUp">
      ${_shadowText('VALUE', '100 100 100 100')}
    </block>
  </category>

  <category name="SOUND" colour="${C_SOUND}">
    <label text="Sound" web-class="flyout-header"/>
    <block type="flippersound_playSoundUntilDone"/>
    <block type="flippersound_playSound"/>
    <block type="flippersound_beepForTime">
      ${_shadowNum('NOTE', 60)}
      ${_shadowNum('DURATION', 0.2)}
    </block>
    <block type="flippersound_beep">
      ${_shadowNum('NOTE', 60)}
    </block>
    <block type="flippersound_stopSound"/>
    <block type="sound_changeeffectby">
      ${_shadowNum('VALUE', 10)}
    </block>
    <block type="sound_seteffectto">
      ${_shadowNum('VALUE', 0)}
    </block>
    <block type="sound_cleareffects"/>
    <block type="sound_changevolumeby">
      ${_shadowNum('VOLUME', -10)}
    </block>
    <block type="sound_setvolumeto">
      ${_shadowNum('VOLUME', 100)}
    </block>
    <block type="sound_volume"/>
  </category>

  <category name="EVENTS" colour="${C_EVENT}">
    <label text="Events" web-class="flyout-header"/>
    <block type="flipperevents_whenProgramStarts"/>
    <block type="flipperevents_whenColor"/>
    <block type="flipperevents_whenPressed"/>
    <block type="flipperevents_whenDistance">
      ${_shadowNum('VALUE', 15)}
    </block>
    <block type="flipperevents_whenTilted"/>
    <block type="flipperevents_whenOrientation"/>
    <block type="flipperevents_whenGesture"/>
    <block type="flipperevents_whenButton"/>
    <block type="flipperevents_whenTimer">
      ${_shadowNum('VALUE', 5)}
    </block>
    <block type="flipperevents_whenCondition"/>
    <block type="event_whenbroadcastreceived"/>
    <block type="event_broadcast">
      ${_shadowText('BROADCAST_INPUT', 'message1')}
    </block>
    <block type="event_broadcastandwait">
      ${_shadowText('BROADCAST_INPUT', 'message1')}
    </block>
  </category>

  <category name="CONTROL" colour="${C_CONTROL}">
    <label text="Control" web-class="flyout-header"/>
    <block type="control_wait">
      ${_shadowNum('DURATION', 1)}
    </block>
    <block type="control_repeat">
      ${_shadowNum('TIMES', 10)}
    </block>
    <block type="control_forever"/>
    <block type="control_if"/>
    <block type="control_if_else"/>
    <block type="control_wait_until"/>
    <block type="control_repeat_until"/>
    <block type="flippercontrol_stopOtherStacks"/>
    <block type="flippercontrol_stop"/>
  </category>

  <category name="SENSORS" colour="${C_SENSOR}">
    <label text="Sensors" web-class="flyout-header"/>
    <block type="flippersensors_isColor"/>
    <block type="flippersensors_color"/>
    <block type="flippersensors_isReflectivity">
      ${_shadowNum('VALUE', 50)}
    </block>
    <block type="flippersensors_reflectivity"/>
    <block type="flippersensors_isPressed"/>
    <block type="flippersensors_force"/>
    <block type="flippersensors_isDistance">
      ${_shadowNum('VALUE', 15)}
    </block>
    <block type="flippersensors_distance"/>
    <block type="flippersensors_isTilted"/>
    <block type="flippersensors_isorientation"/>
    <block type="flippersensors_ismotion"/>
    <block type="flippersensors_orientationAxis"/>
    <block type="flippersensors_resetYaw"/>
    <block type="flippersensors_buttonIsPressed"/>
    <block type="flippersensors_timer"/>
    <block type="flippersensors_resetTimer"/>
  </category>

  <category name="OPERATORS" colour="${C_OPERATOR}">
    <label text="Operators" web-class="flyout-header"/>
    <block type="operator_random">
      ${_shadowNum('FROM', 1)}
      ${_shadowNum('TO', 10)}
    </block>
    <block type="operator_add">
      ${_shadowNum('NUM1', 0)}
      ${_shadowNum('NUM2', 0)}
    </block>
    <block type="operator_subtract">
      ${_shadowNum('NUM1', 0)}
      ${_shadowNum('NUM2', 0)}
    </block>
    <block type="operator_multiply">
      ${_shadowNum('NUM1', 0)}
      ${_shadowNum('NUM2', 0)}
    </block>
    <block type="operator_divide">
      ${_shadowNum('NUM1', 0)}
      ${_shadowNum('NUM2', 0)}
    </block>
    <block type="operator_lt">
      ${_shadowNum('OPERAND1', 0)}
      ${_shadowNum('OPERAND2', 50)}
    </block>
    <block type="operator_equals">
      ${_shadowNum('OPERAND1', 0)}
      ${_shadowNum('OPERAND2', 50)}
    </block>
    <block type="operator_gt">
      ${_shadowNum('OPERAND1', 0)}
      ${_shadowNum('OPERAND2', 50)}
    </block>
    <block type="operator_and"/>
    <block type="operator_or"/>
    <block type="operator_not"/>
    <block type="flipperoperator_isInBetween">
      ${_shadowNum('VALUE', 0)}
      ${_shadowNum('LOW', 1)}
      ${_shadowNum('HIGH', 100)}
    </block>
    <block type="operator_join">
      ${_shadowText('STRING1', 'apple ')}
      ${_shadowText('STRING2', 'banana')}
    </block>
    <block type="operator_letter_of">
      ${_shadowNum('LETTER', 1)}
      ${_shadowText('STRING', 'apple')}
    </block>
    <block type="operator_length">
      ${_shadowText('STRING', 'apple')}
    </block>
    <block type="operator_contains">
      ${_shadowText('STRING1', 'apple')}
      ${_shadowText('STRING2', 'a')}
    </block>
    <block type="operator_mod">
      ${_shadowNum('NUM1', 0)}
      ${_shadowNum('NUM2', 0)}
    </block>
    <block type="operator_round">
      ${_shadowNum('NUM', 0)}
    </block>
    <block type="operator_mathop">
      ${_shadowNum('NUM', 0)}
    </block>
  </category>

  <sep></sep>

  <category name="VARIABLES" colour="${C_VARS}" custom="VARIABLE"></category>
  <category name="MY BLOCKS"  colour="${C_MYBLOCKS}" custom="PROCEDURE"></category>

  <!-- EXTENSIONS_PLACEHOLDER -->

</xml>`;

// Extension categories — hidden by default, mirror LEGO's "Show extensions"
// toggle in the bottom toolbar of the SPIKE Prime IDE. Inserted at
// EXTENSIONS_PLACEHOLDER when the toggle is on.
const TOOLBOX_EXTENSIONS_XML = `
  <category name="MORE-MOVEMENT" colour="${C_MOVEMENT}">
    <label text="More Movement" web-class="flyout-header"/>
    <block type="flippermoremove_movementSetStopMethod"/>
    <block type="flippermoremove_startDualSpeed">
      ${_shadowNum('LEFT', 50)}
      ${_shadowNum('RIGHT', 50)}
    </block>
    <block type="flippermoremove_movementSetAcceleration"/>
  </category>

  <category name="MORE-MOTORS" colour="${C_MOTOR}">
    <label text="More Motors" web-class="flyout-header"/>
    <block type="flippermoremotor_motorGoToRelativePosition">
      ${_shadowNum('POSITION', 0)}
      ${_shadowNum('SPEED', 100)}
    </block>
    <block type="flippermoremotor_motorStartPower">
      ${_shadowNum('POWER', 100)}
    </block>
    <block type="flippermoremotor_motorSetStopMethod"/>
    <block type="flippermoremotor_motorSetAcceleration"/>
    <block type="flippermoremotor_motorSetDegreeCounted">
      ${_shadowNum('VALUE', 0)}
    </block>
    <block type="flippermoremotor_power"/>
    <block type="flippermoremotor_position"/>
  </category>

  <category name="MORE-SENSORS" colour="${C_SENSOR}">
    <label text="More Sensors" web-class="flyout-header"/>
    <block type="flippermoresensors_setOrientation"/>
    <block type="flippermoresensors_rawColor"/>
    <block type="flippermoresensors_acceleration"/>
    <block type="flippermoresensors_angularVelocity"/>
    <block type="flippermoresensors_orientation"/>
    <block type="flippermoresensors_motion"/>
  </category>
`;

function _buildToolboxXml(extensionsVisible) {
  return TOOLBOX_XML.replace(
    '<!-- EXTENSIONS_PLACEHOLDER -->',
    extensionsVisible ? TOOLBOX_EXTENSIONS_XML : ''
  );
}

// ── Compact Zelos renderer ───────────────────────────────────────────────────
// Subclass Zelos's ConstantProvider to tighten paddings around fields and
// between rows so blocks read closer to LEGO's own SPIKE Prime IDE density.
// Registered once on first initBlockly() call.
let _compactRendererRegistered = false;
function _registerCompactRenderer(Blockly) {
  if (_compactRendererRegistered) return;
  if (!(Blockly.zelos && Blockly.zelos.Renderer && Blockly.zelos.ConstantProvider)) return;

  class SpikeConstantProvider extends Blockly.zelos.ConstantProvider {
    init() {
      super.init();
      // LEGO blocks are tighter horizontally and a touch shorter vertically.
      this.FIELD_BORDER_RECT_X_PADDING = 4;     // Zelos default: 5
      this.FIELD_BORDER_RECT_Y_PADDING = 3;     // Zelos default: 5
      this.BETWEEN_FIELDS_PADDING      = 4;     // Zelos default: 6
      this.MIN_BLOCK_HEIGHT            = 28;    // Zelos default: 40
      this.SMALL_PADDING               = 4;     // Zelos default: 8
      this.MEDIUM_PADDING              = 6;     // Zelos default: 8
      this.MEDIUM_LARGE_PADDING        = 6;     // Zelos default: 12
      this.LARGE_PADDING               = 8;     // Zelos default: 12
    }
  }

  class SpikeCompactRenderer extends Blockly.zelos.Renderer {
    constructor(name) { super(name); }
    makeConstants_() { return new SpikeConstantProvider(); }
  }

  Blockly.blockRendering.register('spike_compact', SpikeCompactRenderer);
  _compactRendererRegistered = true;
}

// ── Blockly workspace initializer ────────────────────────────────────────────

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

  Blockly.defineBlocksWithJsonArray(SPIKE_BLOCKS.map(_withEmblem));
  registerGenerators(Blockly);
  _registerCompactRenderer(Blockly);

  // Zelos = Google's Scratch-style renderer (rounded blocks, hat events,
  // hexagonal booleans, pill reporters, drop shadows). startHats: true puts
  // a "hat" on every event-style block, matching the LEGO SPIKE word-block UX.
  // Zelos = Google's Scratch-style renderer (rounded blocks, hat events,
  // hexagonal booleans, pill reporters, drop shadows). startHats: true puts
  // a "hat" on every event-style block, matching the LEGO SPIKE word-block UX.
  // Workspace and flyout are kept light to mirror the LEGO IDE's white canvas;
  // the dark navigation bar in index.html still frames it.
  // Hide MORE-MOVEMENT/MORE-MOTOR/MORE-SENSOR by default, mirroring LEGO's
  // "Show extensions" toggle in their bottom toolbar.
  let extensionsVisible = false;

  const palette = SPIKE_BLOCKLY_PALETTES[themeName] || SPIKE_BLOCKLY_PALETTES.dark;
  const themeId = 'spike-' + (palette === SPIKE_BLOCKLY_PALETTES.light ? 'light' : 'dark');

  const workspace = Blockly.inject(divId, {
    renderer: 'spike_compact',
    toolbox:  _buildToolboxXml(extensionsVisible),
    grid:     { spacing: 40, length: 2, colour: palette.gridColour, snap: true },
    zoom:     { controls: true, wheel: true, startScale: 0.75, minScale: 0.3, maxScale: 2 },
    trashcan: true,
    theme: Blockly.Theme.defineTheme(themeId, {
      base: Blockly.Themes.Zelos,
      name: themeId,
      startHats: true,
      blockStyles: {
        procedure_blocks: { hat: 'none' },
      },
      componentStyles: {
        workspaceBackgroundColour: palette.workspaceBackgroundColour,
        toolboxBackgroundColour:   palette.toolboxBackgroundColour,
        toolboxForegroundColour:   palette.toolboxForegroundColour,
        flyoutBackgroundColour:    palette.flyoutBackgroundColour,
        flyoutForegroundColour:    palette.flyoutForegroundColour,
        flyoutOpacity:             1.0,
        scrollbarColour:           palette.scrollbarColour,
        insertionMarkerColour:     '#7c6af7',
        markerColour:              '#7c6af7',
        cursorColour:              '#56d4c0',
        selectedGlowColour:        '#4eff4e',
      },
    }),
  });

  // Convert each toolbox row's inline border-left-color (Blockly's way of
  // applying the category colour) into a CSS custom property the stylesheet
  // can use to paint a circular dot. Re-run on workspace updates so newly
  // rendered categories also get the variable.
  function _paintToolboxDots() {
    const rows = document.querySelectorAll('#' + divId + ' .blocklyTreeRow, .blocklyTreeRow');
    rows.forEach((row) => {
      const c = row.style.borderLeftColor || getComputedStyle(row).borderLeftColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
        row.style.setProperty('--cat-color', c);
      }
    });
  }
  setTimeout(_paintToolboxDots, 0);
  setTimeout(_paintToolboxDots, 200);

  // Bottom-left "Show extensions" toggle. Click swaps the toolbox between
  // its base and extended forms, then re-paints the dot CSS variables.
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'extensions-toggle';
  toggleBtn.type = 'button';
  toggleBtn.title = 'Show / hide block extensions (More-Movement, More-Motor, More-Sensors)';
  toggleBtn.textContent = '+ extensions';
  toggleBtn.addEventListener('click', () => {
    extensionsVisible = !extensionsVisible;
    workspace.updateToolbox(_buildToolboxXml(extensionsVisible));
    toggleBtn.textContent = extensionsVisible ? '− extensions' : '+ extensions';
    toggleBtn.classList.toggle('on', extensionsVisible);
    setTimeout(_paintToolboxDots, 0);
    setTimeout(_paintToolboxDots, 200);
  });
  const host = document.getElementById(divId);
  if (host) host.appendChild(toggleBtn);

  const starterXml = `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="flipperevents_whenProgramStarts" x="30" y="30">
        <next>
          <block type="flippermove_move">
            <field name="DIRECTION">forward</field>
            <field name="UNIT">cm</field>
            <value name="VALUE"><shadow type="math_number"><field name="NUM">20</field></shadow></value>
            <next>
              <block type="flippermove_steer">
                <field name="UNIT">rotations</field>
                <value name="STEERING"><shadow type="math_number"><field name="NUM">50</field></shadow></value>
                <value name="VALUE"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
                <next>
                  <block type="flipperlight_lightDisplayText">
                    <value name="TEXT"><shadow type="text"><field name="TEXT">Done!</field></shadow></value>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </xml>`;
  Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(starterXml), workspace);

  return workspace;
}

// ── Code generator — prepends run-time state variables ──────────────────────

function generateBlocklyJS(workspace) {
  if (!workspace || typeof Blockly === 'undefined') return '';
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return '';

  const body = js.workspaceToCode(workspace);
  if (!body.trim()) return '';

  const preamble = [
    `var _moveSpeed     = 50;`,
    `var _motorSpeed    = 75;`,
    `var _movePairL     = 'A';`,
    `var _movePairR     = 'B';`,
    `var _moveRotMM     = ${(Math.PI * 56).toFixed(4)};`,  // default 17.6 cm wheel circumference in mm
    `var _distMoved     = 0;`,
    `var _timerMs       = performance.now();`,
    `var _stopMethod    = 'brake';`,
    `var _moveAccel     = 'medium';`,
    `var _motorStop     = {};`,
    `var _motorAccel    = {};`,
    `var _motorRelOffset= {};`,
  ].join('\n');

  return preamble + '\n' + body;
}

window.initBlockly       = initBlockly;
window.generateBlocklyJS = generateBlocklyJS;
