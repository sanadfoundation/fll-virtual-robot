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
// All motor-action and sensor-read blocks use this single list. Per-sensor-type
// restriction (color → E only, distance → F only) is a known follow-up; runtime
// validation in the simulator catches wrong-port calls in the meantime.
// When per-instance port customization lands, this becomes a function of
// the live config.
// Port selection is handled by `field_port_grid` (defined further down) —
// a 2×3 grid widget matching Spike's native picker. Single, pair, and multi
// modes all flow through that one field; no separate dropdown option lists
// are needed.

// Inline-SVG → data URI so we can ship icon dropdowns without per-asset files.
const _dataUri = (svg) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

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

// 24×24 colored circle (with optional empty-ring slash for "no color"/"off").
function _swatchSvg(fill, empty) {
  const ring = empty ? '#999' : (fill === '#ffffff' ? '#666' : '#222');
  const body = empty ? '#fff' : fill;
  const slash = empty
    ? '<line x1="12" y1="36" x2="36" y2="12" stroke="#d33" stroke-width="4" stroke-linecap="round"/>'
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="${body}" stroke="${ring}" stroke-width="2"/>${slash}</svg>`;
}
const _swatch = (fill, alt, empty) =>
  ({ src: _dataUri(_swatchSvg(fill, empty)), width: 24, height: 24, alt });

const _MOTOR_UNITS  = [['rotations','rotations'],['degrees','degrees'],['seconds','seconds']];
const _MOVE_UNITS   = [['rotations','rotations'],['degrees','degrees'],['seconds','seconds'],['cm','cm'],['inches','inches']];
const _DIST_UNITS   = [['cm','cm'],['inches','inches']];
const _DIST_RANGE   = [['%','%'],['cm','cm'],['inches','inches']];
const _FORCE_UNITS  = [['newton','newton'],['%','%']];

// Word-block enum (`(0) Black (1) Violet (3) Blue (4) Light Blue (6) Green
// (7) Yellow (9) Red (10) White (-1) no color`) — matches Python's
// `color` module (where Violet=MAGENTA=1 and Light Blue=AZURE=4 are aliases).
// Values 2 (Purple), 5 (Turquoise), 8 (Orange) are not exposed in word blocks.
const _COLORS = [
  [_swatch('#fff',     'no color', true), '-1'],
  [_swatch('#000000',  'black'),           '0'],
  [_swatch('#d6005c',  'violet'),          '1'],
  [_swatch('#1d6dd1',  'blue'),            '3'],
  [_swatch('#6db3e6',  'light blue'),      '4'],
  [_swatch('#1a9c4a',  'green'),           '6'],
  [_swatch('#f7c911',  'yellow'),          '7'],
  [_swatch('#d12a2a',  'red'),             '9'],
  [_swatch('#ffffff',  'white'),          '10'],
];

const _CENTRE_BTN_COLORS = [
  [_swatch('#fff',    'off', true),     '0'],
  [_swatch('#ff80c0', 'pink'),          '1'],
  [_swatch('#b066d8', 'violet'),        '2'],
  [_swatch('#1d6dd1', 'blue'),          '3'],
  [_swatch('#6db3e6', 'light blue'),    '4'],
  [_swatch('#25b9d8', 'cyan'),          '5'],
  [_swatch('#1a9c4a', 'green'),         '6'],
  [_swatch('#f7c911', 'yellow'),        '7'],
  [_swatch('#f08020', 'orange'),        '8'],
  [_swatch('#d12a2a', 'red'),           '9'],
  [_swatch('#ffffff', 'white'),        '10'],
];

const _TILT       = [['forward','1'],['backward','2'],['left','3'],['right','4']];
// Spike's orientation enum (the face-pointing-up dropdown). Values are
// `front`/`back`/`up`/`down`/`leftside`/`rightside`. The (now removed)
// plain-label form was inconsistent with Spike's wire serialization.
const _ORIENT     = [['front','front'],['back','back'],['top','up'],['bottom','down'],['left side','leftside'],['right side','rightside']];
const _ORIENT_UP  = _ORIENT;
const _DISP_ORIENT= [['upright','1'],['left','2'],['right','3'],['upside down','4']];
const _AXIS_PRY   = [['pitch','pitch'],['roll','roll'],['yaw','yaw']];
const _AXIS_XYZ   = [['x','x'],['y','y'],['z','z']];
const _RAW_RGB    = [['red','0'],['green','1'],['blue','2']];
const _GESTURE    = [['shaken','shake'],['tapped','tapped'],['falling','freefall']];
// Spike's wire values (verified against alexandrehardy/lego-spike-simulator):
// motion uses `freefall`, not `falling`; force-sensor states use the
// no-hyphen form `hardpressed`. Older sb3 files that used `falling` /
// `hard-pressed` won't match these options but Blockly will fall back to
// the first option (acceptable, single-character drift).
const _MOTION     = [['shaken','shake'],['tapped','tapped'],['falling','freefall']];
const _BTN_LR     = [['left','left'],['right','right']];
const _BTN_EVT    = [['pressed','pressed'],['released','released']];
const _PRESS_OPT  = [['pressed','pressed'],['hard-pressed','hardpressed'],['released','released'],['pressure changed','pressure changed']];
const _PRESS_IS   = [['pressed','pressed'],['hard-pressed','hardpressed'],['released','released']];
const _COMPARE    = [['closer than','<'],['exactly at','='],['further than','>']];
const _COMPARE_LT = [['<','<'],['=','='],['>','>']];
const _STOP_KIND  = [['all','all'],['and exit program','program'],['this stack','this']];

// Stop-method icons: down-arrow-into-floor (brake), padlock (hold), dashed
// arrow (coast), plain "Stop" glyph (continue). Acceleration: 1/2/3
// chevrons pointing right.
//
// Spike's wire values for the stop method are the numeric strings
// "0" (brake), "1" (hold), "2" (coast), "3" (continue/smart-brake).
// Confirmed against alexandrehardy/lego-spike-simulator.
const _STOP_ICONS = {
  '0': '<path d="M24 8 V30 M16 22 L24 30 L32 22" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="36" x2="38" y2="36" stroke="#222" stroke-width="3" stroke-linecap="round"/>',
  '1': '<path d="M16 24 v-6 a8 8 0 0 1 16 0 v6" stroke="#222" stroke-width="3" fill="none"/><rect x="12" y="22" width="24" height="18" rx="2" fill="#222"/><circle cx="24" cy="30" r="2.5" fill="#fff"/>',
  '2': '<line x1="6" y1="24" x2="13" y2="24" stroke="#999" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 3"/><path d="M14 24 L36 24 M28 16 L36 24 L28 32" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  '3': '<rect x="14" y="14" width="20" height="20" rx="2" fill="#222"/>',
};
function _stopMethodSvg(value) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${_STOP_ICONS[value]}</svg>`;
}
const _stopOpt = (alt, value) =>
  [{ src: _dataUri(_stopMethodSvg(value)), width: 24, height: 24, alt }, value];

const _STOP_METHOD = [
  _stopOpt('brake',         '0'),
  _stopOpt('hold position', '1'),
  _stopOpt('coast',         '2'),
  _stopOpt('continue',      '3'),
];

function _accelSvg(level) {
  const n = { slow: 1, medium: 2, fast: 3 }[level];
  let paths = '';
  for (let i = 0; i < n; i++) {
    const x = 14 + i * 9;
    paths += `<path d="M${x} 16 L${x + 8} 24 L${x} 32" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">${paths}</svg>`;
}
// Spike serializes acceleration as a deg/s²-deg/s² pair string. The Spike UI
// only exposes three presets (slow/medium/fast); we mirror that here using
// the wire-form pair as the dropdown value so import/export needs no
// translation. The SVG (chevron count) is keyed on the display label, not
// the value. Mapping confirmed against alexandrehardy/lego-spike-simulator.
const _accelOpt = (label, value) =>
  [{ src: _dataUri(_accelSvg(label)), width: 24, height: 24, alt: label }, value];

const _ACCEL = [
  _accelOpt('slow',   '1000 1000'),
  _accelOpt('medium', '3000 3000'),
  _accelOpt('fast',   '10000 10000'),
];
const _LIGHT_DIR  = [['clockwise','clockwise'],['counterclockwise','counterclockwise']];
const _SOUND_FX   = [['pitch','PITCH'],['pan left/right','PAN']];
const _MATHOP     = [
  ['abs','abs'],['floor','floor'],['ceiling','ceiling'],['sqrt','sqrt'],
  ['sin','sin'],['cos','cos'],['tan','tan'],['asin','asin'],['acos','acos'],
  ['atan','atan'],['ln','ln'],['log','log'],['e ^','e ^'],['10 ^','10 ^'],
];
// Sound dropdown: value is Spike's JSON-encoded selector string so files
// saved by Spike's editor round-trip without falling back to defaults.
// Common entries from the Spike sound library; the simulator's generator
// just logs the chosen sound (no audio playback today).
const _sndVal = (name) => `{"name":"${name}","location":"device"}`;
const _SOUNDS = [
  ['Cat Meow',    _sndVal('Cat Meow 1')],
  ['Dog Bark',    _sndVal('Dog 1')],
  ['Tada',        _sndVal('Tada')],
  ['Motor Start', _sndVal('Motor Start')],
  ['Beep',        _sndVal('Beep')],
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
      { type: 'field_image', src: 'static/icons/' + icon, width: 40, height: 40, alt: '' },
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
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
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
      { type: 'field_port_grid', name: 'PORT',     mode: 'multi', value: 'A' },
      { type: 'field_angle_dial', name: 'POSITION', value: '0' },
      { type: 'field_dropdown',  name: 'DIRECTION', options: _SHORTEST },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Rotate motor to an absolute position (0–359 degrees).',
  },

  { type: 'flippermotor_motorStartDirection',
    message0: '%1 start motor %2',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'field_dropdown', name: 'DIRECTION', options: _DIR_CW_CCW },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Start a motor running until stopped.',
  },

  { type: 'flippermotor_motorStop',
    message0: '%1 stop motor',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Stop a motor.',
  },

  { type: 'flippermotor_motorSetSpeed',
    message0: '%1 set speed to %2 %%',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'input_value',    name: 'SPEED', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Set default motor speed (-100 to 100).',
  },

  { type: 'flippermotor_absolutePosition',
    message0: '%1 position',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' }],
    output: 'Number', colour: C_MOTOR,
    tooltip: 'Current motor position in degrees (0–359).',
  },

  { type: 'flippermotor_speed',
    message0: '%1 speed',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' }],
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
    message0: 'move %1 for %2 %3',
    args0: [
      { type: 'field_steering', name: 'STEERING', value: 0 },
      { type: 'input_value',    name: 'VALUE',    check: ['Number','String'] },
      { type: 'field_dropdown', name: 'UNIT',     options: _MOTOR_UNITS },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOVEMENT, tooltip: 'Move with steering (-100..100) for a duration.',
  },

  { type: 'flippermove_startSteer',
    message0: 'start moving %1',
    args0: [{ type: 'field_steering', name: 'STEERING', value: 0 }],
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
    args0: [{ type: 'field_port_grid', name: 'PAIR', mode: 'pair', value: 'AB' }],
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
      { type: 'field_matrix', name: 'MATRIX', value: '9909999099000009000909990' },
      { type: 'input_value',  name: 'VALUE',  check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Light a 5×5 brightness pattern for N seconds.',
  },

  { type: 'flipperlight_lightDisplayImageOn',
    message0: 'turn on %1',
    args0: [{ type: 'field_matrix', name: 'MATRIX', value: '9909999099000009000909990' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Light a 5×5 brightness pattern.',
  },

  { type: 'flipperlight_lightDisplayText',
    message0: 'write %1',
    args0: [{ type: 'field_input', name: 'TEXT', text: 'Hello' }],
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
    args0: [{ type: 'field_color_strip', name: 'COLOR', value: '9' }],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Set the centre button colour.',
  },

  { type: 'flipperlight_ultrasonicLightUp',
    message0: 'distance sensor %1 light up %2',
    args0: [
      { type: 'field_port_grid', name: 'PORT',  mode: 'single', value: 'A' },
      { type: 'field_ultrasonic', name: 'VALUE', value: '100 100 100 100' },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_LIGHT, tooltip: 'Light up the distance sensor LEDs.',
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
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
      { type: 'field_dropdown', name: 'OPTION', options: _COLORS },
    ],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the colour sensor sees a specific colour.',
  },

  { type: 'flipperevents_whenPressed',
    message0: 'when force sensor on %1 is %2',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
      { type: 'field_dropdown', name: 'OPTION', options: _PRESS_OPT },
    ],
    nextStatement: null, colour: C_EVENT,
    tooltip: 'Runs when the force sensor changes state.',
  },

  { type: 'flipperevents_whenDistance',
    message0: 'when distance sensor on %1 is %2 %3 %4',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
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
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
      { type: 'field_dropdown', name: 'VALUE', options: _COLORS },
    ],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the sensor sees the given colour.',
  },

  { type: 'flippersensors_color',
    message0: 'colour sensor on %1 colour',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' }],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Detected colour code.',
  },

  { type: 'flippersensors_isReflectivity',
    message0: 'colour sensor on %1 reflection %2 %3 %%',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
      { type: 'field_dropdown', name: 'COMPARATOR', options: _COMPARE_LT },
      { type: 'input_value',    name: 'VALUE',      check: ['Number','String'] },
    ],
    output: 'Boolean', inputsInline: true, colour: C_SENSOR,
    tooltip: 'Compare reflected light to a percentage.',
  },

  { type: 'flippersensors_reflectivity',
    message0: 'colour sensor on %1 reflected light',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' }],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Reflected-light percentage (0–100).',
  },

  { type: 'flippersensors_isPressed',
    message0: 'force sensor on %1 is %2 ?',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
      { type: 'field_dropdown', name: 'OPTION', options: _PRESS_IS },
    ],
    output: 'Boolean', colour: C_SENSOR,
    tooltip: 'True when the force sensor is pressed/released.',
  },

  { type: 'flippersensors_force',
    message0: 'force sensor on %1 pressure in %2',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
      { type: 'field_dropdown', name: 'UNIT', options: _FORCE_UNITS },
    ],
    output: 'Number', colour: C_SENSOR,
    tooltip: 'Pressure on the force sensor.',
  },

  { type: 'flippersensors_isDistance',
    message0: 'distance sensor on %1 is %2 %3 %4 ?',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
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
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
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

  // ── VARIABLES ───────────────────────────────────────────────────────────────
  // Scratch sb3 opcodes (data_*) — used over Blockly's native variables_get /
  // variables_set so an .llsp3 round-trips back into the official Spike app
  // with the same blocks the user dropped onto the canvas.

  { type: 'data_variable',
    message0: '%1',
    args0: [{ type: 'field_variable', name: 'VARIABLE', variable: 'item' }],
    output: ['Number', 'String'], colour: C_VARS,
    tooltip: 'Read the current value of a variable.',
  },

  { type: 'data_setvariableto',
    message0: 'set %1 to %2',
    args0: [
      { type: 'field_variable', name: 'VARIABLE', variable: 'item' },
      { type: 'input_value',    name: 'VALUE',    check: ['Number', 'String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_VARS, tooltip: 'Set a variable to a value.',
  },

  { type: 'data_changevariableby',
    message0: 'change %1 by %2',
    args0: [
      { type: 'field_variable', name: 'VARIABLE', variable: 'item' },
      { type: 'input_value',    name: 'VALUE',    check: ['Number', 'String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_VARS, tooltip: 'Add to the current value of a variable.',
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
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'input_value',    name: 'POSITION', check: ['Number','String'] },
      { type: 'input_value',    name: 'SPEED',    check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Move motor to a relative position.',
  },

  { type: 'flippermoremotor_motorStartPower',
    message0: 'start motor %1 at %2 %% power',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'input_value',    name: 'POWER', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Run motor at a specific power level.',
  },

  { type: 'flippermoremotor_motorSetStopMethod',
    message0: 'set motor %1 to %2 at stop',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'field_dropdown', name: 'STOP', options: _STOP_METHOD },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Choose stopping behaviour for a motor.',
  },

  { type: 'flippermoremotor_motorSetAcceleration',
    message0: 'set motor %1 acceleration to %2',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'field_dropdown', name: 'ACCELERATION', options: _ACCEL },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Choose motor acceleration profile.',
  },

  { type: 'flippermoremotor_motorSetDegreeCounted',
    message0: 'set motor %1 relative position to %2',
    args0: [
      { type: 'field_port_grid', name: 'PORT', mode: 'multi', value: 'A' },
      { type: 'input_value',    name: 'VALUE', check: ['Number','String'] },
    ],
    inputsInline: true, previousStatement: null, nextStatement: null,
    colour: C_MOTOR, tooltip: 'Reset the motor’s degree counter.',
  },

  { type: 'flippermoremotor_power',
    message0: 'motor %1 power',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' }],
    output: 'Number', colour: C_MOTOR, tooltip: 'Motor power reporter.',
  },

  { type: 'flippermoremotor_position',
    message0: 'motor %1 relative position',
    args0: [{ type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' }],
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
      { type: 'field_port_grid', name: 'PORT', mode: 'single', value: 'A' },
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

// Key the simulator's beep frequencies on the JSON-encoded sound-library
// names (matching `_SOUNDS` values). Unknown sounds fall back to 60.
const _SOUND_NOTES = {
  [_sndVal('Cat Meow 1')]:    69,
  [_sndVal('Dog 1')]:         57,
  [_sndVal('Tada')]:          72,
  [_sndVal('Motor Start')]:   50,
  [_sndVal('Beep')]:          65,
};
const _WHEEL_CIRC_MM = Math.PI * 56;
const _MM_PER_MS_AT_100 = 0.9;

// Map LEGO word-block colour index → simulator colour token. The simulator
// emits 'magenta' / 'azure' / 'red' etc. from `_colorAtPosition`. LEGO
// "Violet" (1) maps to sim 'magenta'; "Light Blue" (4) maps to sim 'azure'
// (aligned with Python's color.AZURE — audit 2026-05-13 §4.8).
const _COLOR_INDEX_TO_NAME = {
  '-1': 'none',
  '0':  'black',
  '1':  'magenta',
  '3':  'blue',
  '4':  'azure',
  '6':  'green',
  '7':  'yellow',
  '9':  'red',
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

  // Direction sign for single-motor blocks. The dropdown label is the rotation
  // direction of the wheel as the student sees it from outside the robot, so
  // "clockwise" on the left wheel rolls the wheel backward — same convention a
  // kid gets by watching the physical model. Drive-side ports translate that
  // into wheel velocity via _animateSingleMotor + PORT_CONFIG roles.
  const motorVDir = (dir) => dir === 'clockwise' ? -1 : 1;
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
    const pos  = block.getFieldValue('POSITION') || '0';
    let sign;
    // Matches motorVDir: clockwise (kid-facing wheel view) = wheel backward.
    if (dir === 'clockwise') sign = '-1';
    else if (dir === 'counterclockwise') sign = '1';
    else sign = '(((window.sim.getMotorPosition("' + port + '") - ' + pos + ' + 540) % 360 - 180) > 0 ? -1 : 1)';
    return `await window.sim._animateSingleMotor('${port}', _motorSpeed/100*${sign}, (Math.abs(${pos}) / 360) * ${_WHEEL_CIRC_MM});\n`;
  };

  js['flippermotor_motorStartDirection'] = (block) => {
    const port = block.getFieldValue('PORT');
    const dir  = motorVDir(block.getFieldValue('DIRECTION'));
    return `window.sim._animateSingleMotor('${port}', _motorSpeed/100*${dir}, 5000);\n`;
  };

  // Per BACKLOG / audit 2026-05-13 follow-up: must scope to the chosen
  // PORT, not call sim.stop() (which sets isRunning=false and kills the
  // whole program — including any concurrent motor that wasn't named).
  js['flippermotor_motorStop'] = (block) => {
    const port = block.getFieldValue('PORT');
    return `await window.sim._execCmd({type:'motor_stop', port:'${port}'});\n`;
  };

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
    const steer = String(Number(block.getFieldValue('STEERING')) || 0);
    const v     = val(block, 'VALUE', '10');
    const unit  = block.getFieldValue('UNIT');
    let distMM;
    if (unit === 'rotations')      distMM = `(${v} * _moveRotMM)`;
    else if (unit === 'degrees')   distMM = `((${v} / 360) * _moveRotMM)`;
    else                           distMM = `(${v} * _moveSpeed/100 * ${_MM_PER_MS_AT_100} * 1000)`;
    return `{ const _s = (${steer})/100; _distMoved += ${distMM} / 10; await window.sim._animateTank(_moveSpeed/100*(1+_s), _moveSpeed/100*(1-_s), ${distMM}); }\n`;
  };

  js['flippermove_startSteer'] = (block) => {
    const steer = String(Number(block.getFieldValue('STEERING')) || 0);
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
    const matrix = JSON.stringify(block.getFieldValue('MATRIX') || '0'.repeat(25));
    const sec    = val(block, 'VALUE',  '2');
    return `{ const _m = String(${matrix}).padEnd(25, '0'); window.sim.robot.display = Array.from(_m).slice(0,25).map(c => Number(c)*11); await window.sim._sleep((${sec}) * 1000 / window.sim.speedMult); window.sim.robot.display = Array(25).fill(0); }\n`;
  };

  js['flipperlight_lightDisplayImageOn'] = (block) => {
    const matrix = JSON.stringify(block.getFieldValue('MATRIX') || '0'.repeat(25));
    return `{ const _m = String(${matrix}).padEnd(25, '0'); window.sim.robot.display = Array.from(_m).slice(0,25).map(c => Number(c)*11); }\n`;
  };

  js['flipperlight_lightDisplayText'] = (block) => {
    const text = JSON.stringify(block.getFieldValue('TEXT') || 'Hello');
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

  // ── Events (hat blocks) ────────────────────────────────────────────────────
  //
  // Each hat generator below emits either a `_mainBody = ...` assignment
  // (whenProgramStarts) or a `_hats.push(async () => { ... })` polling task.
  // The runtime they reference is set up in generateBlocklyJS's preamble +
  // epilogue.

  const HAT_TYPES = new Set([
    'flipperevents_whenProgramStarts','flipperevents_whenColor','flipperevents_whenPressed',
    'flipperevents_whenDistance','flipperevents_whenTilted','flipperevents_whenOrientation',
    'flipperevents_whenGesture','flipperevents_whenButton','flipperevents_whenTimer',
    'flipperevents_whenCondition','event_whenbroadcastreceived',
  ]);

  // Hat generators emit code that wraps the next-chain body inside a closure.
  // Blockly's default scrub_ would then ALSO append the next-chain code after
  // the closure, duplicating it. Override scrub_ to skip the next-chain append
  // for hat blocks; the hat generator owns its body via blockToCode(getNextBlock()).
  const _origScrub = js.scrub_ ? js.scrub_.bind(js) : (_b, code) => code;
  js.scrub_ = function (block, code, opt_thisOnly) {
    if (block && HAT_TYPES.has(block.type)) return code;
    return _origScrub(block, code, opt_thisOnly);
  };

  // Placeholder generators — replaced by real ones in Tasks 3-9.
  for (const t of HAT_TYPES) {
    js[t] = () => '';
  }

  js['flipperevents_whenProgramStarts'] = (block) => {
    const next = block.getNextBlock ? block.getNextBlock() : null;
    const body = next ? js.blockToCode(next) : '';
    return `_mainBody = async () => {\n${body}};\n`;
  };

  // ── Event-hat helpers ──────────────────────────────────────────────────────

  // Canonical ports for each sensor kind in the simulator's default wiring
  // (mirror of PORT_CONFIG in js/simulator.js). Hats whose PORT dropdown
  // selects a different port emit a stub-warn instead of a polling task —
  // the accessor methods (getForceSensorPressed, etc.) take no port arg, so
  // any port other than the canonical one is meaningless.
  const _CANONICAL_SENSOR_PORTS = {
    color_sensor:    'E',
    distance_sensor: 'F',
    force_sensor:    'C',
  };

  // emitBoolHatPoll: standard polling task for boolean-condition hats.
  // condExpr is a JS expression producing the current truthiness. opts.oneShot
  // adds a `_hatFired` gate and sets it BEFORE the body — so a body that
  // throws still consumes the single-shot, matching the spec's "fires once"
  // contract for one-shot hats like whenTimer.
  function emitBoolHatPoll(block, condExpr, opts = {}) {
    const id    = block.id;
    const kind  = block.type || 'hat';
    const next  = block.getNextBlock ? block.getNextBlock() : null;
    const body  = next ? js.blockToCode(next) : '';
    const fireGate   = opts.oneShot ? ` && !_hatFired['${id}']` : '';
    const oneShotSet = opts.oneShot ? `\n        _hatFired['${id}'] = true;` : '';
    return [
      `_hats.push(async () => {`,
      `  while (window.sim.isRunning) {`,
      `    const cur = ${condExpr};`,
      `    if (cur && !_hatPrev['${id}'] && !_hatBusy['${id}']${fireGate}) {`,
      `      _hatBusy['${id}'] = true;${oneShotSet}`,
      `      try {`,
      `${body}      } catch (e) {`,
      `        if (window.appendOutput) window.appendOutput('[Error] ${kind}: ' + ((e && e.message) || e), 'error');`,
      `      } finally {`,
      `        _hatBusy['${id}'] = false;`,
      `      }`,
      `    }`,
      `    _hatPrev['${id}'] = cur;`,
      `    await new Promise(r => requestAnimationFrame(r));`,
      `  }`,
      `});`,
      ``,
    ].join('\n');
  }

  // emitNumericHatPoll: numeric-prev polling task for "X changed" style hats.
  // Uses !== for edge detection; seeds _hatPrev at hat start so the first
  // frame doesn't fire spuriously.
  function emitNumericHatPoll(block, valueExpr) {
    const id   = block.id;
    const kind = block.type || 'hat';
    const next = block.getNextBlock ? block.getNextBlock() : null;
    const body = next ? js.blockToCode(next) : '';
    return [
      `_hats.push(async () => {`,
      `  _hatPrev['${id}'] = ${valueExpr};`,
      `  while (window.sim.isRunning) {`,
      `    const cur = ${valueExpr};`,
      `    if (cur !== _hatPrev['${id}'] && !_hatBusy['${id}']) {`,
      `      _hatBusy['${id}'] = true;`,
      `      try {`,
      `${body}      } catch (e) {`,
      `        if (window.appendOutput) window.appendOutput('[Error] ${kind}: ' + ((e && e.message) || e), 'error');`,
      `      } finally {`,
      `        _hatBusy['${id}'] = false;`,
      `      }`,
      `    }`,
      `    _hatPrev['${id}'] = cur;`,
      `    await new Promise(r => requestAnimationFrame(r));`,
      `  }`,
      `});`,
      ``,
    ].join('\n');
  }

  js['flipperevents_whenPressed'] = (block) => {
    const port = block.getFieldValue('PORT');
    if (port !== _CANONICAL_SENSOR_PORTS.force_sensor) {
      return emitStubWarnHat('force-sensor',
        `no force sensor on port ${port} — the simulator wires the force sensor to port ${_CANONICAL_SENSOR_PORTS.force_sensor}`);
    }
    const option = block.getFieldValue('OPTION');
    if (option === 'hard-pressed') return emitBoolHatPoll(block, 'window.sim.getForceSensorValue() >= 70');
    if (option === 'released')     return emitBoolHatPoll(block, '!window.sim.getForceSensorPressed()');
    if (option === 'pressure changed') return emitNumericHatPoll(block, 'window.sim.getForceSensorValue()');
    // Default: 'pressed'
    return emitBoolHatPoll(block, 'window.sim.getForceSensorPressed()');
  };

  js['flipperevents_whenColor'] = (block) => {
    const port = block.getFieldValue('PORT');
    if (port !== _CANONICAL_SENSOR_PORTS.color_sensor) {
      return emitStubWarnHat('colour-sensor',
        `no colour sensor on port ${port} — the simulator wires the colour sensor to port ${_CANONICAL_SENSOR_PORTS.color_sensor}`);
    }
    // The OPTION field stores the LEGO integer color code (see _COLORS) — '0'
    // for black, '9' for red, etc. The simulator's accessor returns the color
    // NAME ('black', 'red', …), so translate via the same helper the
    // flippersensors_isColor reporter uses.
    const idx  = block.getFieldValue('OPTION');
    const name = _colorIndexToName(idx);
    return emitBoolHatPoll(block, `window.sim.getColorSensorColor() === ${JSON.stringify(name)}`);
  };

  js['flipperevents_whenDistance'] = (block) => {
    const port = block.getFieldValue('PORT');
    if (port !== _CANONICAL_SENSOR_PORTS.distance_sensor) {
      return emitStubWarnHat('distance-sensor',
        `no distance sensor on port ${port} — the simulator wires the distance sensor to port ${_CANONICAL_SENSOR_PORTS.distance_sensor}`);
    }
    const comp   = block.getFieldValue('COMPARATOR');
    const unit   = block.getFieldValue('UNIT');
    const valStr = js.valueToCode ? js.valueToCode(block, 'VALUE', ORDER_ATOMIC) : '0';
    const raw    = parseFloat(valStr);
    const value  = isNaN(raw) ? 0 : raw;
    // Convert to mm at generator time so the polling expression is just an int.
    const DIST_MAX_MM = 2000;  // matches simulator's DIST_SENSOR_MAX_MM
    let mm;
    if (unit === 'cm')      mm = Math.round(value * 10);
    else if (unit === 'inches') mm = Math.round(value * 25.4);
    else if (unit === '%')  mm = Math.round((value * DIST_MAX_MM) / 100);
    else                    mm = Math.round(value);
    let cond;
    if (comp === '<')      cond = `window.sim.getDistanceSensorValue() < ${mm}`;
    else if (comp === '>') cond = `window.sim.getDistanceSensorValue() > ${mm}`;
    else                   cond = `Math.abs(window.sim.getDistanceSensorValue() - ${mm}) <= 10`;  // '=' band
    return emitBoolHatPoll(block, cond);
  };

  js['flipperevents_whenTimer'] = (block) => {
    const valStr  = js.valueToCode ? js.valueToCode(block, 'VALUE', ORDER_ATOMIC) : '0';
    const seconds = parseFloat(valStr);
    const ms      = isNaN(seconds) ? 0 : Math.round(seconds * 1000);
    return emitBoolHatPoll(block, `(performance.now() - _t0) >= ${ms}`, { oneShot: true });
  };

  js['flipperevents_whenCondition'] = (block) => {
    const condStr = js.valueToCode ? js.valueToCode(block, 'CONDITION', ORDER_ATOMIC) : '';
    const inner = condStr.trim() === '' ? 'false' : condStr;
    return emitBoolHatPoll(block, `!!(${inner})`);
  };

  // emitWrongPortValue: produces an inline expression for sensor reporter
  // blocks whose PORT dropdown doesn't match the canonical wiring. The
  // expression warns once (deduped per kind:port pair via a Set on window),
  // then returns a safe sentinel via the comma operator. Used by all eight
  // colour/force/distance reporters below — keeps them honest about which
  // port the sim actually has the sensor on.
  function emitWrongPortValue(kind, port, canonical, safeValueLiteral) {
    const key = JSON.stringify(`${kind}:${port}`);
    const msg = JSON.stringify(
      `[!] ${kind} reporter: no ${kind} on port ${port} — wired to port ${canonical}`,
    );
    return `((window._sensorPortWarns = window._sensorPortWarns || new Set()).has(${key}) `
         + `|| (window._sensorPortWarns.add(${key}), `
         + `window.appendOutput && window.appendOutput(${msg}, 'warn')), `
         + `${safeValueLiteral})`;
  }

  // Stub-warn: hats whose underlying API isn't implemented yet. They emit a
  // one-line warning at program start and a no-op polling loop so they wind
  // down with Promise.all when isRunning flips to false.
  function emitStubWarnHat(kind, reason) {
    return [
      `;(function () {`,
      `  var _msg = "[!] when ${kind}: ${reason} — this hat won't fire";`,
      `  if (window.appendOutput) window.appendOutput(_msg, 'warn');`,
      `  else if (typeof console !== 'undefined' && console.warn) console.warn(_msg);`,
      `})();`,
      `_hats.push(async () => {`,
      `  while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }`,
      `});`,
      ``,
    ].join('\n');
  }

  js['flipperevents_whenButton']      = () => emitStubWarnHat('button',      "hub-button API isn't implemented yet");
  js['flipperevents_whenTilted']      = () => emitStubWarnHat('tilted',      "motion sensor isn't implemented yet");
  js['flipperevents_whenOrientation'] = () => emitStubWarnHat('orientation', "motion sensor isn't implemented yet");
  js['flipperevents_whenGesture']     = () => emitStubWarnHat('gesture',     "motion sensor isn't implemented yet");
  js['event_whenbroadcastreceived']   = () => emitStubWarnHat('broadcast',   "broadcast runtime isn't implemented yet");

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
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.color_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('colour-sensor', port, canonical, 'false'), ORDER_ATOMIC];
    }
    const idx  = block.getFieldValue('VALUE');
    const name = _colorIndexToName(idx);
    return [`window.sim.getColorSensorColor() === '${name}'`, ORDER_ATOMIC];
  };

  js['flippersensors_color'] = (block) => {
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.color_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('colour-sensor', port, canonical, '-1'), ORDER_ATOMIC];
    }
    // Inverse of _COLOR_INDEX_TO_NAME: simulator token → LEGO word-block index.
    return [`(({black:0,magenta:1,blue:3,azure:4,green:6,yellow:7,red:9,white:10,none:-1})[window.sim.getColorSensorColor()] ?? -1)`, ORDER_ATOMIC];
  };

  js['flippersensors_isReflectivity'] = (block) => {
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.color_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('colour-sensor', port, canonical, 'false'), ORDER_ATOMIC];
    }
    const op  = block.getFieldValue('COMPARATOR');
    const v   = val(block, 'VALUE', '50');
    return [`(window.sim.getColorSensorReflection() ${op} (${v}))`, ORDER_ATOMIC];
  };

  js['flippersensors_reflectivity'] = (block) => {
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.color_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('colour-sensor', port, canonical, '0'), ORDER_ATOMIC];
    }
    return [`window.sim.getColorSensorReflection()`, ORDER_ATOMIC];
  };

  js['flippersensors_isPressed'] = (block) => {
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.force_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('force-sensor', port, canonical, 'false'), ORDER_ATOMIC];
    }
    const opt = block.getFieldValue('OPTION');
    // Mirror py/spike_bridge.py force_sensor.*: raise if no force sensor
    // is configured anywhere. Comma-operator preserves the boolean value.
    const guard = `window.sim._assertSensorAvailable('force_sensor')`;
    if (opt === 'released') return [`(${guard}, !window.sim.getForceSensorPressed())`, ORDER_ATOMIC];
    if (opt === 'hard-pressed') return [`(${guard}, window.sim.getForceSensorValue() >= 70)`, ORDER_ATOMIC];
    return [`(${guard}, window.sim.getForceSensorPressed())`, ORDER_ATOMIC];
  };

  js['flippersensors_force'] = (block) => {
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.force_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('force-sensor', port, canonical, '0'), ORDER_ATOMIC];
    }
    const unit = block.getFieldValue('UNIT');
    const guard = `window.sim._assertSensorAvailable('force_sensor')`;
    if (unit === 'newton') return [`(${guard}, window.sim.getForceSensorValue() / 10)`, ORDER_ATOMIC];
    return [`(${guard}, window.sim.getForceSensorValue())`, ORDER_ATOMIC];
  };

  js['flippersensors_isDistance'] = (block) => {
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.distance_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('distance-sensor', port, canonical, 'false'), ORDER_ATOMIC];
    }
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
    const port = block.getFieldValue('PORT');
    const canonical = _CANONICAL_SENSOR_PORTS.distance_sensor;
    if (port !== canonical) {
      return [emitWrongPortValue('distance-sensor', port, canonical, '-1'), ORDER_ATOMIC];
    }
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
    if (axis === 'yaw') return [`window.sim.getYaw()`, ORDER_ATOMIC];
    // Top-down sim has no pitch/roll axis — always 0, matching LEGO docs for
    // a flat-on-table hub.
    return [`0`, ORDER_ATOMIC];
  };

  js['flippersensors_resetYaw'] = (_b) => `window.sim.resetYaw();\n`;

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

  // ── Variables ──────────────────────────────────────────────────────────────
  // field_variable stores the variable's *id*; look up the name through the
  // workspace so the generated JS uses a stable, readable identifier.
  const _sanitize = (typeof window !== 'undefined' && window._sanitizeVarName)
    ? window._sanitizeVarName
    : _sanitizeVarName;
  function _varNameOf(block) {
    const id = block.getFieldValue('VARIABLE');
    const ws = block.workspace;
    const v = ws && ws.getVariableById ? ws.getVariableById(id) : null;
    return _sanitize(v ? v.name : id);
  }

  js['data_variable']         = (b) => [_varNameOf(b), ORDER_ATOMIC];
  js['data_setvariableto']    = (b) => `${_varNameOf(b)} = ${val(b,'VALUE','0')};\n`;
  js['data_changevariableby'] = (b) =>
    `${_varNameOf(b)} = (Number(${_varNameOf(b)}) || 0) + (Number(${val(b,'VALUE','0')}) || 0);\n`;

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

  // ── My Blocks ──────────────────────────────────────────────────────────────
  // Reporter blocks just echo the slugified arg name — it's resolved to the
  // surrounding function's parameter at runtime. Slugging is shared with
  // the definition/call generators below so the names always line up.
  const _slug = (n) => (window.MyBlocks && window.MyBlocks.slugifyName)
    ? window.MyBlocks.slugifyName(n) : String(n || 'arg').replace(/[^a-z0-9_]/gi, '_');

  js['myblocks_arg_string_number'] = (block) => {
    return [_slug(block.getFieldValue('VALUE')), ORDER_ATOMIC];
  };
  js['myblocks_arg_boolean'] = (block) => {
    return [_slug(block.getFieldValue('VALUE')), ORDER_ATOMIC];
  };

  // Call site: `await name(args);`. Default expressions for empty slots —
  // boolean → `false`, string_number → `0` — match Scratch's argumentdefaults
  // convention so unconnected slots don't error out at runtime.
  js['myblocks_call'] = (block) => {
    const spec = block.argspec_ || [];
    const fnName = window.MyBlocks
      ? window.MyBlocks.slugifyName(window.MyBlocks.derivedNameFromArgspec(spec))
      : 'my_block';
    const args = [];
    let i = 0;
    for (const tok of spec) {
      if (tok.kind !== 'arg') continue;
      const fallback = tok.argKind === 'boolean' ? 'false' : '0';
      const expr = js.valueToCode(block, 'ARG' + i, ORDER_NONE) || fallback;
      args.push(expr);
      i++;
    }
    return `await ${fnName}(${args.join(', ')});\n`;
  };

  // Definition: `async function name(args) { body }`. Body is the next-block
  // chain (statements connected below the hat).
  //
  // CRITICAL: returns `null` and stashes the function in js.definitions_
  // rather than returning the function string. Blockly's blockToCode
  // contract: a STRING return is auto-concatenated with the next-chain's
  // code. We already read the next chain ourselves to build the body, so
  // returning the function string would cause Blockly to walk that chain
  // AGAIN and emit the body at top scope — at which point arg-reporter
  // references like `a` fall outside the function and ReferenceError. A
  // `null` return suppresses both this block's emission AND the next-chain
  // auto-append. js.finish() then prepends everything in js.definitions_
  // so the function still appears at top scope, reachable from call sites.
  // This mirrors Blockly's own procedures_defnoreturn generator.
  js['myblocks_definition'] = (block) => {
    const spec = block.argspec_ || [];
    const fnName = window.MyBlocks
      ? window.MyBlocks.slugifyName(window.MyBlocks.derivedNameFromArgspec(spec))
      : 'my_block';
    const params = spec.filter(t => t.kind === 'arg').map(t => _slug(t.name));
    const next = block.getNextBlock ? block.getNextBlock() : null;
    const body = next ? js.blockToCode(next) : '';
    if (!js.definitions_) js.definitions_ = {};
    js.definitions_['%myblocks_' + fnName] =
      `async function ${fnName}(${params.join(', ')}) {\n${body}}\n`;
    return null;
  };
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
      <field name="POSITION">0</field>
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
      <field name="STEERING">0</field>
      ${_shadowNum('VALUE', 1)}
    </block>
    <block type="flippermove_startSteer">
      <field name="STEERING">30</field>
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
      <field name="MATRIX">9909999099000009000909990</field>
      ${_shadowNum('VALUE', 2)}
    </block>
    <block type="flipperlight_lightDisplayImageOn">
      <field name="MATRIX">9909999099000009000909990</field>
    </block>
    <block type="flipperlight_lightDisplayText">
      <field name="TEXT">Hello</field>
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
      <field name="VALUE">100 100 100 100</field>
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
  <category name="MY BLOCKS"  colour="${C_MYBLOCKS}" custom="MY_BLOCKS"></category>

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
// Steering field: stores a number -100..100 (positive = right turn).
// Display on the block is "left: NN" / "straight" / "right: NN", matching
// Spike's inline label. The editor opens a circular dial popup — drag the
// indicator around the dial to set the angle, or use the −/+ buttons for
// fine adjustment. The underlying value remains a plain integer so
// generators / sb3 round-trip continue to see a number.
let _steeringFieldRegistered = false;
function _registerSteeringField(Blockly) {
  if (_steeringFieldRegistered) return;
  if (!(Blockly.FieldDropdown && Blockly.fieldRegistry && Blockly.DropDownDiv)) return;

  // Field value is stored as a numeric STRING (e.g. "65", "-30", "0") so it
  // satisfies FieldDropdown's option validator (option[1] must be a string)
  // while still parsing cleanly via Number() in generators and sb3 export.
  function _clampSteer(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return String(Math.max(-100, Math.min(100, Math.round(n))));
  }

  function _steerLabel(s) {
    const n = Number(s);
    if (!Number.isFinite(n) || Math.abs(n) < 1) return 'straight';
    return (n > 0 ? 'right' : 'left') + ': ' + Math.abs(n);
  }

  class FieldSteering extends Blockly.FieldDropdown {
    static fromJson(options) {
      return new FieldSteering(options.value, undefined, undefined, undefined, undefined, options);
    }
    // Constructor signature preserved for backward-compat callers
    // (some places used `new FieldSteering(value, min, max, precision, validator, config)`).
    constructor(value, _min, _max, _precision, _validator, opts) {
      const initial = _clampSteer(value ?? 0);
      const menuGenerator = function () {
        const v = this.getValue ? (this.getValue() ?? initial) : initial;
        return [[v, v]];
      };
      super(menuGenerator, undefined, opts || {});
      this.SERIALIZABLE = true;
      this.setValue(initial);
    }

    doClassValidation_(v) {
      return _clampSteer(v);
    }

    getDisplayText_() {
      return _steerLabel(this.getValue());
    }

    showEditor_() {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const root = document.createElement('div');
      root.className = 'fll-wheel-popup';

      // Build the dial SVG.
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'fll-wheel-svg');
      svg.setAttribute('viewBox', '0 0 100 100');

      // Outer ring.
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('class', 'fll-wheel-ring');
      ring.setAttribute('cx', '50'); ring.setAttribute('cy', '50');
      ring.setAttribute('r', '42');
      svg.appendChild(ring);

      // Tick marks every 15° around the perimeter.
      for (let deg = 0; deg < 360; deg += 15) {
        const long = (deg % 90 === 0);
        const tick = document.createElementNS(SVG_NS, 'line');
        const rad = deg * Math.PI / 180;
        const r1 = 42 - (long ? 6 : 3);
        const r2 = 42;
        tick.setAttribute('x1', String(50 + r1 * Math.sin(rad)));
        tick.setAttribute('y1', String(50 - r1 * Math.cos(rad)));
        tick.setAttribute('x2', String(50 + r2 * Math.sin(rad)));
        tick.setAttribute('y2', String(50 - r2 * Math.cos(rad)));
        tick.setAttribute('class', 'fll-wheel-tick' + (long ? ' long' : ''));
        svg.appendChild(tick);
      }

      // Indicator group: a line + dot pointing up; rotated to current angle.
      const indicator = document.createElementNS(SVG_NS, 'g');
      indicator.setAttribute('class', 'fll-wheel-indicator');
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '50'); line.setAttribute('y1', '50');
      line.setAttribute('x2', '50'); line.setAttribute('y2', '14');
      indicator.appendChild(line);
      const knob = document.createElementNS(SVG_NS, 'circle');
      knob.setAttribute('cx', '50'); knob.setAttribute('cy', '14');
      knob.setAttribute('r', '6');
      indicator.appendChild(knob);
      svg.appendChild(indicator);

      // Center dot.
      const center = document.createElementNS(SVG_NS, 'circle');
      center.setAttribute('class', 'fll-wheel-center');
      center.setAttribute('cx', '50'); center.setAttribute('cy', '50');
      center.setAttribute('r', '4');
      svg.appendChild(center);

      // Controls row.
      const controls = document.createElementNS(null, 'div');
      const cdiv = document.createElement('div');
      cdiv.className = 'fll-wheel-controls';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.className = 'fll-wheel-btn'; minus.textContent = '−';
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'fll-wheel-btn'; plus.textContent = '+';
      const label = document.createElement('div');
      label.className = 'fll-wheel-label';
      cdiv.appendChild(minus);
      cdiv.appendChild(label);
      cdiv.appendChild(plus);

      // Spike's dial maps ±100 to ±135° from straight up — i.e. the
      // indicator swings down to roughly 5 o'clock (right: 100) and
      // 7 o'clock (left: -100), leaving a ~60° dead arc at the bottom.
      const SWEEP = 135;

      const repaint = () => {
        const n = Number(this.getValue() ?? 0);
        const angleDeg = n * (SWEEP / 100);
        indicator.setAttribute('transform', 'rotate(' + angleDeg + ' 50 50)');
        label.textContent = _steerLabel(this.getValue());
      };

      const setFromPointer = (clientX, clientY) => {
        const rect = svg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        // Angle from straight up (0° = top, +90° = right, -90° = left).
        // Clamp to ±135° to match Spike's sweep; pointers in the bottom
        // dead arc snap to the nearer extreme.
        let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
        deg = Math.max(-SWEEP, Math.min(SWEEP, deg));
        this.setValue(_clampSteer(deg / (SWEEP / 100)));
        repaint();
      };

      let dragging = false;
      const onDown = (e) => {
        dragging = true;
        setFromPointer(e.clientX, e.clientY);
        e.preventDefault();
      };
      const onMove = (e) => { if (dragging) setFromPointer(e.clientX, e.clientY); };
      const onUp = () => { dragging = false; };
      svg.addEventListener('mousedown', onDown);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);

      minus.addEventListener('click', () => {
        this.setValue(_clampSteer(Number(this.getValue() ?? 0) - 5));
        repaint();
      });
      plus.addEventListener('click', () => {
        this.setValue(_clampSteer(Number(this.getValue() ?? 0) + 5));
        repaint();
      });

      root.appendChild(svg);
      root.appendChild(cdiv);

      const div = Blockly.DropDownDiv.getContentDiv();
      div.appendChild(root);
      Blockly.DropDownDiv.setColour(
        this.sourceBlock_.getColour(),
        this.sourceBlock_.style.colourTertiary,
      );
      Blockly.DropDownDiv.showPositionedByField(this, () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (root.parentNode) root.parentNode.removeChild(root);
      });
      repaint();
    }
  }

  Blockly.fieldRegistry.register('field_steering', FieldSteering);
  _steeringFieldRegistered = true;
}

// ── Port grid field ──────────────────────────────────────────────────────────
// Spike's port picker is a 2×3 grid of A–F buttons (with optional "ALL" /
// "MULTIPLE" actions) rather than a flat dropdown. The value on the wire is
// a concatenation of selected port letters ("A", "AB", "CF", "ABCDEF") —
// matching what Spike's flippermotor_multiple-port-selector emits.
//
// Modes:
//   'single' — exactly one port; clicking another port replaces the selection
//   'pair'   — exactly two ports; clicking a third port replaces the oldest
//   'multi'  — any non-empty subset; "ALL" selects A–F at once

let _portGridFieldRegistered = false;
function _registerPortGridField(Blockly) {
  if (_portGridFieldRegistered) return;
  if (!(Blockly.FieldDropdown && Blockly.fieldRegistry && Blockly.DropDownDiv)) return;

  const PORTS = ['A','B','C','D','E','F'];

  // Extends FieldDropdown so we inherit the Zelos chip styling (rounded
  // background, internal padding, dropdown caret SVG) for free. We never
  // actually display Blockly's auto-menu — `showEditor_` is overridden to
  // open our custom grid popup. The menu generator returns a single
  // placeholder option matching the current value so FieldDropdown's
  // internal "is this value valid?" check passes.
  class FieldPortGrid extends Blockly.FieldDropdown {
    static fromJson(options) {
      return new FieldPortGrid(options.value, options);
    }
    constructor(value, opts) {
      const mode = (opts && opts.mode) || 'multi';
      const initial = _normalizePortValue(value, mode) || (mode === 'pair' ? 'AB' : 'A');
      // Dynamic menuGenerator: always reports the current value as an
      // available option, satisfying FieldDropdown without enumerating all
      // 63 multi-port combinations.
      const menuGenerator = function () {
        const v = this.getValue ? (this.getValue() || initial) : initial;
        return [[v, v]];
      };
      super(menuGenerator, undefined, opts || {});
      this.mode_ = mode;
      this.SERIALIZABLE = true;
      this._lastOrder = initial.split('');
      this.setValue(initial);
    }

    doClassValidation_(newValue) {
      return _normalizePortValue(newValue, this.mode_);
    }

    getText_() {
      const v = this.getValue() || '';
      // Pair label: "A+B". Multi label: "A+B+C" only feels right up to a few
      // ports; collapse "ABCDEF" to "ALL" for readability.
      if (this.mode_ === 'pair') return v.split('').join('+');
      if (this.mode_ === 'multi') {
        if (v.length === PORTS.length) return 'ALL';
        if (v.length <= 3) return v.split('').join('+');
        return v;
      }
      return v;
    }

    showEditor_() {
      const root = document.createElement('div');
      root.className = 'fll-port-grid fll-port-grid-' + this.mode_;
      const grid = document.createElement('div');
      grid.className = 'fll-port-grid-cells';

      // For multi-capable blocks, opening the popup defaults to single-pick
      // behavior (clicking a port replaces the selection) unless the block
      // already has 2+ ports selected. The user must explicitly click
      // MULTIPLE (or ALL) to opt into multi-toggle behavior — matches Spike's
      // "intentional multi-select" UX.
      this.submode_ = this.mode_ === 'multi'
        ? ((this.getValue() || '').length > 1 ? 'multi-pick' : 'single-pick')
        : null;

      const actions = document.createElement('div');
      actions.className = 'fll-port-actions';

      const renderButtons = () => {
        const selected = new Set((this.getValue() || '').split(''));
        for (const btn of grid.querySelectorAll('button')) {
          btn.classList.toggle('selected', selected.has(btn.dataset.port));
        }
      };

      const renderActions = () => {
        actions.innerHTML = '';
        if (this.mode_ !== 'multi') return;
        // Toggle button: 'MULTIPLE' in single-pick (escalates), 'SINGLE' in
        // multi-pick (drops back to one port + replace-on-click behavior).
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'fll-port-action';
        if (this.submode_ === 'single-pick') {
          toggle.textContent = 'MULTIPLE';
          toggle.addEventListener('click', () => {
            this.submode_ = 'multi-pick';
            renderActions();
          });
        } else {
          toggle.textContent = 'SINGLE';
          toggle.addEventListener('click', () => {
            // Truncate to a single port (the first selected, alphabetically)
            // and resume replace-on-click behavior.
            const first = (this.getValue() || 'A').slice(0, 1);
            this.setValue(first);
            this.submode_ = 'single-pick';
            renderButtons();
            renderActions();
          });
        }
        actions.appendChild(toggle);
        const all = document.createElement('button');
        all.type = 'button';
        all.className = 'fll-port-action';
        all.textContent = 'ALL';
        all.addEventListener('click', () => {
          this.setValue(PORTS.join(''));
          this.submode_ = 'multi-pick';
          renderButtons();
          renderActions();
        });
        actions.appendChild(all);
      };

      for (const p of PORTS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fll-port-cell';
        btn.dataset.port = p;
        btn.textContent = p;
        btn.addEventListener('click', () => {
          this._togglePort(p);
          renderButtons();
        });
        grid.appendChild(btn);
      }
      root.appendChild(grid);
      root.appendChild(actions);

      const div = Blockly.DropDownDiv.getContentDiv();
      div.appendChild(root);
      Blockly.DropDownDiv.setColour(
        this.sourceBlock_.getColour(),
        this.sourceBlock_.style.colourTertiary,
      );
      Blockly.DropDownDiv.showPositionedByField(this, () => {
        if (root.parentNode) root.parentNode.removeChild(root);
      });
      renderButtons();
      renderActions();
    }

    _togglePort(p) {
      if (this.mode_ === 'single') {
        this.setValue(p);
        this._lastOrder = [p];
        return;
      }
      const current = (this.getValue() || '').split('');
      const has = current.includes(p);
      if (this.mode_ === 'pair') {
        if (has) {
          // Don't drop below 2; ignore deselect that would leave one port.
          if (current.length <= 2) return;
          const next = current.filter(x => x !== p);
          this.setValue(_sortPorts(next.join('')));
          this._lastOrder = this._lastOrder.filter(x => x !== p);
          return;
        }
        // Add a new port. If already at 2, drop the oldest.
        const order = this._lastOrder.filter(x => current.includes(x));
        order.push(p);
        const trimmed = order.slice(-2);
        this._lastOrder = trimmed;
        this.setValue(_sortPorts(trimmed.join('')));
        return;
      }
      // multi mode
      if (this.submode_ === 'single-pick') {
        // Treat like single mode: clicking replaces the selection.
        this.setValue(p);
        return;
      }
      // multi-pick: toggle membership, but keep at least one port selected.
      let next;
      if (has) {
        next = current.filter(x => x !== p);
        if (next.length === 0) return;
      } else {
        next = current.concat(p);
      }
      this.setValue(_sortPorts(next.join('')));
    }
  }

  function _sortPorts(s) {
    return [...new Set(s.split(''))].sort().join('');
  }

  function _normalizePortValue(v, mode) {
    if (typeof v !== 'string') return null;
    const upper = v.toUpperCase();
    if (!/^[A-F]+$/.test(upper)) return null;
    const set = [...new Set(upper.split(''))].sort().join('');
    if (set.length === 0) return null;
    if (mode === 'single' && set.length !== 1) return null;
    if (mode === 'pair'   && set.length !== 2) return null;
    if (set.length > 6) return null;
    return set;
  }

  Blockly.fieldRegistry.register('field_port_grid', FieldPortGrid);
  _portGridFieldRegistered = true;
}

// ── 5×5 LED matrix field ─────────────────────────────────────────────────────
// Spike's matrix selector is a 5×5 grid of brightness pixels (digit 0–9 per
// pixel, where 0=off and 9=full) with a vertical brightness ramp acting as
// the paint brush. The wire value is a 25-character string of digits,
// matching Spike's existing format.

const _MATRIX_DEFAULT = '0'.repeat(25);
const _MATRIX_REGEX = /^[0-9]{25}$/;

let _matrixFieldRegistered = false;
function _registerMatrixField(Blockly) {
  if (_matrixFieldRegistered) return;
  if (!(Blockly.FieldDropdown && Blockly.fieldRegistry && Blockly.DropDownDiv)) return;

  class FieldMatrix extends Blockly.FieldDropdown {
    static fromJson(options) {
      return new FieldMatrix(options.value, options);
    }
    constructor(value, opts) {
      const initial = _normalizeMatrix(value) || _MATRIX_DEFAULT;
      // Placeholder menuGenerator: FieldDropdown insists on having options
      // matching the current value; we never display this menu (showEditor_
      // is overridden) but it satisfies its internal validation.
      const menuGenerator = function () {
        const v = this.getValue ? (this.getValue() || initial) : initial;
        return [[v, v]];
      };
      super(menuGenerator, undefined, opts || {});
      this.brush_ = 9;
      this.SERIALIZABLE = true;
      this.setValue(initial);
    }

    doClassValidation_(newValue) {
      return _normalizeMatrix(newValue);
    }

    getDisplayText_() {
      // Compact pictogram for the on-block chip: just an icon glyph that
      // signals "matrix". The full editor is one click away.
      return '▦';  // ▦
    }

    showEditor_() {
      const root = document.createElement('div');
      root.className = 'fll-matrix-popup';

      const value = (this.getValue() || _MATRIX_DEFAULT).split('');

      const grid = document.createElement('div');
      grid.className = 'fll-matrix-grid';
      const cells = [];
      const paintCell = (idx) => {
        const d = parseInt(value[idx] || '0', 10);
        cells[idx].style.opacity = String(0.15 + (d / 9) * 0.85);
      };
      const applyValue = () => this.setValue(value.join(''));

      for (let i = 0; i < 25; i++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'fll-matrix-cell';
        cell.dataset.idx = String(i);
        cell.addEventListener('click', () => {
          value[i] = String(this.brush_);
          paintCell(i);
          applyValue();
        });
        cells.push(cell);
        grid.appendChild(cell);
        paintCell(i);
      }

      const ramp = document.createElement('div');
      ramp.className = 'fll-matrix-ramp';
      const rampCells = [];
      const highlightBrush = () => {
        for (const rc of rampCells) {
          rc.classList.toggle('selected', parseInt(rc.dataset.level, 10) === this.brush_);
        }
      };
      for (let d = 9; d >= 0; d--) {
        const rc = document.createElement('button');
        rc.type = 'button';
        rc.className = 'fll-matrix-ramp-cell';
        rc.dataset.level = String(d);
        rc.style.opacity = String(0.15 + (d / 9) * 0.85);
        rc.addEventListener('click', () => {
          this.brush_ = d;
          highlightBrush();
        });
        rampCells.push(rc);
        ramp.appendChild(rc);
      }
      highlightBrush();

      const body = document.createElement('div');
      body.className = 'fll-matrix-body';
      body.appendChild(grid);
      body.appendChild(ramp);

      const actions = document.createElement('div');
      actions.className = 'fll-matrix-actions';
      const fill = document.createElement('button');
      fill.type = 'button';
      fill.className = 'fll-matrix-action';
      fill.textContent = 'FILL';
      fill.addEventListener('click', () => {
        for (let i = 0; i < 25; i++) { value[i] = String(this.brush_); paintCell(i); }
        applyValue();
      });
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'fll-matrix-action';
      clear.textContent = 'CLEAR';
      clear.addEventListener('click', () => {
        for (let i = 0; i < 25; i++) { value[i] = '0'; paintCell(i); }
        applyValue();
      });
      actions.appendChild(fill);
      actions.appendChild(clear);

      root.appendChild(body);
      root.appendChild(actions);

      const div = Blockly.DropDownDiv.getContentDiv();
      div.appendChild(root);
      Blockly.DropDownDiv.setColour(
        this.sourceBlock_.getColour(),
        this.sourceBlock_.style.colourTertiary,
      );
      Blockly.DropDownDiv.showPositionedByField(this, () => {
        if (root.parentNode) root.parentNode.removeChild(root);
      });
    }
  }

  function _normalizeMatrix(v) {
    if (typeof v !== 'string') return null;
    if (!_MATRIX_REGEX.test(v)) return null;
    return v;
  }

  Blockly.fieldRegistry.register('field_matrix', FieldMatrix);
  _matrixFieldRegistered = true;
}

// ── Ultrasonic LEDs field ────────────────────────────────────────────────────
// Spike's distance sensor has four LEDs arranged as two "eyes" (each eye
// has a top and bottom segment). The wire value is a space-separated string
// of four brightness numbers 0..100, ordered:
//     "<L_top> <L_bottom> <R_top> <R_bottom>"
// We mirror that with a 2×2 grid of brightness buttons. Each button cycles
// 100 → 50 → 0 → 100 on click; FILL / CLEAR set or zero all four at once.

const _ULTRA_DEFAULT = '100 100 100 100';

let _ultrasonicFieldRegistered = false;
function _registerUltrasonicField(Blockly) {
  if (_ultrasonicFieldRegistered) return;
  if (!(Blockly.FieldDropdown && Blockly.fieldRegistry && Blockly.DropDownDiv)) return;

  function _parseUltra(v) {
    if (typeof v !== 'string') return null;
    const parts = v.trim().split(/\s+/);
    if (parts.length !== 4) return null;
    const nums = parts.map(p => Number(p));
    if (!nums.every(n => Number.isFinite(n))) return null;
    return nums.map(n => Math.max(0, Math.min(100, Math.round(n))));
  }
  function _formatUltra(arr) {
    return arr.map(n => String(n)).join(' ');
  }
  function _normalizeUltra(v) {
    const arr = _parseUltra(v);
    return arr ? _formatUltra(arr) : null;
  }

  class FieldUltrasonic extends Blockly.FieldDropdown {
    static fromJson(options) {
      return new FieldUltrasonic(options.value, options);
    }
    constructor(value, opts) {
      const initial = _normalizeUltra(value) || _ULTRA_DEFAULT;
      const menuGenerator = function () {
        const v = this.getValue ? (this.getValue() || initial) : initial;
        return [[v, v]];
      };
      super(menuGenerator, undefined, opts || {});
      this.SERIALIZABLE = true;
      this.setValue(initial);
    }

    doClassValidation_(v) {
      return _normalizeUltra(v);
    }

    getDisplayText_() {
      // Compact eye-pair pictogram for the on-block chip.
      return '◔◔';
    }

    showEditor_() {
      const root = document.createElement('div');
      root.className = 'fll-ultra-popup';

      const arr = _parseUltra(this.getValue()) || [100,100,100,100];
      const applyValue = () => this.setValue(_formatUltra(arr));

      // Two eye-shaped containers, each split into a top and bottom half by
      // a horizontal divider. The four halves map to the four wire values
      // in order: left-top, left-bottom, right-top, right-bottom.
      const eyes = document.createElement('div');
      eyes.className = 'fll-ultra-eyes';
      const cells = [];
      const paintCell = (i) => {
        cells[i].style.opacity = String(0.15 + (arr[i] / 100) * 0.85);
      };
      const eyeLayout = [[0, 1], [2, 3]];  // [leftEye, rightEye] each: [top, bottom]
      for (const [topIdx, botIdx] of eyeLayout) {
        const eye = document.createElement('div');
        eye.className = 'fll-ultra-eye';
        for (const [idx, half] of [[topIdx, 'top'], [botIdx, 'bottom']]) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'fll-ultra-half fll-ultra-half-' + half;
          cell.dataset.idx = String(idx);
          cell.addEventListener('click', () => {
            arr[idx] = arr[idx] >= 100 ? 50 : arr[idx] >= 50 ? 0 : 100;
            paintCell(idx);
            applyValue();
          });
          cells[idx] = cell;
          eye.appendChild(cell);
          paintCell(idx);
        }
        eyes.appendChild(eye);
      }
      const grid = eyes;  // keep the variable name used below

      const actions = document.createElement('div');
      actions.className = 'fll-ultra-actions';
      const fill = document.createElement('button');
      fill.type = 'button'; fill.className = 'fll-ultra-action'; fill.textContent = 'FILL';
      fill.addEventListener('click', () => {
        for (let i = 0; i < 4; i++) { arr[i] = 100; paintCell(i); }
        applyValue();
      });
      const clear = document.createElement('button');
      clear.type = 'button'; clear.className = 'fll-ultra-action'; clear.textContent = 'CLEAR';
      clear.addEventListener('click', () => {
        for (let i = 0; i < 4; i++) { arr[i] = 0; paintCell(i); }
        applyValue();
      });
      actions.appendChild(fill);
      actions.appendChild(clear);

      root.appendChild(grid);
      root.appendChild(actions);

      const div = Blockly.DropDownDiv.getContentDiv();
      div.appendChild(root);
      Blockly.DropDownDiv.setColour(
        this.sourceBlock_.getColour(),
        this.sourceBlock_.style.colourTertiary,
      );
      Blockly.DropDownDiv.showPositionedByField(this, () => {
        if (root.parentNode) root.parentNode.removeChild(root);
      });
    }
  }

  Blockly.fieldRegistry.register('field_ultrasonic', FieldUltrasonic);
  _ultrasonicFieldRegistered = true;
}

// ── Angle dial field ─────────────────────────────────────────────────────────
// Spike's "go to position N" picker is a small 0–359° dial: drag the
// indicator around a full circle to set the target angle. Same pattern as
// the steering wheel but with a full 360° sweep and integer-degree values.

let _angleFieldRegistered = false;
function _registerAngleField(Blockly) {
  if (_angleFieldRegistered) return;
  if (!(Blockly.FieldDropdown && Blockly.fieldRegistry && Blockly.DropDownDiv)) return;

  function _clampAngle(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    return String(((Math.round(n) % 360) + 360) % 360);
  }

  class FieldAngle extends Blockly.FieldDropdown {
    static fromJson(options) {
      return new FieldAngle(options.value, options);
    }
    constructor(value, opts) {
      const initial = _clampAngle(value ?? 0);
      const menuGenerator = function () {
        const v = this.getValue ? (this.getValue() ?? initial) : initial;
        return [[v, v]];
      };
      super(menuGenerator, undefined, opts || {});
      this.SERIALIZABLE = true;
      this.setValue(initial);
    }

    doClassValidation_(v) { return _clampAngle(v); }
    getDisplayText_() { return this.getValue() + '°'; }

    showEditor_() {
      const SVG_NS = 'http://www.w3.org/2000/svg';
      const root = document.createElement('div');
      root.className = 'fll-angle-popup';

      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'fll-angle-svg');
      svg.setAttribute('viewBox', '0 0 100 100');

      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('class', 'fll-angle-ring');
      ring.setAttribute('cx', '50'); ring.setAttribute('cy', '50'); ring.setAttribute('r', '42');
      svg.appendChild(ring);

      for (let deg = 0; deg < 360; deg += 15) {
        const long = (deg % 90 === 0);
        const tick = document.createElementNS(SVG_NS, 'line');
        const rad = deg * Math.PI / 180;
        const r1 = 42 - (long ? 6 : 3);
        const r2 = 42;
        tick.setAttribute('x1', String(50 + r1 * Math.sin(rad)));
        tick.setAttribute('y1', String(50 - r1 * Math.cos(rad)));
        tick.setAttribute('x2', String(50 + r2 * Math.sin(rad)));
        tick.setAttribute('y2', String(50 - r2 * Math.cos(rad)));
        tick.setAttribute('class', 'fll-angle-tick' + (long ? ' long' : ''));
        svg.appendChild(tick);
      }

      const indicator = document.createElementNS(SVG_NS, 'g');
      indicator.setAttribute('class', 'fll-angle-indicator');
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', '50'); line.setAttribute('y1', '50');
      line.setAttribute('x2', '50'); line.setAttribute('y2', '14');
      indicator.appendChild(line);
      const knob = document.createElementNS(SVG_NS, 'circle');
      knob.setAttribute('cx', '50'); knob.setAttribute('cy', '14');
      knob.setAttribute('r', '6');
      indicator.appendChild(knob);
      svg.appendChild(indicator);

      const center = document.createElementNS(SVG_NS, 'circle');
      center.setAttribute('class', 'fll-angle-center');
      center.setAttribute('cx', '50'); center.setAttribute('cy', '50'); center.setAttribute('r', '4');
      svg.appendChild(center);

      const cdiv = document.createElement('div');
      cdiv.className = 'fll-angle-controls';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.className = 'fll-angle-btn'; minus.textContent = '−';
      const plus = document.createElement('button');
      plus.type = 'button'; plus.className = 'fll-angle-btn'; plus.textContent = '+';
      const label = document.createElement('div');
      label.className = 'fll-angle-label';
      cdiv.appendChild(minus); cdiv.appendChild(label); cdiv.appendChild(plus);

      const repaint = () => {
        const deg = Number(this.getValue() || 0);
        indicator.setAttribute('transform', 'rotate(' + deg + ' 50 50)');
        label.textContent = deg + '°';
      };

      const setFromPointer = (clientX, clientY) => {
        const rect = svg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        let deg = Math.atan2(dx, -dy) * 180 / Math.PI;
        // Full 360°: wrap negative angles into 0..359.
        if (deg < 0) deg += 360;
        this.setValue(_clampAngle(deg));
        repaint();
      };

      let dragging = false;
      const onDown = (e) => { dragging = true; setFromPointer(e.clientX, e.clientY); e.preventDefault(); };
      const onMove = (e) => { if (dragging) setFromPointer(e.clientX, e.clientY); };
      const onUp = () => { dragging = false; };
      svg.addEventListener('mousedown', onDown);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);

      minus.addEventListener('click', () => {
        this.setValue(_clampAngle(Number(this.getValue() || 0) - 5));
        repaint();
      });
      plus.addEventListener('click', () => {
        this.setValue(_clampAngle(Number(this.getValue() || 0) + 5));
        repaint();
      });

      root.appendChild(svg);
      root.appendChild(cdiv);

      const div = Blockly.DropDownDiv.getContentDiv();
      div.appendChild(root);
      Blockly.DropDownDiv.setColour(
        this.sourceBlock_.getColour(),
        this.sourceBlock_.style.colourTertiary,
      );
      Blockly.DropDownDiv.showPositionedByField(this, () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (root.parentNode) root.parentNode.removeChild(root);
      });
      repaint();
    }
  }

  Blockly.fieldRegistry.register('field_angle_dial', FieldAngle);
  _angleFieldRegistered = true;
}

// ── Color strip field ────────────────────────────────────────────────────────
// Spike's centre-button colour picker is a tall vertical strip of solid
// colour rectangles, one per value. Same colours as our existing
// `_CENTRE_BTN_COLORS` dropdown — but rendered as a clean colour column
// instead of the horizontal swatch menu Blockly produces by default.

let _colorStripFieldRegistered = false;
function _registerColorStripField(Blockly) {
  if (_colorStripFieldRegistered) return;
  if (!(Blockly.FieldDropdown && Blockly.fieldRegistry && Blockly.DropDownDiv)) return;

  // Mirror of `_CENTRE_BTN_COLORS` but as plain (label, value, hex) tuples
  // so the popup can render solid swatches without re-parsing data URIs.
  const STRIP_COLORS = [
    ['off',        '0',  '#ffffff', true],
    ['pink',       '1',  '#ff80c0'],
    ['violet',     '2',  '#b066d8'],
    ['blue',       '3',  '#1d6dd1'],
    ['light blue', '4',  '#6db3e6'],
    ['cyan',       '5',  '#25b9d8'],
    ['green',      '6',  '#1a9c4a'],
    ['yellow',     '7',  '#f7c911'],
    ['orange',     '8',  '#f08020'],
    ['red',        '9',  '#d12a2a'],
    ['white',      '10', '#ffffff'],
  ];
  const STRIP_VALUES = new Set(STRIP_COLORS.map(c => c[1]));

  class FieldColorStrip extends Blockly.FieldDropdown {
    static fromJson(options) {
      return new FieldColorStrip(options.value, options);
    }
    constructor(value, opts) {
      const initial = STRIP_VALUES.has(String(value)) ? String(value) : '9';
      const menuGenerator = function () {
        const v = this.getValue ? (this.getValue() || initial) : initial;
        return [[v, v]];
      };
      super(menuGenerator, undefined, opts || {});
      this.SERIALIZABLE = true;
      this.setValue(initial);
    }

    doClassValidation_(v) {
      const s = String(v);
      return STRIP_VALUES.has(s) ? s : null;
    }

    getDisplayText_() {
      // Show a coloured chip on the block face by injecting an inline SVG —
      // Blockly will render the returned text as-is in a tspan, so for the
      // chip we render via a thin Unicode block plus a colour set via CSS
      // class. Simpler approach: just show the colour name short label.
      const entry = STRIP_COLORS.find(c => c[1] === this.getValue());
      return entry ? entry[0] : '?';
    }

    showEditor_() {
      const root = document.createElement('div');
      root.className = 'fll-cstrip-popup';
      const list = document.createElement('div');
      list.className = 'fll-cstrip-list';
      const buttons = [];
      const highlight = () => {
        const cur = this.getValue();
        for (const b of buttons) b.classList.toggle('selected', b.dataset.value === cur);
      };
      for (const [name, value, hex, empty] of STRIP_COLORS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fll-cstrip-swatch' + (empty ? ' empty' : '');
        b.dataset.value = value;
        b.style.background = hex;
        b.title = name;
        b.addEventListener('click', () => {
          this.setValue(value);
          highlight();
        });
        buttons.push(b);
        list.appendChild(b);
      }
      root.appendChild(list);
      highlight();

      const div = Blockly.DropDownDiv.getContentDiv();
      div.appendChild(root);
      Blockly.DropDownDiv.setColour(
        this.sourceBlock_.getColour(),
        this.sourceBlock_.style.colourTertiary,
      );
      Blockly.DropDownDiv.showPositionedByField(this, () => {
        if (root.parentNode) root.parentNode.removeChild(root);
      });
    }
  }

  Blockly.fieldRegistry.register('field_color_strip', FieldColorStrip);
  _colorStripFieldRegistered = true;
}

// Registered once on first initBlockly() call.
let _compactRendererRegistered = false;
// Hide Blockly's default right-click items that LEGO SPIKE doesn't expose
// (collapse/expand block, disable/enable block, inline/external inputs).
// Idempotent — guarded by a module flag — and safe if a future Blockly
// renames an entry: unregister wraps a try/catch.
let _contextMenuPruned = false;
function _pruneContextMenu(Blockly) {
  if (_contextMenuPruned) return;
  const reg = Blockly.ContextMenuRegistry && Blockly.ContextMenuRegistry.registry;
  if (!reg || !reg.unregister) return;
  const toHide = [
    'blockDisable', 'blockCollapseExpand', 'collapseWorkspace', 'expandWorkspace',
    'blockInline',
  ];
  for (const id of toHide) { try { reg.unregister(id); } catch (_e) { /* not registered */ } }
  _contextMenuPruned = true;
}

function _registerCompactRenderer(Blockly) {
  if (_compactRendererRegistered) return;
  if (!(Blockly.zelos && Blockly.zelos.Renderer && Blockly.zelos.ConstantProvider)) return;

  class SpikeConstantProvider extends Blockly.zelos.ConstantProvider {
    init() {
      super.init();
      // Tighter horizontal padding still fits more text on a row, but the
      // vertical pill height is restored to match SPIKE Education's measured
      // 32-px field pill (Zelos' default).
      this.FIELD_BORDER_RECT_X_PADDING = 4;     // Zelos default: 5
      this.BETWEEN_FIELDS_PADDING      = 4;     // Zelos default: 6
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

// Mirror of DEFAULT_PYTHON_CODE; steer ±100 + 1 rotation = ~90° pivot.
const DEFAULT_BLOCKLY_XML = `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="flipperevents_whenProgramStarts" x="30" y="30">
        <next>
          <block type="flippermove_move">
            <field name="DIRECTION">forward</field>
            <field name="UNIT">cm</field>
            <value name="VALUE"><shadow type="math_number"><field name="NUM">78</field></shadow></value>
            <next>
              <block type="flippermove_steer">
                <field name="UNIT">rotations</field>
                <field name="STEERING">100</field>
                <value name="VALUE"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
                <next>
                  <block type="flippermove_move">
                    <field name="DIRECTION">forward</field>
                    <field name="UNIT">cm</field>
                    <value name="VALUE"><shadow type="math_number"><field name="NUM">130</field></shadow></value>
                    <next>
                      <block type="flippermove_steer">
                        <field name="UNIT">rotations</field>
                        <field name="STEERING">100</field>
                        <value name="VALUE"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
                        <next>
                          <block type="flippermove_move">
                            <field name="DIRECTION">forward</field>
                            <field name="UNIT">cm</field>
                            <value name="VALUE"><shadow type="math_number"><field name="NUM">60</field></shadow></value>
                            <next>
                              <block type="flippermove_steer">
                                <field name="UNIT">rotations</field>
                                <field name="STEERING">-100</field>
                                <value name="VALUE"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
                                <next>
                                  <block type="flippermove_move">
                                    <field name="DIRECTION">forward</field>
                                    <field name="UNIT">cm</field>
                                    <value name="VALUE"><shadow type="math_number"><field name="NUM">25</field></shadow></value>
                                    <next>
                                      <block type="flipperlight_lightDisplayText">
                                        <field name="TEXT">Done!</field>
                                      </block>
                                    </next>
                                  </block>
                                </next>
                              </block>
                            </next>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </xml>`;

function initBlockly(divId, themeName, initialXml) {
  if (typeof Blockly === 'undefined') return null;

  _registerSteeringField(Blockly);
  _registerPortGridField(Blockly);
  _registerMatrixField(Blockly);
  _registerUltrasonicField(Blockly);
  _registerAngleField(Blockly);
  _registerColorStripField(Blockly);
  Blockly.defineBlocksWithJsonArray(SPIKE_BLOCKS.map(_withEmblem));
  registerGenerators(Blockly);
  _registerCompactRenderer(Blockly);
  _pruneContextMenu(Blockly);

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
    trashcan: false,
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

  _registerSpikeVariablesFlyout(Blockly, workspace);
  _registerSpikeMyBlocksFlyout(Blockly, workspace);

  const xmlText = (typeof initialXml === 'string' && initialXml.trim()) ? initialXml : DEFAULT_BLOCKLY_XML;
  try {
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xmlText), workspace);
  } catch (e) {
    console.error('Blockly initial XML load failed, falling back to default:', e);
    workspace.clear();
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(DEFAULT_BLOCKLY_XML), workspace);
  }

  _attachRepeatCurls(workspace, Blockly);

  return workspace;
}

// Replace Blockly's default VARIABLE flyout (variables_get / variables_set /
// math_change) with SPIKE's data_* opcodes, so .llsp3 round-trips back into
// the official Spike app with the same blocks. Each workspace gets its own
// callback because Blockly stores them per-workspace.
function _registerSpikeVariablesFlyout(Blockly, workspace) {
  workspace.registerButtonCallback('CREATE_SPIKE_VARIABLE', (button) => {
    Blockly.Variables.createVariableButtonHandler(button.getTargetWorkspace());
  });
  workspace.registerToolboxCategoryCallback('VARIABLE', (ws) => {
    const xmlList = [];
    const makeBtn = document.createElement('button');
    makeBtn.setAttribute('text', 'Make a Variable');
    makeBtn.setAttribute('callbackKey', 'CREATE_SPIKE_VARIABLE');
    xmlList.push(makeBtn);

    const variables = ws.getVariablesOfType('').slice().sort((a, b) =>
      Blockly.Names.equals(a.name, b.name) ? 0 : (a.name < b.name ? -1 : 1));

    if (variables.length > 0) {
      // Reporter blocks for each variable — most-recent-first so the variable
      // the user just created shows up at the top.
      const recent = variables.slice().reverse();
      for (const v of recent) {
        const blk = document.createElement('block');
        blk.setAttribute('type', 'data_variable');
        const f = document.createElement('field');
        f.setAttribute('name', 'VARIABLE');
        f.setAttribute('id', v.getId());
        f.setAttribute('variabletype', v.type || '');
        f.textContent = v.name;
        blk.appendChild(f);
        xmlList.push(blk);
      }

      // One setter and one changer, bound to the first available variable.
      const first = variables[0];
      const setter = document.createElement('block');
      setter.setAttribute('type', 'data_setvariableto');
      setter.setAttribute('gap', '20');
      const setF = document.createElement('field');
      setF.setAttribute('name', 'VARIABLE');
      setF.setAttribute('id', first.getId());
      setF.textContent = first.name;
      setter.appendChild(setF);
      const setV = document.createElement('value');
      setV.setAttribute('name', 'VALUE');
      const setShadow = document.createElement('shadow');
      setShadow.setAttribute('type', 'math_number');
      const setFieldNum = document.createElement('field');
      setFieldNum.setAttribute('name', 'NUM');
      setFieldNum.textContent = '0';
      setShadow.appendChild(setFieldNum);
      setV.appendChild(setShadow);
      setter.appendChild(setV);
      xmlList.push(setter);

      const changer = document.createElement('block');
      changer.setAttribute('type', 'data_changevariableby');
      const chgF = document.createElement('field');
      chgF.setAttribute('name', 'VARIABLE');
      chgF.setAttribute('id', first.getId());
      chgF.textContent = first.name;
      changer.appendChild(chgF);
      const chgV = document.createElement('value');
      chgV.setAttribute('name', 'VALUE');
      const chgShadow = document.createElement('shadow');
      chgShadow.setAttribute('type', 'math_number');
      const chgFieldNum = document.createElement('field');
      chgFieldNum.setAttribute('name', 'NUM');
      chgFieldNum.textContent = '1';
      chgShadow.appendChild(chgFieldNum);
      chgV.appendChild(chgShadow);
      changer.appendChild(chgV);
      xmlList.push(changer);
    }
    return xmlList;
  });
}

// Replace Blockly's default PROCEDURE flyout with the SPIKE-style My Blocks
// flow: a single "Make a Block" button at the top, then one call block for
// every myblocks_definition on the workspace, then (when the user's focus is
// inside a definition's body) that definition's arg reporters.
//
// Focus tracking lives on window.MyBlocks.setFocusedDefinitionProcId — the
// initBlockly change listener calls it whenever the selection changes, and
// the flyout reads it lazily when the toolbox category is opened.
function _registerSpikeMyBlocksFlyout(Blockly, workspace) {
  if (typeof window === 'undefined' || !window.MyBlocks) return;
  const MB = window.MyBlocks;

  // Focus state lives module-side so the flyout callback (a closure on this
  // module) and the workspace listener (a closure on initBlockly) can
  // share it.
  if (typeof MB.getFocusedDefinitionProcId !== 'function') {
    let focused = null;
    MB.setFocusedDefinitionProcId = (id) => { focused = id || null; };
    MB.getFocusedDefinitionProcId = () => focused;
  }

  workspace.registerButtonCallback('CREATE_SPIKE_MYBLOCK', (button) => {
    const ws = button && button.getTargetWorkspace ? button.getTargetWorkspace() : workspace;
    if (!MB.openMyBlocksModal) return;
    MB.openMyBlocksModal(Blockly).then((result) => {
      if (!result) return;
      // Use Blockly's JSON deserialization pipeline rather than newBlock +
      // loadExtraState — the latter mutates fields after initSvg, and
      // appendField on an already-initialized block can leave the Zelos
      // drawer with a half-built field (crashes in layoutField_ on a null
      // SVG element). Deserialization runs init + loadExtraState in the
      // right order so the block's first render sees the final field set.
      const metrics = ws.getMetrics ? ws.getMetrics() : null;
      const xOffset = ((metrics && metrics.viewLeft) || 0) + 40;
      const yOffset = ((metrics && metrics.viewTop)  || 0) + 40;
      Blockly.serialization.blocks.append({
        type: 'myblocks_definition',
        extraState: { procId: result.procId, argspec: result.argspec },
        x: xOffset, y: yOffset,
      }, ws);
      // Refresh toolbox so the matching call block appears.
      const tb = ws.getToolbox && ws.getToolbox();
      if (tb && tb.refreshSelection) tb.refreshSelection();
    });
  });

  workspace.registerToolboxCategoryCallback('MY_BLOCKS', (ws) => {
    const xmlList = [];
    const makeBtn = document.createElement('button');
    makeBtn.setAttribute('text', 'Make a Block');
    makeBtn.setAttribute('callbackKey', 'CREATE_SPIKE_MYBLOCK');
    xmlList.push(makeBtn);

    const defs = (ws.getAllBlocks ? ws.getAllBlocks(false) : []).filter(b => b.type === 'myblocks_definition');

    // Body-context arg reporters for the currently focused definition.
    const focusedId = MB.getFocusedDefinitionProcId && MB.getFocusedDefinitionProcId();
    if (focusedId) {
      const focusedDef = defs.find(d => d.procId_ === focusedId);
      if (focusedDef) {
        for (const tok of (focusedDef.argspec_ || [])) {
          if (tok.kind !== 'arg') continue;
          const type = tok.argKind === 'boolean'
            ? 'myblocks_arg_boolean'
            : 'myblocks_arg_string_number';
          const repBlk = document.createElement('block');
          repBlk.setAttribute('type', type);
          // The mutation carries BOTH argid + name. The redundant name+<field>
          // is intentional: domToMutation re-applies the name to the field so
          // child ordering can't leave it blank.
          const mut = document.createElement('mutation');
          mut.setAttribute('argid', tok.argId || '');
          mut.setAttribute('name',  tok.name  || '');
          repBlk.appendChild(mut);
          const f = document.createElement('field');
          f.setAttribute('name', 'VALUE');
          f.textContent = tok.name || '';
          repBlk.appendChild(f);
          xmlList.push(repBlk);
        }
      }
    }

    // Call block per definition, carrying the argspec via <mutation>.
    // Each %s slot gets a math_number shadow with the argspec default so
    // the user can click-and-type a value directly (rather than only
    // accepting a connected reporter). %b slots stay shadowless —
    // booleans have no literal type in Scratch's model.
    for (const def of defs) {
      const blk = document.createElement('block');
      blk.setAttribute('type', 'myblocks_call');
      const mut = document.createElement('mutation');
      mut.setAttribute('procid', def.procId_ || '');
      mut.setAttribute('argspec', JSON.stringify(def.argspec_ || []));
      blk.appendChild(mut);

      let argIdx = 0;
      for (const tok of (def.argspec_ || [])) {
        if (tok.kind !== 'arg') continue;
        if (tok.argKind === 'string_number') {
          const value = document.createElement('value');
          value.setAttribute('name', 'ARG' + argIdx);
          const shadow = document.createElement('shadow');
          shadow.setAttribute('type', 'math_number');
          const f = document.createElement('field');
          f.setAttribute('name', 'NUM');
          f.textContent = (tok.defaultValue !== undefined && tok.defaultValue !== '')
            ? String(tok.defaultValue) : '0';
          shadow.appendChild(f);
          value.appendChild(shadow);
          blk.appendChild(value);
        }
        argIdx++;
      }

      xmlList.push(blk);
    }
    return xmlList;
  });

  // Workspace change listener: tracks selection (for body-context flyout)
  // AND cascade-deletes calls when their definition is removed (matches
  // scratch-blocks' procedure delete behavior so we never leave dangling
  // calls that reference a non-existent function).
  if (workspace.addChangeListener) {
    workspace.addChangeListener((ev) => {
      if (!ev || !ev.type) return;
      const E = Blockly.Events || {};

      // Cascade-delete: a definition went away → wipe its call sites. We
      // get the deleted definition's procId from the saved JSON (oldJson /
      // oldXml) since the block itself no longer exists at event time.
      if (ev.type === E.BLOCK_DELETE || ev.type === 'delete') {
        const blockType = ev.oldJson && ev.oldJson.type;
        if (blockType === 'myblocks_definition') {
          const procId = ev.oldJson.extraState && ev.oldJson.extraState.procId;
          if (procId) {
            // Defer so the delete event finishes first — otherwise Blockly
            // chokes on disposing blocks during its own event dispatch.
            setTimeout(() => {
              const calls = workspace.getAllBlocks(false).filter(
                b => b.type === 'myblocks_call' && b.procId_ === procId);
              for (const c of calls) {
                try { c.dispose(true, true); } catch (_e) {}
              }
            }, 0);
          }
        }
        return;
      }

      if (ev.type !== E.SELECTED) return;
      if (!ev.newElementId) { MB.setFocusedDefinitionProcId(null); return; }
      const ws = workspace;
      const block = ws.getBlockById && ws.getBlockById(ev.newElementId);
      let cur = block;
      while (cur) {
        if (cur.type === 'myblocks_definition') {
          MB.setFocusedDefinitionProcId(cur.procId_ || null);
          return;
        }
        cur = cur.getParent ? cur.getParent() : null;
      }
      MB.setFocusedDefinitionProcId(null);
    });
  }
}

// SPIKE word-block decoration: a small curl glyph at the bottom-right of every
// loop block's C-mouth, mirroring Spike's repeat.svg overlay. Scratch-blocks
// has no built-in hook for "extra decoration on a specific opcode", so we hang
// an <image> child off the block's SVG group and re-position it on every
// workspace event that could change the block's rendered size.
const _LOOP_OPCODES = new Set(['control_repeat', 'control_repeat_until', 'control_forever']);
const _REPEAT_CURL_CLASS = 'spike-repeat-curl';
function _decorateLoopBlock(block) {
  if (!block || !_LOOP_OPCODES.has(block.type)) return;
  const root = block.getSvgRoot && block.getSvgRoot();
  if (!root) return;
  let img = root.querySelector(':scope > image.' + _REPEAT_CURL_CLASS);
  if (!img) {
    const ns = 'http://www.w3.org/2000/svg';
    img = document.createElementNS(ns, 'image');
    img.classList.add(_REPEAT_CURL_CLASS);
    img.setAttribute('width', '24');
    img.setAttribute('height', '24');
    img.setAttribute('href', 'static/icons/RepeatCurl.svg');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', 'static/icons/RepeatCurl.svg');
    img.style.pointerEvents = 'none';
    root.appendChild(img);
  }
  const hw = block.getHeightWidth ? block.getHeightWidth() : null;
  if (hw) {
    img.setAttribute('x', String(Math.max(0, hw.width  - 32)));
    img.setAttribute('y', String(Math.max(0, hw.height - 30)));
  }
}
function _attachRepeatCurls(workspace, Blockly) {
  if (!workspace || !Blockly || !Blockly.Events) return;
  const E = Blockly.Events;
  const watched = new WeakSet();
  function watch(ws) {
    if (!ws || watched.has(ws)) return;
    watched.add(ws);
    const decorate = () => ws.getAllBlocks(false).forEach(_decorateLoopBlock);
    ws.addChangeListener((ev) => {
      if (!ev) return;
      if (ev.type === E.BLOCK_CREATE     ||
          ev.type === E.BLOCK_CHANGE     ||
          ev.type === E.BLOCK_MOVE       ||
          ev.type === E.FINISHED_LOADING ||
          ev.type === E.BLOCK_DRAG) {
        decorate();
      }
    });
    setTimeout(decorate, 0);
  }
  watch(workspace);
  // The flyout has its own workspace — every time a category is opened the
  // blocks are re-rendered there, so we listen on that workspace too. Poll
  // briefly until the flyout is materialized (Blockly creates it lazily).
  const tryFlyout = (attempt) => {
    const flyout = workspace.getFlyout && workspace.getFlyout();
    const flyoutWs = flyout && flyout.getWorkspace && flyout.getWorkspace();
    if (flyoutWs) { watch(flyoutWs); return; }
    if (attempt < 10) setTimeout(() => tryFlyout(attempt + 1), 200);
  };
  tryFlyout(0);
  // Toolbox-category clicks rebuild the flyout's blocks; re-decorate after
  // each click so newly-rendered repeat blocks pick up the curl.
  const host = workspace.getInjectionDiv ? workspace.getInjectionDiv() : null;
  const toolboxRoot = host && host.querySelector('.blocklyToolboxDiv');
  if (toolboxRoot) {
    toolboxRoot.addEventListener('click', () => {
      setTimeout(() => {
        const flyout = workspace.getFlyout && workspace.getFlyout();
        const flyoutWs = flyout && flyout.getWorkspace && flyout.getWorkspace();
        if (flyoutWs) flyoutWs.getAllBlocks(false).forEach(_decorateLoopBlock);
      }, 0);
    });
  }
}

// ── Code generator — prepends run-time state variables ──────────────────────

// Scratch variable names allow characters JavaScript identifiers don't (spaces,
// punctuation, leading digits). Map every var name through this so the same
// reference always produces the same JS identifier, and so two distinct names
// that sanitize to the same value still get hashed apart.
function _sanitizeVarName(name) {
  const raw = String(name == null ? '' : name);
  let s = raw.replace(/[^A-Za-z0-9_$]/g, '_');
  if (!/^[A-Za-z_$]/.test(s)) s = '_' + s;
  return 'v_' + s;
}
if (typeof window !== 'undefined') window._sanitizeVarName = _sanitizeVarName;

// Hat blocks that already emit their own `_hats.push(...)` polling loop, plus
// `flipperevents_whenProgramStarts` which emits the `_mainBody = ...`
// assignment. Anything else at the top level is a raw statement chain that
// would otherwise run inline (sequentially) before _mainBody started — which
// deadlocks programs whose top-level chains include awaits (e.g. a
// control_repeat_until that monitors a sensor in parallel with the main body).
// Those chains get wrapped in `_hats.push(async () => { ... })` so the
// runtime starts them concurrently with _mainBody.
const _SELF_REGISTERING_TOP_TYPES = new Set([
  'flipperevents_whenProgramStarts',
  'flipperevents_whenColor', 'flipperevents_whenPressed', 'flipperevents_whenDistance',
  'flipperevents_whenTilted', 'flipperevents_whenOrientation', 'flipperevents_whenGesture',
  'flipperevents_whenButton', 'flipperevents_whenTimer', 'flipperevents_whenCondition',
  'event_whenbroadcastreceived',
  // My Blocks definitions emit a top-level `async function name(args) {...}`
  // — must not be wrapped in `_hats.push(...)` or the function disappears
  // into a closure that call sites can't reach.
  'myblocks_definition',
]);

function generateBlocklyJS(workspace) {
  if (!workspace || typeof Blockly === 'undefined') return '';
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  if (!js) return '';

  // Walk the top-level blocks ourselves rather than calling
  // `js.workspaceToCode`, so we can wrap non-hat statement chains in
  // parallel runners. Skip orphan reporter blocks (outputConnection != null).
  if (typeof js.init === 'function') js.init(workspace);
  const topBlocks = (workspace.getTopBlocks && workspace.getTopBlocks(true)) || [];
  const parts = [];
  for (const blk of topBlocks) {
    if (blk.outputConnection) continue;
    const code = js.blockToCode(blk);
    if (!code) continue;
    const codeStr = Array.isArray(code) ? code[0] : code;
    if (_SELF_REGISTERING_TOP_TYPES.has(blk.type)) {
      parts.push(codeStr);
    } else {
      parts.push(`_hats.push(async () => {\n${codeStr}});\n`);
    }
  }
  if (typeof js.finish === 'function') {
    const finished = js.finish(parts.join(''));
    if (typeof finished === 'string') parts.length = 0, parts.push(finished);
  }
  // Orphan-call defense: if a myblocks_call survives without its matching
  // myblocks_definition (user deleted the def, or an .llsp3 came in
  // partial), the call's generator still emits `await name(...)` — which
  // would be a ReferenceError at runtime. Synthesize a no-op stub for
  // each orphan proccode so the program still parses + runs.
  const orphanStubs = [];
  if (workspace.getAllBlocks && window.MyBlocks && window.MyBlocks.slugifyName && window.MyBlocks.derivedNameFromArgspec) {
    const all = workspace.getAllBlocks(false);
    const defProcIds = new Set(all.filter(b => b.type === 'myblocks_definition').map(b => b.procId_).filter(Boolean));
    const seenStubs = new Set();
    for (const b of all) {
      if (b.type !== 'myblocks_call') continue;
      if (defProcIds.has(b.procId_)) continue;
      const spec = b.argspec_ || [];
      const fn = window.MyBlocks.slugifyName(window.MyBlocks.derivedNameFromArgspec(spec));
      if (seenStubs.has(fn)) continue;
      seenStubs.add(fn);
      const params = spec.filter(t => t.kind === 'arg')
        .map(t => window.MyBlocks.slugifyName(t.name || 'arg'));
      orphanStubs.push(`async function ${fn}(${params.join(', ')}) { /* orphan — definition was removed */ }\n`);
    }
  }
  const body = orphanStubs.join('') + parts.join('');

  const userVars = (workspace.getAllVariables && workspace.getAllVariables()) || [];
  const userVarDecls = userVars
    .map(v => `var ${_sanitizeVarName(v.name)} = 0;`)
    .join('\n');

  const preamble = [
    `var _moveSpeed     = 50;`,
    `var _motorSpeed    = 75;`,
    `var _movePairL     = 'A';`,
    `var _movePairR     = 'B';`,
    `var _moveRotMM     = ${(Math.PI * 56).toFixed(4)};`,  // default 17.6 cm wheel circumference in mm
    `var _distMoved     = 0;`,
    `var _timerMs       = performance.now();`,
    `var _stopMethod    = '0';`,
    `var _moveAccel     = '3000 3000';`,
    `var _motorStop     = {};`,
    `var _motorAccel    = {};`,
    `var _motorRelOffset= {};`,
    // Event-hat runtime state.
    `var _hats     = [];`,
    `var _mainBody = null;`,
    `var _hatBusy  = {};`,
    `var _hatPrev  = {};`,
    `var _hatFired  = {};`,
    `var _t0       = performance.now();`,
    userVarDecls,
  ].filter(Boolean).join('\n');

  const epilogue = [
    `await (async () => {`,
    `  // Start every hat first so it's polling on the event loop, then run`,
    `  // _mainBody concurrently. Calling an async fn returns a Promise and`,
    `  // begins execution; each hat runs synchronously to its first \`await rAF\``,
    `  // then yields, leaving the event loop free for _mainBody to start.`,
    `  const _hatPromises = _hats.map(h => h());`,
    `  if (_mainBody) {`,
    `    try { await _mainBody(); } finally { window.sim.isRunning = false; }`,
    `  }`,
    `  await Promise.all(_hatPromises);`,
    `})();`,
  ].join('\n');

  return preamble + '\n' + body + '\n' + epilogue + '\n';
}

window.initBlockly         = initBlockly;
window.generateBlocklyJS   = generateBlocklyJS;
window.DEFAULT_BLOCKLY_XML = DEFAULT_BLOCKLY_XML;
