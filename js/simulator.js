'use strict';

// ── roundRect polyfill (Safari < 15.4, older Chrome) ────────────────────────
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const rad = Math.min(typeof r === 'number' ? r : (Array.isArray(r) ? r[0] : 0), w/2, h/2);
    this.beginPath();
    this.moveTo(x + rad, y);
    this.lineTo(x + w - rad, y);
    this.arcTo(x + w, y, x + w, y + rad, rad);
    this.lineTo(x + w, y + h - rad);
    this.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    this.lineTo(x + rad, y + h);
    this.arcTo(x, y + h, x, y + h - rad, rad);
    this.lineTo(x, y + rad);
    this.arcTo(x, y, x + rad, y, rad);
    this.closePath();
    return this;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const FIELD_W_MM  = 2362;
const FIELD_H_MM  = 1143;
// Wheel geometry. The Spike Prime kit ships two common drive wheels and the
// rest of the model (linear speed, deg↔mm conversions, turn timing) scales
// linearly with diameter. Pick ONE assumption — the team's actual robot
// build — and keep it consistent everywhere:
//   - Spike "small" / Technic 56×28 mm (part 32019) → WHEEL_DIA_MM = 56, WHEEL_WIDTH_MM = 28
//   - Spike "big balloon" 88×26 mm (part 49295)    → WHEEL_DIA_MM = 88, WHEEL_WIDTH_MM = 26
// Mirrored in js/blockly_config.js as _WHEEL_CIRC_MM and _MM_PER_MS_AT_100 —
// update both files together. The wheel visual at _drawRobot derives from
// these constants too so swapping just here is sufficient.
const WHEEL_DIA_MM    = 56;
const WHEEL_WIDTH_MM  = 28;
const WHEEL_CIRC_MM   = Math.PI * WHEEL_DIA_MM;
const TRACK_W_MM    = 112;  // center-to-center
const ROBOT_BODY_W  = 160;  // body width without wheels
const ROBOT_BODY_H  = 200;  // body front-to-back
const BUMPER_DEPTH_MM = 10;   // front-to-back
const BUMPER_WIDTH_MM = 30;   // lateral
// Linear speed when leftV/rightV == 1.0. The model treats velocity command
// 1000 deg/sec (the bridge divides cmd.velocity by 1000) as the reference
// "full speed," so this is mm-per-ms at that command:
//   1000 deg/sec × (π × 56 mm / 360 deg) × (1 s / 1000 ms) = π × 56 / 360.
// That puts full-speed linear motion at ~488 mm/s, which is the physically
// honest value for a 56 mm wheel driven by a Spike Prime angular motor (LEGO
// tech specs: no-load 175 RPM Large / 185 RPM Medium ⇒ 513 / 542 mm/s; rated
// 135 RPM ⇒ 396 mm/s — see docs/HARDWARE-SPECS.md).
const MM_PER_MS_100 = Math.PI * WHEEL_DIA_MM / 360;
const DIST_SENSOR_MIN_MM    = 50;    // LEGO tech spec: ultrasonic blind below 50 mm
const DIST_SENSOR_MAX_MM    = 2000;  // LEGO tech spec: range 50–2000 mm ±20 mm
const DIST_SENSOR_OOR_VALUE = 9999;  // wire sentinel; py/spike_bridge.py:351 maps ≥9999 → -1

// ── Port configuration ──────────────────────────────────────────────────────
// Mirror of py/spike_bridge.py _PORT_CONFIG. Customization will replace this
// constant with mutable per-instance state and a config-update worker message.
const PORT_CONFIG = {
  A: { kind: 'motor',           role: 'drive-left'  },
  B: { kind: 'motor',           role: 'drive-right' },
  C: { kind: 'color_sensor' },
  D: { kind: 'distance_sensor' },
  E: { kind: 'force_sensor',    mount: 'front'      },
  F: { kind: 'empty' },
};

// Maps a command type to the port `kind` it requires. Only motor commands
// route through _execCmd; sensor reads are direct getters and validate Python-side.
const PORT_KIND_FOR_CMD = {
  motor_degrees: 'motor',
  motor_time:    'motor',
  motor_run:     'motor',
  motor_stop:    'motor',
};

// ── Color utilities ──────────────────────────────────────────────────────────

const COLOR_MAP = {
  black:   '#1a1a1a',
  red:     '#e74c3c',
  green:   '#2ecc71',
  yellow:  '#f1c40f',
  blue:    '#3498db',
  white:   '#f0f0f0',
  // Aligned with the Python bridge's _COLOR_INT_MAP and color.AZURE constant.
  // Older code used 'cyan' here, which made a Light-Blue tile read as
  // color.UNKNOWN from Python. Audit 2026-05-13 §4.8.
  azure:   '#00bcd4',
  magenta: '#e91e63',
  orange:  '#ff9800',
  none:    null,
};

const COLOR_INT_MAP = {
  none: -1, black: 0, magenta: 1, purple: 2, blue: 3,
  azure: 4, turquoise: 5, green: 6, yellow: 7, orange: 8, red: 9, white: 10,
};

// Centre-button RGB LED palette. Indexed by the `color.*` integer (0–10), with
// 0/BLACK and -1/UNKNOWN both meaning "off". Hex values mirror the swatches in
// the Blockly centre-button color strip (`STRIP_COLORS` in blockly_config.js)
// so the on-robot LED matches what the student picked in the toolbox.
const CENTRE_BTN_HEX = {
  0:  null,        // BLACK / off
  1:  '#ff80c0',   // MAGENTA  (Blockly: "pink")
  2:  '#b066d8',   // PURPLE   (Blockly: "violet")
  3:  '#1d6dd1',   // BLUE
  4:  '#6db3e6',   // AZURE    (Blockly: "light blue")
  5:  '#25b9d8',   // TURQUOISE (Blockly: "cyan")
  6:  '#1a9c4a',   // GREEN
  7:  '#f7c911',   // YELLOW
  8:  '#f08020',   // ORANGE
  9:  '#d12a2a',   // RED
  10: '#ffffff',   // WHITE
};

// 5×5 pixel font for hub.light_matrix.write. Each entry is 25 bits, rows
// top-to-bottom (matches the display index layout: row r, col c → idx r*5+c).
// Audit 2026-05-13 §4.9: before this table, _showText filled every-other
// pixel proportional to text length, so 'A' and 'B' looked identical and
// resembled no glyph at all.
const _GLYPH_FONT = {
  ' ': [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0],
  'A': [0,1,1,1,0, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1],
  'B': [1,1,1,1,0, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,0,1, 1,1,1,1,0],
  'C': [0,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 0,1,1,1,1],
  'D': [1,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,0],
  'E': [1,1,1,1,1, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,1,1,1,1],
  'F': [1,1,1,1,1, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0],
  'G': [0,1,1,1,1, 1,0,0,0,0, 1,0,0,1,1, 1,0,0,0,1, 0,1,1,1,1],
  'H': [1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1],
  'I': [1,1,1,1,1, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 1,1,1,1,1],
  'J': [0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'K': [1,0,0,0,1, 1,0,0,1,0, 1,1,1,0,0, 1,0,0,1,0, 1,0,0,0,1],
  'L': [1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1],
  'M': [1,0,0,0,1, 1,1,0,1,1, 1,0,1,0,1, 1,0,0,0,1, 1,0,0,0,1],
  'N': [1,0,0,0,1, 1,1,0,0,1, 1,0,1,0,1, 1,0,0,1,1, 1,0,0,0,1],
  'O': [0,1,1,1,0, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'P': [1,1,1,1,0, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,0,0, 1,0,0,0,0],
  'Q': [0,1,1,1,0, 1,0,0,0,1, 1,0,1,0,1, 1,0,0,1,0, 0,1,1,0,1],
  'R': [1,1,1,1,0, 1,0,0,0,1, 1,1,1,1,0, 1,0,0,1,0, 1,0,0,0,1],
  'S': [0,1,1,1,1, 1,0,0,0,0, 0,1,1,1,0, 0,0,0,0,1, 1,1,1,1,0],
  'T': [1,1,1,1,1, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0],
  'U': [1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,1,1,0],
  'V': [1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0],
  'W': [1,0,0,0,1, 1,0,0,0,1, 1,0,1,0,1, 1,1,0,1,1, 1,0,0,0,1],
  'X': [1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0, 0,1,0,1,0, 1,0,0,0,1],
  'Y': [1,0,0,0,1, 0,1,0,1,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0],
  'Z': [1,1,1,1,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 1,1,1,1,1],
  '0': [0,1,1,1,0, 1,0,0,0,1, 1,0,1,0,1, 1,0,0,0,1, 0,1,1,1,0],
  '1': [0,0,1,0,0, 0,1,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,1,1,0],
  '2': [0,1,1,1,0, 1,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 1,1,1,1,1],
  '3': [1,1,1,1,0, 0,0,0,0,1, 0,1,1,1,0, 0,0,0,0,1, 1,1,1,1,0],
  '4': [0,0,0,1,0, 0,0,1,1,0, 0,1,0,1,0, 1,1,1,1,1, 0,0,0,1,0],
  '5': [1,1,1,1,1, 1,0,0,0,0, 1,1,1,1,0, 0,0,0,0,1, 1,1,1,1,0],
  '6': [0,1,1,1,0, 1,0,0,0,0, 1,1,1,1,0, 1,0,0,0,1, 0,1,1,1,0],
  '7': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,0,1,0,0],
  '8': [0,1,1,1,0, 1,0,0,0,1, 0,1,1,1,0, 1,0,0,0,1, 0,1,1,1,0],
  '9': [0,1,1,1,0, 1,0,0,0,1, 0,1,1,1,1, 0,0,0,0,1, 0,1,1,1,0],
};

// ── FLL Mat field elements ───────────────────────────────────────────────────

// All `y` values are math y-up (origin bottom-left). For rectangles, (x, y) is
// the bottom-left corner. Conversions from the old canvas-top-left values:
//   rect:   newY = FIELD_H_MM - oldY - h
//   line:   newY = FIELD_H_MM - oldY
//   circle: newY = FIELD_H_MM - oldY
const FIELD_OBJECTS = [
  // Home area (was canvas y=780, h=300 ⇒ math y = 1143-780-300 = 63)
  { type: 'rect', x: 80, y: 63, w: 600, h: 300, fill: 'rgba(100,160,255,0.18)', stroke: '#4488ff', lw: 3, label: 'HOME' },
  // Mission areas — sensorColor defines what the color sensor reads inside each zone
  // (was canvas y=100, h=200 ⇒ math y = 1143-100-200 = 843)
  { type: 'rect', x: 900,  y: 843, w: 200, h: 200, fill: 'rgba(255,200,100,0.2)', stroke: '#f0a830', lw: 2, sensorColor: 'yellow' },
  { type: 'rect', x: 1600, y: 843, w: 200, h: 200, fill: 'rgba(100,220,150,0.2)', stroke: '#30c060', lw: 2, sensorColor: 'green'  },
  // (was canvas y=700, h=200 ⇒ math y = 1143-700-200 = 243)
  { type: 'rect', x: 1900, y: 243, w: 200, h: 200, fill: 'rgba(220,100,100,0.2)', stroke: '#cc4444', lw: 2, sensorColor: 'red'    },
  // Colored lines on the mat (was canvas y=680 ⇒ math y = 1143-680 = 463)
  { type: 'line', x1: 0,    y1: 463, x2: 2362, y2: 463, stroke: '#222', lw: 4, sensorColor: 'black' },
  // Centre circle (was canvas y=571 ⇒ math y = 1143-571 = 572)
  { type: 'circle', x: 1181, y: 572, r: 80, fill: 'rgba(200,200,200,0.2)', stroke: '#888', lw: 2 },
  // Launch line (was canvas y=1000 ⇒ math y = 1143-1000 = 143)
  { type: 'line', x1: 0,    y1: 143, x2: 680, y2: 143, stroke: '#222', lw: 3, sensorColor: 'black' },
];

// ── Mission obstacles ────────────────────────────────────────────────────────
// Dynamic bodies in the Box2D world. The robot pushes them on contact.
// `x, y` are spawn coordinates (mm); `w, h` are footprint (mm).

// `(x, y)` is the obstacle CENTER (passed to addObstacleBox → Box2D body
// position, which is always center-of-mass). Spawn coordinates picked to
// centre each obstacle on the matching coloured mission zone in FIELD_OBJECTS:
// '1' on the green sensor zone (centre math y = 843+100 = 943),
// '2' on the red sensor zone   (centre math y = 243+100 = 343).
//   was canvas y=200 ⇒ math y = 1143-200 = 943
//   was canvas y=800 ⇒ math y = 1143-800 = 343
const OBSTACLES = [
  { x: 1700, y: 943, w: 100, h: 100, fill: '#9b59b6', stroke: '#5e2c79', label: '1' },
  { x: 2000, y: 343, w: 120, h: 120, fill: '#e67e22', stroke: '#a04d10', label: '2' },
];

// ── Robot state ──────────────────────────────────────────────────────────────

function makeRobotState() {
  return {
    x: 350,          // mm from left edge
    y: 163,          // mm from bottom edge (math y-up)
    heading: 90,     // degrees: 0=east, 90=north, 180=west, 270=south
    motors: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    // Per-port commanded wheel velocity (deg/sec, signed). Written by
    // _animateTank / _animateSingleMotor at motion start, cleared at end.
    motors_velocity: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    // Hub-button held duration in ms. 0 = not held. Per LEGO docs,
    // hub.button.pressed(button) returns this value. The UI populates these
    // on pointerdown/up; tests can seed them directly.
    buttons: { LEFT: 0, RIGHT: 0 },
    sensors: {
      colorValue: 'none',
      // 9999 = OOR sentinel, doubles as "no reading yet" pre-physics. The
      // panel renders ≥9999 as "—" so users don't see a stale numeric default.
      // _initPhysics and reset() trigger a real read once physics is ready.
      distanceMM: DIST_SENSOR_OOR_VALUE,
      distanceHit:    null,
      distanceOrigin: null,
      forceN:         0,
    },
    display: Array(25).fill(0), // 5×5 matrix brightness
    // hub.light.color(POWER, …) — int from the `color` module (0..10), 0 = off.
    centreLight: 0,
    // hub.light_matrix.set_orientation(top) — 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT.
    // Pure render-time transform applied in _drawRobot; robot.display stays
    // in the unrotated frame so successive set_orientation calls re-rotate
    // from the original bitmap rather than compounding.
    orientation: 0,
  };
}

// ── Simulator class ──────────────────────────────────────────────────────────

class RobotSimulator {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');

    this.robot     = makeRobotState();
    this.trail     = [{ x: this.robot.x, y: this.robot.y }];
    this.isRunning = false;
    this.speedMult = 1.0;
    this.units     = 'cm';   // 'cm' | 'mm' | 'in'; main.js calls setUnits() with stored value on load
    this.pairMap   = {};  // pair_id → { left, right }
    this._portConfig = PORT_CONFIG;

    this._stopRequested  = false;
    this._yawZeroHeading_deg = this.robot.heading;

    // In-flight motion descriptor + abort flag. _animateTank's loop checks
    // _motionAborted each iteration and breaks; _execCmd 'stop' / 'motor_stop'
    // flip the flag when their pair_id / port matches _activeMotion.
    // pair: pair_id of an active pair motion (else null); ports: motor letters
    // this motion is driving (a pair's left+right, or a single motor's port).
    // _motionPromise: settles when the current motion finishes. Blockly's
    // _motorStopAndAwait / _pairStopAndAwait await it so the program waits
    // for actual termination before running the next block.
    this._activeMotion  = null;
    this._motionAborted = false;
    this._motionPromise = null;
    // Monotonic counter — every _runMotion entry takes a fresh seq. When
    // many fire-and-forget callers stack up on the same _motionPromise, the
    // highest-seq one wins (latest-supersedes-prior, matching LEGO "start"
    // semantics); the rest bail after their preempt-await resolves.
    this._motionSeq = 0;

    // Obstacle-contact subscription registry. Missions engine subscribes via
    // onObstacleContact(); _dispatchObstacleContact() is the call site wired
    // from the Box2D BeginContact listener (see _initPhysics / TODO below).
    this._obstacleContactSubs = new Set();

    // Force-sensor pipeline state. emaN is the smoothed physics force in Newtons;
    // manualStartMs is the timestamp the user pressed the Hub-panel button (null
    // = released); the public combined value lives on robot.sensors.forceN.
    this._emaN          = 0;
    this._manualStartMs = null;
    this._FORCE_ALPHA   = 0.4;
    this._FORCE_DECAY   = 0.5;
    this._FORCE_RAMP_MS = 1000;
    this._FORCE_MAX_N   = 10;

    // Box2D physics — initialised asynchronously. Spike commands and reset()
    // both await `_physicsReady` before touching the world.
    this.physics      = null;
    this.robotBody    = null;
    this._obstacles   = [];
    this._physicsReady = this._initPhysics();

    this._scale = 1;
    this._offX  = 0;
    this._offY  = 0;

    // Trail is rendered into its own offscreen canvas and blitted each frame,
    // so we never re-stroke the full polyline. _trailArc is cumulative pixel
    // arc length, used as lineDashOffset to keep dash pattern continuous
    // across appended segments.
    this._trailCanvas = document.createElement('canvas');
    this._trailCtx    = this._trailCanvas.getContext('2d');
    this._trailArc    = 0;

    this._dirty = true;

    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Observe the canvas wrap directly so any layout change reflows the
    // canvas — console expand/collapse, hub-strip changes, resize-handle
    // drags between the editor and right panel. Without this, the canvas
    // only re-fit on window resize and stale margins caused the canvas to
    // jump on the next document mouseup.
    if (typeof ResizeObserver !== 'undefined') {
      this._wrapObserver = new ResizeObserver(() => this._resize());
      this._wrapObserver.observe(this.canvas.parentElement);
    }

    this._hoverEl = document.getElementById('canvas-hover');
    if (this._hoverEl) {
      this.canvas.addEventListener('mousemove', e => this._handleHover(e));
      this.canvas.addEventListener('mouseleave', () => { this._hoverEl.hidden = true; });
    }

    this._dragPointerId = null;
    this.canvas.addEventListener('pointerdown', e => this._handleDragStart(e));
    this.canvas.addEventListener('pointermove', e => this._handleDragMove(e));
    this.canvas.addEventListener('pointerup',   e => this._handleDragEnd(e));
    this.canvas.addEventListener('pointercancel', e => this._handleDragEnd(e));

    this._raf = null;
    this._drawLoop();
  }

  // ── Physics init ───────────────────────────────────────────────────────────

  async _initPhysics() {
    let World2D;
    try {
      ({ World2D } = await import('./world_2d.js'));
    } catch (err) {
      // Node's test-runner vm.createContext doesn't wire dynamic import; the
      // browser does. Pure-function tests don't need physics, so swallow.
      return;
    }
    this.physics = new World2D();
    await this.physics.init();

    this.physics.addWalls(FIELD_W_MM, FIELD_H_MM);

    // Robot collider in body-local frame: hx along forward (X-local) = half of
    // body length (front-to-back); hy along lateral (Y-local) = half of width.
    this.robotBody = this.physics.addRobot(
      ROBOT_BODY_H / 2,
      ROBOT_BODY_W / 2,
      { x: this.robot.x, y: this.robot.y },
      this.robot.heading * Math.PI / 180,
    );

    // Front bumper for the force sensor on port C. Welded to the robot body in
    // body-local frame: forward edge of the chassis is at +ROBOT_BODY_H/2 along
    // body-local +X; bumper centre sits BUMPER_DEPTH_MM/2 ahead of that, so the
    // bumper occupies [chassis-front, chassis-front + BUMPER_DEPTH_MM]. Keyed
    // per-port so the listener can disambiguate when more sensors land later.
    this.physics.addBumper(
      this.robotBody,
      BUMPER_DEPTH_MM / 2,
      BUMPER_WIDTH_MM / 2,
      ROBOT_BODY_H / 2 + BUMPER_DEPTH_MM / 2,
      0,
      { kind: 'force_sensor', port: 'C' },
    );

    this._obstacles = OBSTACLES.map(cfg => ({
      cfg,
      body: this.physics.addObstacleBox(cfg.w / 2, cfg.h / 2, { x: cfg.x, y: cfg.y }),
    }));

    // Establish a real distance reading before the first paint so the panel
    // and overlay don't show the OOR placeholder once physics is up.
    this._updateDistanceSensor();

    this._dirty = true;
  }

  // ── Resize ─────────────────────────────────────────────────────────────────

  _resize() {
    const wrap = this.canvas.parentElement;
    // Respect any CSS padding on .canvas-wrap (clientWidth/Height include it,
    // but flex children are placed inside the content box). Subtracting the
    // padding here keeps the canvas inside the visible breathing-room gutter
    // regardless of wrap size. The extra -2 leaves room for the 1px border
    // declared on #robot-canvas via box-shadow.
    // getComputedStyle is browser-only; the Node test harness provides a
    // stub document without it, so fall back to zero padding there.
    let padX = 0, padY = 0;
    if (typeof getComputedStyle === 'function') {
      const cs = getComputedStyle(wrap);
      padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      padY = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
    }
    const W = wrap.clientWidth  - padX - 2;
    const H = wrap.clientHeight - padY - 2;

    const scaleW = W / FIELD_W_MM;
    const scaleH = H / FIELD_H_MM;
    this._scale = Math.min(scaleW, scaleH);

    const fw = FIELD_W_MM * this._scale;
    const fh = FIELD_H_MM * this._scale;

    this.canvas.width  = fw;
    this.canvas.height = fh;
    // Flex centering on .canvas-wrap (align-items: center; justify-content:
    // center) positions the canvas symmetrically; no explicit margin needed.
    // The hover overlay reads canvas position via getBoundingClientRect, so
    // it tracks the centered canvas without needing _offX/_offY here.

    // Trail canvas tracks main canvas pixel size; re-render at new scale.
    this._trailCanvas.width  = fw;
    this._trailCanvas.height = fh;
    this._redrawTrailCanvas();

    this._dirty = true;
  }

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  px(mm) { return mm * this._scale; }

  // ── Drawing loop ────────────────────────────────────────────────────────────

  _drawLoop() {
    if (!this.isRunning) this._idleStepForceSensor();
    // Manual-press ramp + EMA bleed mutate forceN; mark dirty so the panel /
    // canvas redraw picks the change up. _animateTank already marks _dirty
    // when it's running, so this is a no-op contribution while a command runs.
    if (this._manualStartMs !== null || this._emaN > 0.001) {
      this._dirty = true;
    }
    if (this._dirty) {
      this._draw();
      this._dirty = false;
    }
    // Drive mission engine ticks at the draw-loop rate (~60 Hz).
    if (window.missionApp && window.missionApp.mode === 'play' &&
        window.missionApp.engine.startTimeMs != null) {
      const snap = this.getStateSnapshot();
      window.missionApp.engine.tick(snap);
      window.missionApp.ui.updateProgress(window.missionApp.engine);
    }
    this._raf = requestAnimationFrame(() => this._drawLoop());
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this._scale;

    ctx.clearRect(0, 0, W, H);
    this._drawField(ctx, W, H, s);
    this._drawRuler(ctx, s);
    this._drawTrail(ctx);
    this._drawObstacles(ctx, s);
    this._drawRobot(ctx, s);
    this._drawDistanceSensorRay(ctx, s);
    this._updateSensorPanel();
  }

  _drawObstacles(ctx, s) {
    if (!this.physics || !this._obstacles.length) return;
    // In editor mode, the SVG overlay shows the AUTHORED obstacles; suppress
    // the simulator's default ones so authors see a fresh canvas.
    if (typeof document !== 'undefined' &&
        document.body && document.body.dataset && document.body.dataset.mode === 'editor') {
      return;
    }
    for (const o of this._obstacles) {
      const pose = this.physics.readPose(o.body);
      ctx.save();
      // pose.{x, y, angle} are math y-up. Canvas y = FIELD_H_MM - pose.y.
      // Math heading is CCW-positive; canvas ctx.rotate is visually CW; negate.
      ctx.translate(pose.x * s, (FIELD_H_MM - pose.y) * s);
      ctx.rotate(-pose.angle);

      ctx.shadowColor   = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur    = 6 * s;
      ctx.shadowOffsetY = 3 * s;

      ctx.fillStyle   = o.cfg.fill;
      ctx.strokeStyle = o.cfg.stroke;
      ctx.lineWidth   = 2 * s;
      ctx.beginPath();
      ctx.roundRect(-o.cfg.w / 2 * s, -o.cfg.h / 2 * s, o.cfg.w * s, o.cfg.h * s, 6 * s);
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      if (o.cfg.label) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = `bold ${Math.round(o.cfg.h * 0.45 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(o.cfg.label, 0, 0);
      }

      ctx.restore();
    }
  }

  _drawField(ctx, W, H, s) {
    // Background
    ctx.fillStyle = '#f0e8d0';
    ctx.fillRect(0, 0, W, H);

    // Grid (every 100mm = 10cm)
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= FIELD_W_MM; x += 100) {
      ctx.beginPath(); ctx.moveTo(x*s, 0); ctx.lineTo(x*s, H); ctx.stroke();
    }
    for (let y = 0; y <= FIELD_H_MM; y += 100) {
      ctx.beginPath(); ctx.moveTo(0, y*s); ctx.lineTo(W, y*s); ctx.stroke();
    }

    // Field objects. FIELD_OBJECTS uses math y-up; convert to canvas y here.
    // Rectangles: math (x, y) is bottom-left ⇒ canvas top-left = (x, FIELD_H_MM - y - h).
    // Lines / circles: math y ⇒ canvas y = FIELD_H_MM - y.
    const _inEditorMode = typeof document !== 'undefined' &&
      document.body && document.body.dataset && document.body.dataset.mode === 'editor';
    for (const obj of FIELD_OBJECTS) {
      // In editor mode, skip ALL FIELD_OBJECTS — the SVG overlay paints
      // authored elements on a fresh mat. The ruler component along the edges
      // still renders independently for measurement reference.
      if (_inEditorMode) continue;
      ctx.save();
      if (obj.type === 'rect') {
        const canvasY = (FIELD_H_MM - obj.y - obj.h) * s;
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.roundRect(obj.x*s, canvasY, obj.w*s, obj.h*s, 4*s);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
        if (obj.label) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.font = `bold ${11*s}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          // Label centre: x is unchanged; canvas-y centre = (FIELD_H_MM - y - h/2) * s.
          ctx.fillText(obj.label, (obj.x + obj.w/2)*s, (FIELD_H_MM - obj.y - obj.h/2)*s);
        }
      } else if (obj.type === 'line') {
        const canvasY1 = (FIELD_H_MM - obj.y1) * s;
        const canvasY2 = (FIELD_H_MM - obj.y2) * s;
        ctx.strokeStyle = obj.stroke;
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.moveTo(obj.x1*s, canvasY1);
        ctx.lineTo(obj.x2*s, canvasY2);
        ctx.stroke();
      } else if (obj.type === 'circle') {
        const canvasY = (FIELD_H_MM - obj.y) * s;
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.arc(obj.x*s, canvasY, obj.r*s, 0, Math.PI*2);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
      }
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, W, H);
  }

  // Ruler. Math y-up convention:
  //   • Y-axis ticks at the left edge, labels read 0 at bottom up to ~1100 at top.
  //   • X-axis ticks and labels at the BOTTOM edge (so both axes meet at the
  //     bottom-left origin — full math-convention symmetry).
  //   • Origin marker `0,0 mm` in the bottom-left corner.
  // For each math-y tick, canvas y = (FIELD_H_MM - mm) * s.
  _drawRuler(ctx, s) {
    const ruler = window.ruler;
    const { major: majorPitch, minor: minorPitch } = ruler.tickPitchFor(this.units);
    const xTicks = ruler.tickPositions(FIELD_W_MM, majorPitch, minorPitch);
    const yTicks = ruler.tickPositions(FIELD_H_MM, majorPitch, minorPitch);
    const H = FIELD_H_MM * s;

    ctx.save();
    ctx.lineWidth = 1;

    // Bottom edge X-axis — minors first, then majors paint over any overlap.
    ctx.strokeStyle = '#555';
    for (const mm of xTicks.minor) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, H);
      ctx.lineTo(px, H - 5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of xTicks.major) {
      const px = mm * s;
      ctx.beginPath();
      ctx.moveTo(px, H);
      ctx.lineTo(px, H - 9);
      ctx.stroke();
    }

    // Left edge Y-axis. Math-y mm ⇒ canvas y = (FIELD_H_MM - mm) * s.
    ctx.strokeStyle = '#555';
    for (const mm of yTicks.minor) {
      const py = (FIELD_H_MM - mm) * s;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(5, py);
      ctx.stroke();
    }
    ctx.strokeStyle = '#333';
    for (const mm of yTicks.major) {
      const py = (FIELD_H_MM - mm) * s;
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(9, py);
      ctx.stroke();
    }

    // Major-tick labels. Skip 0 (covered by the origin marker below).
    ctx.font = '9px ui-monospace, monospace';
    ctx.textBaseline = 'middle';

    // Bottom labels (centered on each major tick, ~11 px above the edge)
    ctx.textAlign = 'center';
    for (const mm of xTicks.major) {
      if (mm === 0) continue;
      const px = mm * s;
      const text = ruler.formatPosition(mm, this.units);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(px - tw / 2 - 2, H - 17, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, px, H - 11);
    }

    // Left labels (~11 px right of the edge, vertically centered on each tick)
    ctx.textAlign = 'left';
    for (const mm of yTicks.major) {
      if (mm === 0) continue;
      const py = (FIELD_H_MM - mm) * s;
      const text = ruler.formatPosition(mm, this.units);
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(240,232,208,0.85)';
      ctx.fillRect(9, py - 6, tw + 4, 12);
      ctx.fillStyle = '#333';
      ctx.fillText(text, 11, py);
    }

    // Origin marker — bottom-left in math convention.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const originText = `0,0 ${this.units}`;
    const otw = ctx.measureText(originText).width;
    ctx.fillStyle = 'rgba(240,232,208,0.85)';
    ctx.fillRect(4, H - 15, otw + 4, 11);
    ctx.fillStyle = '#333';
    ctx.fillText(originText, 6, H - 5);

    ctx.restore();
  }

  _drawTrail(ctx) {
    if (this.trail.length < 2) return;
    ctx.drawImage(this._trailCanvas, 0, 0);
  }

  _trailStrokeStyle(tctx, s) {
    tctx.strokeStyle = 'rgba(124,106,247,0.45)';
    tctx.lineWidth = 2.5 * s;
    tctx.lineCap = 'round';
    tctx.lineJoin = 'round';
    tctx.setLineDash([4*s, 4*s]);
  }

  // Re-render the entire trail polyline into the offscreen canvas. Called on
  // resize (scale changed) and reset (clear). Keeps _trailArc in sync.
  _redrawTrailCanvas() {
    const tctx = this._trailCtx;
    const s = this._scale;
    tctx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);
    this._trailArc = 0;
    if (this.trail.length < 2) return;
    tctx.save();
    this._trailStrokeStyle(tctx, s);
    tctx.beginPath();
    // trail.{x,y} are math; canvas y = FIELD_H_MM - y.
    tctx.moveTo(this.trail[0].x * s, (FIELD_H_MM - this.trail[0].y) * s);
    for (let i = 1; i < this.trail.length; i++) {
      tctx.lineTo(this.trail[i].x * s, (FIELD_H_MM - this.trail[i].y) * s);
      const dx = (this.trail[i].x - this.trail[i-1].x) * s;
      const dy = (this.trail[i].y - this.trail[i-1].y) * s;
      this._trailArc += Math.hypot(dx, dy);
    }
    tctx.stroke();
    tctx.restore();
  }

  // Append a single segment from (prevX,prevY) to (x,y) (mm coords). Uses
  // lineDashOffset = -arcSoFar so the dash pattern stays continuous across
  // segment boundaries (matches the polyline rendering in _redrawTrailCanvas).
  _appendTrailSegment(prevX, prevY, x, y) {
    const tctx = this._trailCtx;
    const s = this._scale;
    tctx.save();
    this._trailStrokeStyle(tctx, s);
    tctx.lineDashOffset = -this._trailArc;
    tctx.beginPath();
    // (prevX, prevY) and (x, y) are math; canvas y = FIELD_H_MM - y.
    tctx.moveTo(prevX * s, (FIELD_H_MM - prevY) * s);
    tctx.lineTo(x * s, (FIELD_H_MM - y) * s);
    tctx.stroke();
    tctx.restore();
    const dx = (x - prevX) * s;
    const dy = (y - prevY) * s;
    this._trailArc += Math.hypot(dx, dy);
  }

  _drawRobot(ctx, s) {
    const r = this.robot;
    ctx.save();
    // r.y is math y-up; canvas y = FIELD_H_MM - r.y.
    ctx.translate(r.x * s, (FIELD_H_MM - r.y) * s);
    // Math heading: 0=east, 90=north. Robot is drawn with forward = local -Y.
    // ctx.rotate is visually CW (angle increases visually CW), but math heading
    // is CCW (angle increases CCW), so we negate: rotation = 90 - heading.
    // heading=90 (north) ⇒ rotation=0 ⇒ front points canvas-up (north). ✓
    // heading=0  (east)  ⇒ rotation=90° CW ⇒ front points canvas-right (east). ✓
    ctx.rotate((90 - r.heading) * Math.PI / 180);

    const bw = ROBOT_BODY_W * s;
    const bh = ROBOT_BODY_H * s;
    const ww = WHEEL_WIDTH_MM * s;  // wheel width
    const wh = WHEEL_DIA_MM   * s;  // wheel diameter
    const wInset = 12 * s;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur  = 8 * s;
    ctx.shadowOffsetY = 4 * s;

    // Left wheel
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.roundRect(-bw/2 - ww + wInset, -wh/2, ww, wh, 4*s);
    ctx.fill();

    // Right wheel
    ctx.beginPath();
    ctx.roundRect(bw/2 - wInset, -wh/2, ww, wh, 4*s);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur  = 0;
    ctx.shadowOffsetY = 0;

    // Body chassis
    ctx.fillStyle = '#d8d8e8';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.roundRect(-bw/2, -bh/2, bw, bh, 10*s);
    ctx.fill();
    ctx.stroke();

    // Hub brick. Spike Prime Technic Large Hub physical spec is L88 × W56 ×
    // H32 mm (LEGO techspecs_techniclargehub.pdf); the on-canvas rendering
    // intentionally oversizes the brick so the 5×5 LED matrix reads at the
    // zoom levels students normally use. Collision/physics still go through
    // ROBOT_BODY_W/H — these constants are visual only.
    const hw = 80 * s;
    const hh = 120 * s;
    ctx.fillStyle = '#a8a8c0';
    ctx.strokeStyle = '#7070a0';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.roundRect(-hw/2, -hh/2, hw, hh, 7*s);
    ctx.fill();
    ctx.stroke();

    // Centre power button (RGB LED). Drawn on the chassis behind the hub
    // brick — the light-grey strip between the hub back edge and the chassis
    // back edge. Body-local +Y is toward the back of the robot (`ctx.rotate`
    // uses heading + 90°, so +Y maps to canvas-down when heading=north).
    // The chassis spans -bh/2..+bh/2 and the hub brick -hh/2..+hh/2, so
    // positioning at (hh/2 + bh/2)/2 places the LED midway in that strip.
    {
      const btnR  = 11 * s;
      const btnY  = (hh + bh) / 4;
      const hex   = CENTRE_BTN_HEX[r.centreLight] || null;
      // Unlit state mirrors the real Spike hub: a translucent off-white
      // plastic button with the LED dark behind it. Lit state takes the
      // palette hex with a matching glow.
      ctx.fillStyle   = hex || '#f4f4f4';
      ctx.strokeStyle = '#7a7a8a';
      ctx.lineWidth   = 1 * s;
      if (hex) {
        ctx.shadowColor   = hex;
        ctx.shadowBlur    = 10 * s;
        ctx.shadowOffsetY = 0;
      }
      ctx.beginPath();
      ctx.arc(0, btnY, btnR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur  = 0;
    }

    // LED matrix (5×5). The visual (row, col) maps back to a source cell in
    // robot.display via the current orientation, so the raw display bitmap
    // never gets rewritten — successive set_orientation calls re-rotate
    // from the original pattern, matching LEGO firmware semantics.
    //   UP    (0): src = (row, col)        — identity.
    //   RIGHT (1): src = (4-col, row)      — 90° CW.
    //   DOWN  (2): src = (4-row, 4-col)    — 180°.
    //   LEFT  (3): src = (col, 4-row)      — 90° CCW.
    const dotR   = 2.5 * s;
    const dotGap = 14 * s;
    const ori = r.orientation | 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        let srcRow, srcCol;
        switch (ori) {
          case 1:  srcRow = 4 - col; srcCol = row;     break;
          case 2:  srcRow = 4 - row; srcCol = 4 - col; break;
          case 3:  srcRow = col;     srcCol = 4 - row; break;
          default: srcRow = row;     srcCol = col;     break;
        }
        const bri = r.display[srcRow * 5 + srcCol];
        const mx = (col - 2) * dotGap;
        const my = (row - 2) * dotGap;
        ctx.fillStyle = bri > 0
          ? `rgba(255,230,60,${0.2 + 0.8 * bri / 100})`
          : 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(mx, my, dotR, 0, Math.PI*2);
        ctx.fill();
      }
    }

    // Force-sensor bumper (port C). Drawn forward of the chassis edge with a
    // colour ramp tied to robot.sensors.forceN. Uses the same drawing transform
    // as the chassis (+90° offset / heading), so body-local +X is "up" on screen.
    {
      const f = this.robot.sensors.forceN || 0;
      const pct = Math.max(0, Math.min(1, f / 10));
      // idle: chassis-grey; pressed: amber; hard: red. Linear interp through
      // the two stops, mirroring the panel widget colour logic.
      const lerp = (a, b, t) => a + (b - a) * t;
      const idle  = [160, 160, 176];   // #a0a0b0
      const amber = [240, 168,  48];
      const red   = [231,  76,  60];
      let r, g, b;
      if (pct < 0.7) {
        const t = pct / 0.7;
        r = lerp(idle[0],  amber[0], t);
        g = lerp(idle[1],  amber[1], t);
        b = lerp(idle[2],  amber[2], t);
      } else {
        const t = (pct - 0.7) / 0.3;
        r = lerp(amber[0], red[0], t);
        g = lerp(amber[1], red[1], t);
        b = lerp(amber[2], red[2], t);
      }
      ctx.fillStyle = `rgb(${r|0}, ${g|0}, ${b|0})`;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1 * s;
      if (f >= 7) {
        ctx.shadowColor   = 'rgba(231,76,60,0.8)';
        ctx.shadowBlur    = 8 * s;
        ctx.shadowOffsetY = 0;
      }
      // The chassis is drawn with body-local +Y = "down" on screen (the
      // ctx.rotate uses heading + 90°). Body-local +X (forward) maps to screen
      // -Y. So the bumper sits at y = -(bh/2 + bumperDepth/2).
      const bumperWpx = 30 * s;
      const bumperDpx = 10 * s;
      ctx.beginPath();
      ctx.roundRect(-bumperWpx/2, -bh/2 - bumperDpx, bumperWpx, bumperDpx, 2*s);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Front indicator (red triangle pointing "forward")
    ctx.fillStyle = '#ff4455';
    ctx.beginPath();
    ctx.moveTo(0,  -bh/2 - 8*s);
    ctx.lineTo(-10*s, -bh/2 + 10*s);
    ctx.lineTo( 10*s, -bh/2 + 10*s);
    ctx.closePath();
    ctx.fill();

    // Color sensor dot (front of body, under the distance sensor) — the world
    // pickup point _sensorPosition returns is 88 mm forward of centre, which
    // body-local maps to y = -bh/2 + 12 (matches _distanceSensorMount).
    const cs = r.sensors;
    const csColor = COLOR_MAP[cs.colorValue] || '#555';
    ctx.fillStyle = csColor || '#555';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1*s;
    ctx.beginPath();
    ctx.arc(0, -bh/2 + 12*s, 6*s, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Distance sensor dot (front of body), drawn on top so the smaller teal
    // disk reads as the ultrasonic eye sitting above the colour-sensing patch.
    ctx.fillStyle = '#56d4c0';
    ctx.beginPath();
    ctx.arc(0, -bh/2 + 12*s, 4*s, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  _drawDistanceSensorRay(ctx, s) {
    const sens = this.robot.sensors;
    if (!sens.distanceOrigin) return;
    const o = sens.distanceOrigin;
    const inRange = sens.distanceMM < DIST_SENSOR_OOR_VALUE;

    let endX, endY;
    if (inRange) {
      endX = sens.distanceHit.x;
      endY = sens.distanceHit.y;
    } else {
      const a = this.robot.heading * Math.PI / 180;
      endX = o.x + Math.cos(a) * DIST_SENSOR_MAX_MM;
      endY = o.y + Math.sin(a) * DIST_SENSOR_MAX_MM;
    }

    // Math y-up → canvas y-down at the rendering boundary.
    const cy = (mathY) => (FIELD_H_MM - mathY) * s;

    ctx.save();
    ctx.strokeStyle = inRange ? 'rgba(86,212,192,0.85)' : 'rgba(86,212,192,0.18)';
    ctx.lineWidth   = 1.5 * s;
    ctx.setLineDash(inRange ? [] : [4 * s, 4 * s]);
    ctx.beginPath();
    ctx.moveTo(o.x * s,  cy(o.y));
    ctx.lineTo(endX * s, cy(endY));
    ctx.stroke();

    if (inRange) {
      ctx.fillStyle = 'rgba(86,212,192,0.95)';
      ctx.beginPath();
      ctx.arc(endX * s, cy(endY), 3 * s, 0, Math.PI * 2);
      ctx.fill();

      // Mid-ray label. Offset and font are in canvas pixels (CSS px) with
      // a floor — at default zoom the mm-scale s≈0.23, so a pure mm-space
      // sizing would give ~3 px text. We want the label readable at any
      // zoom level, so the floor wins below ~s=1.
      const cxPx = ((o.x + endX) / 2) * s;
      const cyPx = cy((o.y + endY) / 2);
      const a    = this.robot.heading * Math.PI / 180;
      // Canvas-left perpendicular = (-sin(a), -cos(a)) — accounts for y-flip
      // so the label always sits on the left side of the heading direction.
      const offsetPx = Math.max(20, 18 * s);
      const labelX   = cxPx + (-Math.sin(a)) * offsetPx;
      const labelY   = cyPx + (-Math.cos(a)) * offsetPx;
      const fontPx   = Math.max(13, 14 * s);
      ctx.fillStyle    = '#1a1a1a';
      ctx.font         = `bold ${fontPx}px sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle  = 'rgba(255,255,255,0.9)';
      ctx.lineWidth    = Math.max(3.5, 4 * s);
      const text = window.ruler.formatPosition(sens.distanceMM, this.units);
      ctx.strokeText(text, labelX, labelY);
      ctx.fillText  (text, labelX, labelY);
    }
    ctx.restore();
  }

  _updateSensorPanel() {
    const r = this.robot;
    const s = r.sensors;
    const el = id => document.getElementById(id);
    const set = (elId, val) => { const e = el(elId); if (e) e.textContent = val; };

    // Guard so test environments without the hub-popover DOM are skipped.
    // sp-x is one of the data-bound IDs that always exists when the hub
    // Position popover is rendered (regardless of whether it is open).
    if (!el('sp-x')) return;

    // Pose section
    const deg = (((r.heading % 360) + 360) % 360);
    set('sp-x',       window.ruler.formatPosition(r.x, this.units));
    set('sp-y',       window.ruler.formatPosition(r.y, this.units));
    set('sp-heading', deg.toFixed(0) + '°');
    set('sp-yaw',     this.getYaw().toFixed(0) + '°');

    // Port rows. PORT_CONFIG is module-scope; use this._portConfig.
    for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const cfg = this._portConfig[port];

      // Force sensor: dedicated widget on port C with fill bar + value label.
      if (cfg.kind === 'force_sensor') {
        this._paintForceSensorWidget(port);
        continue;
      }

      const valueEl = el('port-value-' + port);
      if (!valueEl) continue;

      if (cfg.kind === 'motor') {
        // Two readouts: current commanded velocity (deg/s, sign preserved)
        // and cumulative revolutions (motors[port] / 360). Speed reads as
        // "what the motor is doing right now"; revs is the encoder count in
        // a kid-friendly unit. Separator is two spaces so the chip's
        // monospace value never collapses them.
        const vel = r.motors_velocity[port] || 0;
        const rev = (r.motors[port] || 0) / 360;
        valueEl.textContent = `${Math.round(vel)}°/s  ${rev.toFixed(1)}↻`;
      } else if (cfg.kind === 'color_sensor') {
        valueEl.textContent = s.colorValue || 'none';
      } else if (cfg.kind === 'distance_sensor') {
        valueEl.textContent = s.distanceMM >= DIST_SENSOR_OOR_VALUE
          ? '—'
          : window.ruler.formatPosition(s.distanceMM, this.units);
      } else {
        valueEl.textContent = '';
      }
    }

    const swatch = el('color-swatch');
    if (swatch) {
      const c = COLOR_MAP[s.colorValue];
      swatch.style.background = c || 'transparent';
    }
  }

  // Force sensor: the press button lives in the Settings section (fill bar
  // animates 0→100% during ramp; data-state styles colour at hard-press), and
  // the numeric readout lives in the regular port-C value cell under Ports.
  // Both surfaces are repainted from the same forceN each frame.
  _paintForceSensorWidget(port) {
    const valEl  = document.getElementById('port-value-' + port);
    const fillEl = document.getElementById('port-force-fill-' + port);
    const btnEl  = document.getElementById('port-force-' + port);
    const f = this.robot.sensors.forceN || 0;
    const pct = Math.max(0, Math.min(100, (f / 10) * 100));
    if (valEl)  valEl.textContent  = f.toFixed(1) + ' N';
    if (fillEl) fillEl.style.width = pct.toFixed(1) + '%';
    if (btnEl) {
      const state = f >= 7 ? 'hard' : f >= 0.5 ? 'pressed' : 'idle';
      const ds = btnEl.dataset;
      if (ds && ds.state !== state) ds.state = state;
    }
  }

  _handleHover(event) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasMm = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    // canvasMm.y is canvas-relative; convert to math y for display.
    const x = canvasMm.x;
    const y = FIELD_H_MM - canvasMm.y;
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    // Show a grab cursor when the pointer is over the robot's drag hit-area,
    // so users know it's draggable without having to guess at the small body
    // footprint. Mid-drag the start handler already set 'grabbing'.
    if (this._dragPointerId === null) {
      const overRobot = !this.isRunning && this._pointInRobot(x, y, this._dragHitPadMM());
      this.canvas.style.cursor = overRobot ? 'grab' : '';
    }

    this._hoverEl.textContent = `x=${window.ruler.formatPosition(x, this.units)}  y=${window.ruler.formatPosition(y, this.units)}`;
    this._hoverEl.hidden = false;

    // Read overlay dimensions after textContent set so size reflects content
    const ow = this._hoverEl.offsetWidth;
    const oh = this._hoverEl.offsetHeight;
    const { left, top } = window.ruler.placeHoverOverlay(
      cursorX, cursorY, this.canvas.width, this.canvas.height, ow, oh, 12,
    );
    // The overlay is absolutely positioned inside .canvas-wrap; the canvas
    // sits at some offset within that wrap (combination of flex centering and
    // marginLeft/Top from _resize). Read the offset directly from the rects
    // so the overlay tracks the canvas regardless of how it was centered.
    const wrapRect = this.canvas.parentElement.getBoundingClientRect();
    this._hoverEl.style.left = (left + rect.left - wrapRect.left) + 'px';
    this._hoverEl.style.top  = (top  + rect.top  - wrapRect.top)  + 'px';
  }

  // Single setter for the position-readout unit. Trusts the caller (only
  // called from js/main.js, which validates against the allowed set before
  // calling). Marking _dirty triggers the next animation-frame redraw of
  // the ruler with the new tick pitch and labels.
  setUnits(unit) {
    this.units = unit;
    this._dirty = true;
  }

  stop() {
    this.isRunning = false;
  }

  async reset() {
    this.stop();
    this.robot   = makeRobotState();
    this.trail   = [{ x: this.robot.x, y: this.robot.y }];
    this.pairMap = {};
    this._stopRequested = false;
    this._emaN          = 0;
    this._manualStartMs = null;
    this._yawZeroHeading_deg = this.robot.heading;
    this._trailCtx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);
    this._trailArc = 0;
    this._dirty = true;
    this._setStatus('ready');

    await this._physicsReady;
    if (!this.physics) return; // headless test harness — no engine to reset.
    this.physics.setKinematicPose(
      this.robotBody,
      this.robot.x,
      this.robot.y,
      this.robot.heading * Math.PI / 180,
    );
    this.physics.setKinematicVelocity(this.robotBody, 0, 0, 0);
    for (const o of this._obstacles) {
      this.physics.setDynamicPose(o.body, o.cfg.x, o.cfg.y, 0);
    }
    this._updateDistanceSensor();
    this._dirty = true;
  }

  // Move the robot to an arbitrary pose without going through the kinematics
  // pipeline. Used by UAT scaffolding and the drag-to-place UI; mid-motion
  // calls are rejected since the kinematic body would fight the active
  // _animateTank step.
  async placeRobot(x_mm, y_mm, heading_deg) {
    if (this.isRunning) return false;
    const h = heading_deg === undefined ? this.robot.heading : heading_deg;
    this.robot.x = x_mm;
    this.robot.y = y_mm;
    this.robot.heading = h;
    this._yawZeroHeading_deg = h;
    this.trail = [{ x: x_mm, y: y_mm }];
    this._trailCtx.clearRect(0, 0, this._trailCanvas.width, this._trailCanvas.height);
    this._trailArc = 0;
    await this._physicsReady;
    if (this.physics) {
      this.physics.setKinematicPose(this.robotBody, x_mm, y_mm, h * Math.PI / 180);
      this.physics.setKinematicVelocity(this.robotBody, 0, 0, 0);
      this._updateDistanceSensor();
    }
    const sp = this._sensorPosition(this.robot);
    this.robot.sensors.colorValue = this._colorAtPosition(sp.x, sp.y);
    this._dirty = true;
    return true;
  }

  // Hit-test the robot footprint in math y-up world coords. Transforms the
  // probe into the robot's body-local frame (heading along +X-local) and
  // checks ±ROBOT_BODY_H/2 along forward, ±ROBOT_BODY_W/2 lateral. `pad_mm`
  // grows the target so users can grab the robot without pixel precision at
  // small zoom levels.
  _pointInRobot(x_mm, y_mm, pad_mm = 0) {
    const rad = -this.robot.heading * Math.PI / 180;
    const dx = x_mm - this.robot.x;
    const dy = y_mm - this.robot.y;
    const lx =  dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly =  dx * Math.sin(rad) + dy * Math.cos(rad);
    return Math.abs(lx) <= ROBOT_BODY_H / 2 + pad_mm
        && Math.abs(ly) <= ROBOT_BODY_W / 2 + pad_mm;
  }

  // Hit-area padding (mm) for drag-to-place. Body is 200×160 mm; at default
  // zoom that's ~40 px on screen, too small to grab precisely. 30 mm padding
  // gives a forgiving but still localized target.
  _dragHitPadMM() { return 30; }

  _handleDragStart(event) {
    if (this.isRunning) return;
    const rect = this.canvas.getBoundingClientRect();
    const m = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    const worldX = m.x;
    const worldY = FIELD_H_MM - m.y;
    if (!this._pointInRobot(worldX, worldY, this._dragHitPadMM())) return;
    this._dragPointerId = event.pointerId;
    this._dragOffsetX = worldX - this.robot.x;
    this._dragOffsetY = worldY - this.robot.y;
    try { this.canvas.setPointerCapture(event.pointerId); } catch (_) {}
    this.canvas.style.cursor = 'grabbing';
    event.preventDefault();
  }

  _handleDragMove(event) {
    if (this._dragPointerId !== event.pointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    const m = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    const x = m.x - this._dragOffsetX;
    const y = (FIELD_H_MM - m.y) - this._dragOffsetY;
    this.placeRobot(x, y);
  }

  _handleDragEnd(event) {
    if (this._dragPointerId !== event.pointerId) return;
    this._dragPointerId = null;
    this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.style.cursor = '';
  }

  // ── Command execution ───────────────────────────────────────────────────────

  // Port-kind validator. Mirrors py/spike_bridge.py _require so worker-routed
  // and direct-from-JS callers (Blockly) get the same error format.
  _assertPortKind(port, expectedKind) {
    const cfg = this._portConfig[port];
    const actualKind = cfg ? cfg.kind : 'empty';
    if (actualKind !== expectedKind) {
      const readable = expectedKind.replace(/_/g, ' ');
      throw new Error(
        `port ${port} has no ${readable} (configured: ${actualKind})`
      );
    }
  }

  // Throw if no port is configured with the given sensor kind. Used by Blockly
  // generators for blocks that don't take an explicit port (e.g. the
  // force-sensor word blocks). Mirrors how Python's force_sensor.* methods
  // raise when no port is configured 'force_sensor' in the canonical wiring.
  _assertSensorAvailable(kind) {
    for (const cfg of Object.values(this._portConfig)) {
      if (cfg && cfg.kind === kind) return;
    }
    const readable = kind.replace(/_/g, ' ');
    throw new Error(`no ${readable} configured on any port`);
  }

  async _execCmd(cmd) {
    const requiredKind = PORT_KIND_FOR_CMD[cmd.type];
    if (requiredKind && cmd.port !== undefined) {
      this._assertPortKind(cmd.port, requiredKind);
    }

    switch (cmd.type) {

      case 'pair':
        this.pairMap[cmd.pair_id] = { left: cmd.left, right: cmd.right };
        break;

      case 'move': {
        // steering: -100 (full left) → 0 (straight) → +100 (full right)
        const distMM = this._amountToMM(cmd.amount, cmd.unit);
        const spd    = cmd.speed / 1000;            // normalize -1..1
        const steer  = (cmd.steering || 0) / 100;   // -1..1
        const { leftV, rightV } = window.kinematics.steeringToWheels(spd, steer);
        await this._runMotion(
          this._descriptorForPair(cmd.pair_id),
          () => this._animateTank(leftV, rightV, distMM),
        );
        break;
      }

      case 'move_tank': {
        const distMM = this._amountToMM(cmd.amount, cmd.unit);
        const leftV  = cmd.left_speed  / 1000;
        const rightV = cmd.right_speed / 1000;
        await this._runMotion(
          this._descriptorForPair(cmd.pair_id),
          () => this._animateTank(leftV, rightV, distMM),
        );
        break;
      }

      case 'start':
      case 'start_tank':
        // Real LEGO motor_pair.move() / move_tank() return immediately; the
        // pair keeps driving until motor_pair.stop() or another pair command
        // supersedes. Fire-and-forget Infinity matches that — the prior 200mm
        // cap halted mid-mat. _runMotion's preempt logic (#47 41c07ca)
        // handles stacking when Python issues two start calls in a row, and
        // _animateTank's for-loop exits on _motionAborted / !isRunning.
        {
          let leftV, rightV;
          if (cmd.type === 'start') {
            const spd   = cmd.speed / 1000;
            const steer = (cmd.steering || 0) / 100;
            leftV  = spd * (1 + steer);
            rightV = spd * (1 - steer);
          } else {
            leftV  = cmd.left_speed  / 1000;
            rightV = cmd.right_speed / 1000;
          }
          this._runMotion(
            this._descriptorForPair(cmd.pair_id),
            () => this._animateTank(leftV, rightV, Infinity),
          );
        }
        break;

      case 'stop':
        if (this._activeMotion && this._activeMotion.pair === cmd.pair_id) {
          this._motionAborted = true;
        }
        break;

      case 'motor_degrees': {
        const distMM = (cmd.degrees / 360) * WHEEL_CIRC_MM;
        const v = (cmd.velocity || 500) / 1000;
        await this._animateSingleMotor(cmd.port, v, distMM);
        break;
      }

      case 'motor_time': {
        const ms   = cmd.time_ms || 1000;
        const v    = (cmd.velocity || 500) / 1000;
        const dist = Math.abs(v) * MM_PER_MS_100 * ms;
        await this._animateSingleMotor(cmd.port, v, dist);
        break;
      }

      case 'motor_run': {
        // Real LEGO motor.run() returns immediately; the motor keeps spinning
        // until motor.stop() (or another motor command on this port) replaces
        // it. Fire-and-forget Infinity matches that — the prior 180mm stub
        // halted after a tiny, undocumented amount of motion.
        const v = (cmd.velocity || 500) / 1000;
        this._animateSingleMotor(cmd.port, v, Infinity);
        break;
      }

      case 'motor_stop':
        if (this._activeMotion && this._activeMotion.ports.indexOf(cmd.port) !== -1) {
          this._motionAborted = true;
        }
        break;

      case 'print':
        window.appendOutput(cmd.text);
        break;

      case 'var_update':
        if (typeof window !== 'undefined' && window._watch) {
          window._watch.set(cmd.name, cmd.value);
        }
        break;

      case 'wait':
        await this._sleep(cmd.ms / this.speedMult);
        break;

      case 'hub_display':
        this._showText(cmd.text);
        this._dirty = true;
        break;

      case 'hub_image':
        this.robot.display = this._imageToDisplay(cmd.image);
        this._dirty = true;
        break;

      case 'hub_display_off':
        this.robot.display = Array(25).fill(0);
        this._dirty = true;
        break;

      case 'hub_pixel':
        if (cmd.x >= 0 && cmd.x < 5 && cmd.y >= 0 && cmd.y < 5) {
          this.robot.display[cmd.y * 5 + cmd.x] = cmd.brightness;
          this._dirty = true;
        }
        break;

      case 'hub_light':
        // light: 0=POWER, 1=CONNECT (LEGO hub.light.POWER/CONNECT).
        // Only POWER drives the visible centre button; CONNECT is the
        // Bluetooth pairing indicator and has no on-canvas representation.
        if ((cmd.light | 0) === 0) {
          const c = cmd.color | 0;
          // Anything outside the documented 0..10 range (including -1/UNKNOWN
          // and stray values) is rendered as "off" so the picker can't mint a
          // hex code that has no defined meaning.
          this.robot.centreLight = (c >= 0 && c <= 10) ? c : 0;
          this._dirty = true;
        }
        break;

      case 'hub_orientation': {
        // Two modes:
        //   { mode: 'set',    top }                  — absolute (0..3, wraps).
        //   { mode: 'rotate', direction: 'cw'|'ccw'} — relative ±1 step.
        // Orientation is a render-time transform on the 5×5 matrix; the raw
        // robot.display stays untouched so successive rotations re-rotate
        // from the original bitmap, matching the LEGO firmware behaviour.
        const cur = this.robot.orientation | 0;
        let next = cur;
        if (cmd.mode === 'rotate') {
          next = cur + (cmd.direction === 'counterclockwise' ? -1 : 1);
        } else {
          next = cmd.top | 0;
        }
        this.robot.orientation = ((next % 4) + 4) % 4;
        this._dirty = true;
        break;
      }

      case 'beep':
        this._playBeep(cmd.note, cmd.duration * 1000);
        break;

      case 'read_sensors':
        break;

      case 'reset_yaw':
        // angle_dDeg lets the program declare "yaw should read N here" without
        // physically rotating the robot. Default 0 = zero current heading.
        this.resetYaw((cmd.angle_dDeg ?? 0) / 10);
        break;
    }
  }

  // ── Movement helpers ────────────────────────────────────────────────────────

  _amountToMM(amount, unit) {
    switch (unit) {
      case 'rotations': return amount * WHEEL_CIRC_MM;
      case 'cm':        return amount * 10;
      case 'inches':    return amount * 25.4;
      case 'degrees':
      default:          return (amount / 360) * WHEEL_CIRC_MM;
    }
  }

  async _animateTank(leftV, rightV, refDistMM) {
    await this._physicsReady;
    if (!this.physics) return; // headless test harness — no engine to drive.

    // leftV/rightV: normalized speed ratio (-1 to 1); refDistMM is the
    // distance the *faster* wheel should travel (used for duration + scaling).
    const maxV = Math.max(Math.abs(leftV), Math.abs(rightV), 0.01);
    const totalMM = Math.abs(refDistMM);
    if (totalMM < 0.1) return;

    const SPEED_MM_S = MM_PER_MS_100 * 1000;
    const durationMs = window.kinematics.computeMoveDuration(
      totalMM, maxV, this.speedMult, MM_PER_MS_100,
    );
    const wallStepMs = 1000 / 60;
    const totalSteps = Math.max(1, Math.round(durationMs / wallStepMs));
    const physDt_s   = (wallStepMs / 1000) * this.speedMult;

    // Encoder accumulators — populate motors_velocity for the duration of
    // the motion so getMotorSpeed reflects the active wheels. Cleared at
    // motion-end.
    const desc      = this._activeMotion || {};
    let leftPort   = desc.leftPort  || null;
    let rightPort  = desc.rightPort || null;
    // Blockly generators (js/blockly_config.js) invoke _animateTank directly
    // without going through _runMotion, so _activeMotion is null and the
    // descriptor above has no port info. Without this fallback the drive
    // encoders never accumulate when running block programs, and the
    // motor-port readouts stay pinned at zero. Python's _execCmd always
    // supplies a real descriptor via _descriptorForPair, so this branch is
    // a no-op for that path.
    if (!leftPort && !rightPort) {
      for (const [p, c] of Object.entries(this._portConfig)) {
        if (c.role === 'drive-left')  leftPort  = p;
        if (c.role === 'drive-right') rightPort = p;
      }
    }
    if (leftPort)  this.robot.motors_velocity[leftPort]  = leftV  * 1000;
    if (rightPort) this.robot.motors_velocity[rightPort] = rightV * 1000;

    for (let i = 0; i < totalSteps; i++) {
      if (!this.isRunning) break;
      if (this._motionAborted) break;

      // Body angle is read each step because angVel rotates the body and the
      // forward direction has to follow — kinematics.wheelsToBodyVelocity
      // bakes the steering sign-flip in for us.
      const angle = this.robotBody.GetAngle();
      const v = window.kinematics.wheelsToBodyVelocity(
        leftV, rightV, angle, SPEED_MM_S, TRACK_W_MM,
      );

      this.physics.setKinematicVelocity(this.robotBody, v.vx, v.vy, v.angVel);
      const stepResult = this.physics.step(physDt_s);
      const impulseJ   = (stepResult && stepResult.force_impulses && stepResult.force_impulses.C) || 0;
      this._applyForceImpulse(impulseJ, physDt_s, impulseJ > 0);

      const pose = this.physics.readPose(this.robotBody);
      // Box2D v2.4 does not generate contacts between kinematic and static
      // bodies, so the field walls cannot stop the robot from inside the
      // engine. Clamp the centre so the rotated chassis+bumper AABB stays
      // inside the field, and write the clamped pose back so Box2D's idea of
      // the robot position stays aligned with what we render.
      const clamped = window.kinematics.clampRobotPose(
        { x: pose.x, y: pose.y, angle: pose.angle },
        { bodyW: ROBOT_BODY_W, bodyH: ROBOT_BODY_H, bumperDepth: BUMPER_DEPTH_MM,
          fieldW: FIELD_W_MM, fieldH: FIELD_H_MM },
      );
      if (clamped.clamped) {
        this.physics.setKinematicPose(this.robotBody, clamped.x, clamped.y, pose.angle);
      }
      const prevX = this.robot.x;
      const prevY = this.robot.y;
      this.robot.x = clamped.x;
      this.robot.y = clamped.y;
      this.robot.heading = pose.angle * 180 / Math.PI;

      this._appendTrailSegment(prevX, prevY, this.robot.x, this.robot.y);
      this.trail.push({ x: this.robot.x, y: this.robot.y });

      const sp = this._sensorPosition(this.robot);
      this.robot.sensors.colorValue = this._colorAtPosition(sp.x, sp.y);
      this._updateDistanceSensor();

      // Encoder accumulation: wheel travel this step, converted to degrees.
      // Sign preserved so reverse motion decrements the count, matching real
      // motor encoders.
      const leftStepMM  = leftV  * SPEED_MM_S * physDt_s;
      const rightStepMM = rightV * SPEED_MM_S * physDt_s;
      const leftDeg  = (leftStepMM  / WHEEL_CIRC_MM) * 360;
      const rightDeg = (rightStepMM / WHEEL_CIRC_MM) * 360;
      if (leftPort)  this.robot.motors[leftPort]  = (this.robot.motors[leftPort]  || 0) + leftDeg;
      if (rightPort) this.robot.motors[rightPort] = (this.robot.motors[rightPort] || 0) + rightDeg;

      this._dirty = true;
      await this._sleep(wallStepMs);
    }

    // Halt motion when the command finishes so obstacles stop being shoved.
    this.physics.setKinematicVelocity(this.robotBody, 0, 0, 0);
    // Clear active-motion wheel velocities so getMotorSpeed reads 0 at rest.
    if (leftPort)  this.robot.motors_velocity[leftPort]  = 0;
    if (rightPort) this.robot.motors_velocity[rightPort] = 0;
    // Trigger one more redraw so the motor-port chip in the status bar
    // refreshes from the last in-loop frame (which still saw a non-zero
    // commanded velocity) to the at-rest 0°/s. Without this the chip
    // stays pinned at the final motion speed until the next command.
    this._dirty = true;
  }

  async _animateSingleMotor(port, velocity, distMM) {
    // Defends Blockly's direct calls into window.sim — Blockly bypasses the
    // worker, so without this check a hand-edited XML or future block could
    // drive a wrong-port motor command past the Python validator.
    this._assertPortKind(port, 'motor');

    // Pre-compute the wheel→port mapping so _animateTank can update the
    // correct encoder. Three cases mirror the dispatch below.
    let descriptor;
    const pair = this._findPairForPort(port);
    if (pair) {
      const isLeft = pair.left === port;
      descriptor = {
        pair: null,
        ports: [port],
        leftPort:  isLeft ? port : null,
        rightPort: isLeft ? null : port,
      };
    } else {
      const role = this._portConfig[port] && this._portConfig[port].role;
      descriptor = {
        pair: null,
        ports: [port],
        leftPort:  role === 'drive-left'  ? port : null,
        rightPort: role === 'drive-right' ? port : null,
        auxPort:   (role !== 'drive-left' && role !== 'drive-right') ? port : null,
      };
    }

    await this._runMotion(descriptor, async () => {
      // motor_pair.pair(...) is the runtime override; it wins over the canonical
      // PORT_CONFIG roles so user-declared swaps (e.g. PAIR_1 = B,A) take effect.
      if (pair) {
        const isLeft = pair.left === port;
        const leftV  = isLeft ? velocity : 0;
        const rightV = isLeft ? 0 : velocity;
        await this._animateTank(leftV, rightV, distMM);
        return;
      }

      // Real Spike doesn't require motor_pair.pair() for motor.run() to do
      // something — the motor spins, and if it's wired to a wheel the robot
      // pivots around the stationary wheel. PORT_CONFIG roles encode that
      // wiring, so single-motor commands on drive ports route through tank
      // physics with the off-side wheel held at zero.
      const role = this._portConfig[port] && this._portConfig[port].role;
      if (role === 'drive-left') {
        await this._animateTank(velocity, 0, distMM);
        return;
      }
      if (role === 'drive-right') {
        await this._animateTank(0, velocity, distMM);
        return;
      }

      // Auxiliary motor (arm / attachment with no wheel): pass time only.
      this.robot.motors_velocity[port] = velocity * 1000;  // velocity arg is the fraction × 1000 deg/sec
      if (!Number.isFinite(distMM)) {
        // Continuous run (motor.run / start-motor blocks): step at wall-clock
        // cadence and accumulate encoder ticks each step until aborted or
        // !isRunning. Matches the drive-wheel for-loop's per-tick contract so
        // motor.velocity() reads sensibly while running.
        const wallStepMs = 1000 / 60;
        const physDt_s   = (wallStepMs / 1000) * this.speedMult;
        const stepDeg    = velocity * 1000 * physDt_s;  // velocity*1000 deg/s × s
        while (this.isRunning && !this._motionAborted) {
          this.robot.motors[port] = (this.robot.motors[port] || 0) + stepDeg;
          await this._sleep(wallStepMs);
        }
      } else {
        // Bounded run (motor.run_for_*): credit the full distMM-worth of
        // rotation up front and sleep wall-clock for the equivalent duration.
        const ms = (distMM / MM_PER_MS_100) / Math.max(0.1, Math.abs(velocity));
        const degrees = (distMM / WHEEL_CIRC_MM) * 360 * Math.sign(velocity || 1);
        this.robot.motors[port] = (this.robot.motors[port] || 0) + degrees;
        await this._sleep(ms / this.speedMult);
      }
      this.robot.motors_velocity[port] = 0;
    });
  }

  // Build the active-motion descriptor for a pair_id. ports comes from the
  // current pairMap binding; if no pair has been declared yet, ports stays
  // empty so motor_stop never matches (motor.stop() can still target the
  // single-motor descriptor in _animateSingleMotor).
  _descriptorForPair(pairId) {
    const p = this.pairMap[pairId];
    const ports = p ? [p.left, p.right] : [];
    return {
      pair:      pairId,
      ports,
      leftPort:  p ? p.left  : null,
      rightPort: p ? p.right : null,
    };
  }

  // Sets the active-motion descriptor and clears the abort flag for the
  // duration of the awaited motion. The 'stop' / 'motor_stop' command
  // handlers look at the descriptor to decide whether to flip the flag,
  // and _animateTank's loop reads the flag each iteration.
  // _motionPromise is exposed so Blockly's _motorStopAndAwait /
  // _pairStopAndAwait can wait for an in-flight motion to fully unwind
  // before the next block runs.
  async _runMotion(descriptor, fn) {
    // Preempt any in-flight motion. Without this guard, an unawaited fire-
    // and-forget caller (Blockly start_dual_speed / start_move / start_steer
    // inside a forever loop) stacks new _animateTank loops on top of the
    // previous one — each stepping physics on its own cadence — and the
    // body teleports.
    //
    // When several callers race here (all awaiting the same _motionPromise),
    // only the last entrant should actually go on to start a new motion —
    // matching LEGO "start" semantics where the latest command supersedes.
    // The seq check below makes earlier entrants bail after the preempt-await.
    const mySeq = ++this._motionSeq;
    if (this._motionPromise) {
      this._motionAborted = true;
      try { await this._motionPromise; } catch (_) { /* swallow */ }
    }
    if (mySeq !== this._motionSeq) return;
    this._activeMotion  = descriptor;
    this._motionAborted = false;
    const settled = (async () => {
      try {
        await fn();
      } finally {
        this._activeMotion = null;
        if (this._motionPromise === settled) this._motionPromise = null;
      }
    })();
    this._motionPromise = settled;
    await settled;
  }

  // Blockly's move/steer generators emit calls into this helper so the
  // motion goes through _runMotion (resets the abort flag, sets a pair
  // descriptor so encoders accumulate on both wheels).
  async _runPairMotion(leftPort, rightPort, leftV, rightV, distMM) {
    const descriptor = {
      pair: null,
      ports: [leftPort, rightPort],
      leftPort,
      rightPort,
    };
    await this._runMotion(descriptor, () => this._animateTank(leftV, rightV, distMM));
  }

  // Blockly's stop generators emit calls into these so the program waits
  // for the in-flight motion (typically a fire-and-forget start_motor or
  // startMove) to actually unwind before the next block runs.
  async _motorStopAndAwait(port) {
    if (this._activeMotion && this._activeMotion.ports.indexOf(port) !== -1) {
      this._motionAborted = true;
    }
    if (this._motionPromise) {
      try { await this._motionPromise; } catch (_) { /* swallow */ }
    }
  }

  async _pairStopAndAwait() {
    // Blockly tracks the pair via _movePairL/_movePairR locals — there's no
    // pair_id at this layer. Whatever motion is in flight is the one to stop.
    if (this._activeMotion) this._motionAborted = true;
    if (this._motionPromise) {
      try { await this._motionPromise; } catch (_) { /* swallow */ }
    }
  }

  _findPairForPort(port) {
    for (const [id, p] of Object.entries(this.pairMap)) {
      if (p.left === port || p.right === port) return p;
    }
    return null;
  }

  // Single tick of the force-sensor pipeline. impulseJ is the sum of normal
  // impulses (kg·m/s) on the port-C bumper from this Box2D step; dt_s is the
  // step length. hadContact = impulseJ > 0. Returns nothing; mutates
  // _emaN and robot.sensors.forceN.
  _applyForceImpulse(impulseJ, dt_s, hadContact) {
    const FSL = window.forceSensorLogic;
    const instantN = (dt_s > 0) ? (impulseJ / dt_s) : 0;
    this._emaN = FSL.emaStep(
      this._emaN, instantN, hadContact, this._FORCE_ALPHA, this._FORCE_DECAY,
    );
    const manualN = FSL.manualRamp(
      this._manualStartMs, performance.now(), this._FORCE_RAMP_MS, this._FORCE_MAX_N,
    );
    this.robot.sensors.forceN = FSL.combine(this._emaN, manualN);
  }

  // Idle tick: runs from _drawLoop on every frame, regardless of whether a
  // motor command is in flight. Doesn't issue a physics step (manual force is
  // independent of physics). Bleeds emaN by FORCE_DECAY each call so any
  // residual physics force from a just-finished _animateTank decays back to
  // zero within a few frames.
  _idleStepForceSensor() {
    const FSL = window.forceSensorLogic;
    this._emaN = this._emaN * this._FORCE_DECAY;
    const manualN = FSL.manualRamp(
      this._manualStartMs, performance.now(), this._FORCE_RAMP_MS, this._FORCE_MAX_N,
    );
    this.robot.sensors.forceN = FSL.combine(this._emaN, manualN);
  }

  // Public: called by the Hub-panel button on pointerdown. Idempotent — a
  // duplicate press while already pressed leaves manualStartMs untouched.
  manualPress() {
    if (this._manualStartMs == null) {
      this._manualStartMs = performance.now();
    }
  }

  // Public: called on pointerup / pointerleave / pointercancel. Snaps the
  // manual contribution to zero immediately.
  manualRelease() {
    this._manualStartMs = null;
    // Force one more draw so the panel/canvas repaint with the cleared
    // manual contribution. The draw loop's "should I redraw?" check only
    // stays true while manualStartMs != null OR emaN > 0.001 — without this
    // nudge, the frame that runs right after release sees both false and
    // skips draw(), leaving the last-painted (high) fill width on screen.
    this._dirty = true;
    // Note: emaN is NOT cleared — a release while in physics contact should
    // still surface the physics force.
  }

  resetYaw(degrees = 0) {
    this._yawZeroHeading_deg = this.robot.heading + degrees;
  }

  getYaw() {
    // LEGO yaw, in degrees: CW-positive, signed, wrapped to [-180, 180).
    let d = -(this.robot.heading - this._yawZeroHeading_deg);
    d = ((d + 180) % 360 + 360) % 360 - 180;
    return d;
  }

  _yawDeciDeg() {
    return Math.round(this.getYaw() * 10);
  }

  // ── SAB sensor snapshot ──────────────────────────────────────────────────────

  _sensorState() {
    const r = this.robot;
    const f = window.forceSensorLogic.forceToReadings(r.sensors.forceN);
    return {
      x:             r.x,
      y:             r.y,
      heading:       r.heading,
      yaw_dDeg:      this._yawDeciDeg(),
      color:         r.sensors.colorValue,
      reflection:    this.getColorSensorReflection(),
      distance_mm:   r.sensors.distanceMM,
      motors:        { ...r.motors },
      force_dn:      f.dn,
      force_pressed: f.pressed,
      force_raw:     f.raw,
      buttons:       { ...(r.buttons || { LEFT: 0, RIGHT: 0 }) },
      stopped:       false,
    };
  }

  // ── Worker command bridge ────────────────────────────────────────────────────
  // main.js calls this for each {type:'cmd'} the Python worker sends.

  async executeCommand(cmd) {
    if (this._stopRequested) {
      return { ...this._sensorState(), stopped: true };
    }
    this.isRunning = true;
    await this._execCmd(cmd);
    // Don't flip isRunning=false while a fire-and-forget motion (motor.run
    // case 'motor_run' / motor_pair.move case 'start' / 'start_tank', all #10)
    // is still ticking — the motion's per-iteration loop reads isRunning and
    // would break out on the next tick (~16ms). The flag flips back to false
    // when the motion's IIFE clears _motionPromise in _runMotion's finally,
    // or when the user explicitly calls sim.stop().
    if (!this._motionPromise) this.isRunning = false;
    return this._sensorState();
  }

  // Color sensor world-space mount in math y-up: 88 mm forward of robot
  // centre along heading. Mirrors _distanceSensorMount below — same
  // physical offset, just exposed without an explicit ray angle since the
  // colour sensor reads a single point under the chassis.
  _sensorPosition(robot) {
    const forward    = ROBOT_BODY_H / 2 - 12;  // 88 mm
    const headingRad = robot.heading * Math.PI / 180;
    return {
      x: robot.x + forward * Math.cos(headingRad),
      y: robot.y + forward * Math.sin(headingRad),
    };
  }

  // Distance sensor world-space mount in math y-up: 88 mm forward of robot
  // center along heading. Matches the dot drawn at body-local (0, -bh/2 + 12)
  // in _drawRobot. Returned angleRad is the ray direction (= heading).
  _distanceSensorMount(robot) {
    const forward    = ROBOT_BODY_H / 2 - 12;           // 88 mm
    const headingRad = robot.heading * Math.PI / 180;
    return {
      x: robot.x + forward * Math.cos(headingRad),
      y: robot.y + forward * Math.sin(headingRad),
      angleRad: headingRad,
    };
  }

  // Cast a ray from the distance-sensor mount along heading and update
  // robot.sensors.{distanceMM, distanceHit, distanceOrigin}. No-op when
  // physics isn't ready (early startup or headless tests).
  _updateDistanceSensor() {
    if (!this.physics || !this.robotBody) return;
    const m = this._distanceSensorMount(this.robot);
    const r = this.physics.castRay(
      { x: m.x, y: m.y }, m.angleRad, DIST_SENSOR_MAX_MM,
      { excludeBody: this.robotBody },
    );
    this.robot.sensors.distanceMM     = r.hit ? r.distanceMm : DIST_SENSOR_OOR_VALUE;
    this.robot.sensors.distanceHit    = r.hit ? r.point : null;
    this.robot.sensors.distanceOrigin = { x: m.x, y: m.y };
  }

  _colorAtPosition(x, y) {
    for (const obj of FIELD_OBJECTS) {
      if (!obj.sensorColor) continue;
      if (obj.type === 'line') {
        const dist = this._pointToLineDist(x, y, obj.x1, obj.y1, obj.x2, obj.y2);
        if (dist <= Math.max((obj.lw || 1) / 2, 20)) return obj.sensorColor;
      } else if (obj.type === 'rect') {
        if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h)
          return obj.sensorColor;
      } else if (obj.type === 'circle') {
        const dx = x - obj.x, dy = y - obj.y;
        if (Math.sqrt(dx * dx + dy * dy) <= obj.r) return obj.sensorColor;
      }
    }
    return 'none';
  }

  _pointToLineDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // ── LED display helpers ─────────────────────────────────────────────────────

  _showText(text) {
    const s = String(text || '');
    // Mirror to the Console panel so light_matrix.write doubles as a
    // print-style debug surface in the sim. On a real hub this same call
    // scrolls text on the 5×5; the Console mirror is sim-only because no
    // Console exists on hardware.
    if (typeof window !== 'undefined' && typeof window.appendOutput === 'function') {
      window.appendOutput(s);
    }
    if (s.length === 0) {
      this.robot.display = Array(25).fill(0);
      return;
    }
    // Render the first character from the 5×5 font. Multi-character scrolling
    // is real Spike's behaviour; this sim shows only the head of the string.
    // Unknown characters render blank rather than the previous every-other-
    // pixel fake (so typos don't masquerade as text).
    const ch = s.charAt(0).toUpperCase();
    const glyph = _GLYPH_FONT[ch];
    if (!glyph) {
      this.robot.display = Array(25).fill(0);
      return;
    }
    this.robot.display = glyph.map((b) => (b ? 100 : 0));
  }

  // hub.light_matrix.show_image / IMAGE_* — maps an image name (or stringified
  // IMAGE_* int) to the 25-cell brightness pattern that gets drawn on the 5×5
  // matrix. Per audit 2026-05-13 §4.3, this case used to be missing entirely
  // and show_image was a silent no-op.
  //
  // We do NOT enumerate all 67 LEGO IMAGE_* constants here; doing that would
  // dwarf the rest of this file. The contract enforced is:
  //   - HAPPY / SAD / HEART / ARROW_N render distinguishable bitmaps
  //   - unknown image names render a blank pattern (NOT a silent no-op, so
  //     typos don't masquerade as "the previous image is still showing")
  // Adding additional patterns is one entry per image.
  _imageToDisplay(image) {
    const _IMAGE_PATTERNS = {
      // 1 = lit (rendered at brightness 100), 0 = off. Rows top-to-bottom,
      // columns left-to-right, math y-down for the display grid.
      HAPPY: [
        0,1,0,1,0,
        0,1,0,1,0,
        0,0,0,0,0,
        1,0,0,0,1,
        0,1,1,1,0,
      ],
      SAD: [
        0,1,0,1,0,
        0,1,0,1,0,
        0,0,0,0,0,
        0,1,1,1,0,
        1,0,0,0,1,
      ],
      HEART: [
        0,1,0,1,0,
        1,1,1,1,1,
        1,1,1,1,1,
        0,1,1,1,0,
        0,0,1,0,0,
      ],
      ARROW_N: [
        0,0,1,0,0,
        0,1,1,1,0,
        1,0,1,0,1,
        0,0,1,0,0,
        0,0,1,0,0,
      ],
    };
    // The bridge sends str(image), so a user `show_image(hub.light_matrix.IMAGE_HAPPY)`
    // arrives as "3" (the int constant). Map ints back to names for the
    // images we actually render. Image names from py/spike_bridge.py:353.
    const _INT_TO_NAME = {
      '3':  'HAPPY',
      '5':  'SAD',
      '1':  'HEART',
      '27': 'ARROW_N',
    };
    let key = String(image || '').toUpperCase();
    if (_INT_TO_NAME[key]) key = _INT_TO_NAME[key];
    const bits = _IMAGE_PATTERNS[key];
    if (!bits) return Array(25).fill(0);
    return bits.map((b) => (b ? 100 : 0));
  }

  // ── Sensor accessors (called from Python via JS bridge) ─────────────────────

  getColorSensorColor() { return this.robot.sensors.colorValue; }

  getColorSensorColorInt() {
    const v = this.robot.sensors.colorValue;
    return COLOR_INT_MAP[v] ?? -1;
  }

  getColorSensorReflection() {
    const reflMap = {
      white: 90, yellow: 75, azure: 70, orange: 65, green: 60,
      magenta: 55, red: 50, blue: 45, black: 5, none: 50,
    };
    return reflMap[this.robot.sensors.colorValue] ?? 50;
  }

  getColorSensorAmbient() { return 30; }

  getColorSensorRGB() {
    const c = COLOR_MAP[this.robot.sensors.colorValue];
    if (!c) return [128, 128, 128];
    const hex = c.replace('#', '');
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    return [128, 128, 128];
  }

  getDistanceSensorValue() {
    // LEGO ultrasonic spec: 50–2000 mm, blind below 50 mm. Report OOR in
    // the blind zone so user code sees the same -1 return path it would on
    // real hardware. The raw distanceMM is left untouched so the ray renderer
    // still draws the true geometric hit for debugging.
    this._updateDistanceSensor();
    const d = this.robot.sensors.distanceMM;
    return d < DIST_SENSOR_MIN_MM ? DIST_SENSOR_OOR_VALUE : d;
  }
  getDistanceSensorPresence() { this._updateDistanceSensor(); return this.robot.sensors.distanceMM < 100; }
  getForceSensorValue() {
    return window.forceSensorLogic.forceToReadings(this.robot.sensors.forceN).dn;
  }
  getForceSensorPressed() {
    return window.forceSensorLogic.forceToReadings(this.robot.sensors.forceN).pressed;
  }
  getForceSensorRaw() {
    return window.forceSensorLogic.forceToReadings(this.robot.sensors.forceN).raw;
  }
  getMotorSpeed(port)         { return (this.robot.motors_velocity && this.robot.motors_velocity[port]) || 0; }
  getMotorPosition(port)      { return this.robot.motors[port] || 0; }

  // Read-only snapshot for the missions ChallengeEngine. Returns a fresh
  // object — callers can mutate without affecting simulator state. Sensor
  // values mirror what's displayed in the right-rail panel.
  getStateSnapshot() {
    const obstacles = {};
    const obstacleList = this._obstacles.length
      ? this._obstacles
      : OBSTACLES.map(cfg => ({ cfg, body: null }));
    for (const o of obstacleList) {
      const pos = (o.body && this.physics)
        ? this.physics.readPose(o.body)
        : { x: o.cfg.x, y: o.cfg.y };
      obstacles[o.cfg.label] = { x: pos.x, y: pos.y };
    }
    return {
      robot: { x: this.robot.x, y: this.robot.y, heading: this.robot.heading },
      obstacles,
      sensors: {
        C: this.robot.sensors.colorValue,
        D: this.robot.sensors.distanceMM,
        E: this.robot.sensors.forceN,
      },
    };
  }

  // ── Obstacle contact subscription ────────────────────────────────────────────

  // Subscribe to obstacle-contact events. `cb` is called with the obstacle's
  // label (string) each time the robot body first contacts that obstacle in a
  // physics step. Returns an unsubscribe function.
  //
  // TODO (Task 19 integration): wire _dispatchObstacleContact into the Box2D
  // BeginContact listener inside _initPhysics so that real physics contacts
  // (robot ↔ obstacle body) automatically invoke all subscribers. The test
  // seam below is sufficient for missions engine unit tests and integration
  // tests that don't drive real physics.
  onObstacleContact(cb) {
    this._obstacleContactSubs.add(cb);
    return () => this._obstacleContactSubs.delete(cb);
  }

  // Wired into the Box2D contact listener by _initPhysics. Tests can call it
  // directly to synthesise contacts without driving real physics.
  _dispatchObstacleContact(obstacleId) {
    for (const cb of this._obstacleContactSubs) cb(obstacleId);
  }

  // ── Audio ───────────────────────────────────────────────────────────────────

  _playBeep(note, durationMs) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      // MIDI note to frequency
      const freq = 440 * Math.pow(2, (note - 69) / 12);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + durationMs / 1000);
    } catch (e) { /* audio not available */ }
  }

  // ── Utils ───────────────────────────────────────────────────────────────────

  _sleep(ms) {
    return new Promise(r => setTimeout(r, Math.max(0, ms)));
  }

  _setStatus(state) {
    const dot   = document.getElementById('status-dot');
    const label = document.getElementById('status-label');
    if (dot)   { dot.className = `status-dot ${state}`; }
    if (label) { label.textContent = state.charAt(0).toUpperCase() + state.slice(1); }
  }
}

window.RobotSimulator = RobotSimulator;
