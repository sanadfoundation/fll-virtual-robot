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
const WHEEL_DIA_MM  = 56;
const WHEEL_CIRC_MM = Math.PI * WHEEL_DIA_MM;
const TRACK_W_MM    = 112;  // center-to-center
const ROBOT_BODY_W  = 160;  // body width without wheels
const ROBOT_BODY_H  = 200;  // body front-to-back
const BUMPER_DEPTH_MM = 10;   // front-to-back
const BUMPER_WIDTH_MM = 30;   // lateral
const MM_PER_MS_100 = 0.9;  // robot speed at 100% (mm per ms)
const DIST_SENSOR_MAX_MM    = 2000;  // matches LEGO Spike hardware spec
const DIST_SENSOR_OOR_VALUE = 9999;  // wire sentinel; py/spike_bridge.py:308 maps ≥9999 → -1

// ── Port configuration ──────────────────────────────────────────────────────
// Mirror of py/spike_bridge.py _PORT_CONFIG. Customization will replace this
// constant with mutable per-instance state and a config-update worker message.
const PORT_CONFIG = {
  A: { kind: 'motor',           role: 'drive-left'  },
  B: { kind: 'motor',           role: 'drive-right' },
  C: { kind: 'force_sensor',    mount: 'front'      },
  D: { kind: 'empty' },
  E: { kind: 'color_sensor' },
  F: { kind: 'distance_sensor' },
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
  cyan:    '#00bcd4',
  magenta: '#e91e63',
  orange:  '#ff9800',
  none:    null,
};

const COLOR_INT_MAP = {
  none: -1, black: 0, magenta: 1, purple: 2, blue: 3,
  azure: 4, turquoise: 5, green: 6, yellow: 7, orange: 8, red: 9, white: 10,
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

    this._hoverEl = document.getElementById('canvas-hover');
    if (this._hoverEl) {
      this.canvas.addEventListener('mousemove', e => this._handleHover(e));
      this.canvas.addEventListener('mouseleave', () => { this._hoverEl.hidden = true; });
    }

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
    const W = wrap.clientWidth  - 2;
    const H = wrap.clientHeight - 2;

    const scaleW = W / FIELD_W_MM;
    const scaleH = H / FIELD_H_MM;
    this._scale = Math.min(scaleW, scaleH);

    const fw = FIELD_W_MM * this._scale;
    const fh = FIELD_H_MM * this._scale;

    this.canvas.width  = fw;
    this.canvas.height = fh;
    this._offX = (W - fw) / 2;
    this._offY = (H - fh) / 2;
    this.canvas.style.marginLeft = this._offX + 'px';
    this.canvas.style.marginTop  = this._offY + 'px';

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
    if (this._dirty) {
      this._draw();
      this._dirty = false;
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
    for (const obj of FIELD_OBJECTS) {
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
    const ww = 22 * s;   // wheel width
    const wh = 56 * s;   // wheel height
    const wInset = 10 * s;

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

    // Hub brick (Spike Prime = light gray hub)
    const hw = 90 * s;
    const hh = 80 * s;
    ctx.fillStyle = '#a8a8c0';
    ctx.strokeStyle = '#7070a0';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.roundRect(-hw/2, -hh/2, hw, hh, 7*s);
    ctx.fill();
    ctx.stroke();

    // LED matrix (5×5)
    const dotR   = 2.5 * s;
    const dotGap = 8 * s;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const idx = row * 5 + col;
        const bri = r.display[idx];
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

    // Front indicator (red triangle pointing "forward")
    ctx.fillStyle = '#ff4455';
    ctx.beginPath();
    ctx.moveTo(0,  -bh/2 - 8*s);
    ctx.lineTo(-10*s, -bh/2 + 10*s);
    ctx.lineTo( 10*s, -bh/2 + 10*s);
    ctx.closePath();
    ctx.fill();

    // Color sensor dot (bottom-center of body)
    const cs = r.sensors;
    const csColor = COLOR_MAP[cs.colorValue] || '#555';
    ctx.fillStyle = csColor || '#555';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1*s;
    ctx.beginPath();
    ctx.arc(0, bh/2 - 12*s, 6*s, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    // Distance sensor dot (front of body)
    ctx.fillStyle = '#56d4c0';
    ctx.beginPath();
    ctx.arc(0, -bh/2 + 12*s, 5*s, 0, Math.PI*2);
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

    if (!el('sensor-panel')) return;

    // Pose section
    const deg = (((r.heading % 360) + 360) % 360);
    set('sp-x',       window.ruler.formatPosition(r.x, this.units));
    set('sp-y',       window.ruler.formatPosition(r.y, this.units));
    set('sp-heading', deg.toFixed(0) + '°');

    // Port rows. PORT_CONFIG is module-scope; use this._portConfig.
    for (const port of ['A', 'B', 'C', 'D', 'E', 'F']) {
      const cfg = this._portConfig[port];
      const valueEl = el('port-value-' + port);
      if (!valueEl) continue;

      if (cfg.kind === 'motor') {
        valueEl.textContent = (r.motors[port] || 0).toFixed(0) + '°';
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

  _handleHover(event) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasMm = window.ruler.clientToMM(event.clientX, event.clientY, rect, this._scale);
    // canvasMm.y is canvas-relative; convert to math y for display.
    const x = canvasMm.x;
    const y = FIELD_H_MM - canvasMm.y;
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

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
        await this._animateTank(leftV, rightV, distMM);
        break;
      }

      case 'move_tank': {
        const distMM = this._amountToMM(cmd.amount, cmd.unit);
        const leftV  = cmd.left_speed  / 1000;
        const rightV = cmd.right_speed / 1000;
        await this._animateTank(leftV, rightV, distMM);
        break;
      }

      case 'start':
      case 'start_tank':
        // Continuous - run for 2 seconds as approximation
        {
          const leftV  = cmd.type === 'start' ? (cmd.speed/1000) : (cmd.left_speed/1000);
          const rightV = cmd.type === 'start' ? (cmd.speed/1000) : (cmd.right_speed/1000);
          await this._animateTank(leftV, rightV, 200);
        }
        break;

      case 'stop':
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
        const v = (cmd.velocity || 500) / 1000;
        await this._animateSingleMotor(cmd.port, v, 180);
        break;
      }

      case 'motor_stop':
        break;

      case 'print':
        window.appendOutput(cmd.text);
        break;

      case 'wait':
        await this._sleep(cmd.ms / this.speedMult);
        break;

      case 'hub_display':
        this._showText(cmd.text);
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

      case 'beep':
        this._playBeep(cmd.note, cmd.duration * 1000);
        break;

      case 'read_sensors':
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

    for (let i = 0; i < totalSteps; i++) {
      if (!this.isRunning) break;

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
      const prevX = this.robot.x;
      const prevY = this.robot.y;
      this.robot.x = pose.x;
      this.robot.y = pose.y;
      this.robot.heading = pose.angle * 180 / Math.PI;

      this._appendTrailSegment(prevX, prevY, this.robot.x, this.robot.y);
      this.trail.push({ x: this.robot.x, y: this.robot.y });

      const sp = this._sensorPosition(this.robot);
      this.robot.sensors.colorValue = this._colorAtPosition(sp.x, sp.y);
      this._updateDistanceSensor();

      this._dirty = true;
      await this._sleep(wallStepMs);
    }

    // Halt motion when the command finishes so obstacles stop being shoved.
    this.physics.setKinematicVelocity(this.robotBody, 0, 0, 0);
  }

  async _animateSingleMotor(port, velocity, distMM) {
    // Defends Blockly's direct calls into window.sim — Blockly bypasses the
    // worker, so without this check a hand-edited XML or future block could
    // drive a wrong-port motor command past the Python validator.
    this._assertPortKind(port, 'motor');

    // motor_pair.pair(...) is the runtime override; it wins over the canonical
    // PORT_CONFIG roles so user-declared swaps (e.g. PAIR_1 = B,A) take effect.
    const pair = this._findPairForPort(port);
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
    const ms = (distMM / MM_PER_MS_100) / Math.max(0.1, Math.abs(velocity));
    await this._sleep(ms / this.speedMult);
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

  // ── SAB sensor snapshot ──────────────────────────────────────────────────────

  _sensorState() {
    const r = this.robot;
    const f = window.forceSensorLogic.forceToReadings(r.sensors.forceN);
    return {
      x:             r.x,
      y:             r.y,
      heading:       r.heading,
      color:         r.sensors.colorValue,
      distance_mm:   r.sensors.distanceMM,
      motors:        { ...r.motors },
      force_dn:      f.dn,
      force_pressed: f.pressed,
      force_raw:     f.raw,
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
    this.isRunning = false;
    return this._sensorState();
  }

  _sensorPosition(robot) {
    const localY = ROBOT_BODY_H / 2 - 12;  // 88mm from center to color sensor
    const rotRad = (robot.heading + 90) * Math.PI / 180;
    return {
      x: robot.x - localY * Math.sin(rotRad),
      y: robot.y + localY * Math.cos(rotRad),
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
    const s = String(text);
    // Show first char as a simple pattern
    const charPatterns = {
      '0': [1,1,1,1,0,1,1,0,1,1,0,1,1,1,1],
      '1': [0,1,0,1,1,0,0,1,0,0,1,0,1,1,1],
      // ... simplified
    };
    // Just light up all dots proportional to text length
    const bri = Math.min(100, 30 + text.length * 5);
    this.robot.display = Array(25).fill(0).map((_, i) => (i % 2 === 0 ? bri : 0));
  }

  // ── Sensor accessors (called from Python via JS bridge) ─────────────────────

  getColorSensorColor() { return this.robot.sensors.colorValue; }

  getColorSensorColorInt() {
    const v = this.robot.sensors.colorValue;
    return COLOR_INT_MAP[v] ?? -1;
  }

  getColorSensorReflection() {
    const reflMap = {
      white: 90, yellow: 75, cyan: 70, orange: 65, green: 60,
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

  getDistanceSensorValue()    { this._updateDistanceSensor(); return this.robot.sensors.distanceMM; }
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
  getMotorSpeed(port)         { return 0; }
  getMotorPosition(port)      { return this.robot.motors[port] || 0; }

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
