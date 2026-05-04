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
const MM_PER_MS_100 = 0.9;  // robot speed at 100% (mm per ms)

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

const FIELD_OBJECTS = [
  // Home area
  { type: 'rect', x: 80, y: 780, w: 600, h: 300, fill: 'rgba(100,160,255,0.18)', stroke: '#4488ff', lw: 3, label: 'HOME' },
  // Mission areas — sensorColor defines what the color sensor reads inside each zone
  { type: 'rect', x: 900,  y: 100,  w: 200, h: 200, fill: 'rgba(255,200,100,0.2)', stroke: '#f0a830', lw: 2, sensorColor: 'yellow' },
  { type: 'rect', x: 1600, y: 100,  w: 200, h: 200, fill: 'rgba(100,220,150,0.2)', stroke: '#30c060', lw: 2, sensorColor: 'green'  },
  { type: 'rect', x: 1900, y: 700,  w: 200, h: 200, fill: 'rgba(220,100,100,0.2)', stroke: '#cc4444', lw: 2, sensorColor: 'red'    },
  // Colored lines on the mat
  { type: 'line', x1: 0,    y1: 680, x2: 2362, y2: 680, stroke: '#222', lw: 4, sensorColor: 'black' },
  { type: 'circle', x: 1181, y: 571, r: 80, fill: 'rgba(200,200,200,0.2)', stroke: '#888', lw: 2 },
  // Launch line
  { type: 'line', x1: 0,    y1: 1000, x2: 680, y2: 1000, stroke: '#222', lw: 3, sensorColor: 'black' },
];

// ── Robot state ──────────────────────────────────────────────────────────────

function makeRobotState() {
  return {
    x: 350,          // mm from left edge
    y: 980,          // mm from top edge
    heading: -90,    // degrees, -90 = facing up (north)
    motors: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
    sensors: {
      colorPort:    'E',
      distancePort: 'F',
      colorValue:   'none',
      distanceMM:   300,
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
    this.pairMap   = {};  // pair_id → { left, right }

    this._missionBoxes   = [];
    this._stopRequested  = false;

    this._scale = 1;
    this._offX  = 0;
    this._offY  = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._raf = null;
    this._drawLoop();
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
  }

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  px(mm) { return mm * this._scale; }

  // ── Drawing loop ────────────────────────────────────────────────────────────

  _drawLoop() {
    this._draw();
    this._raf = requestAnimationFrame(() => this._drawLoop());
  }

  _draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = this._scale;

    ctx.clearRect(0, 0, W, H);
    this._drawField(ctx, W, H, s);
    this._drawTrail(ctx, s);
    this._drawRobot(ctx, s);
    this._updateSensorPanel();
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

    // Field objects
    for (const obj of FIELD_OBJECTS) {
      ctx.save();
      if (obj.type === 'rect') {
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.roundRect(obj.x*s, obj.y*s, obj.w*s, obj.h*s, 4*s);
        if (obj.fill)   ctx.fill();
        if (obj.stroke) ctx.stroke();
        if (obj.label) {
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.font = `bold ${11*s}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obj.label, (obj.x + obj.w/2)*s, (obj.y + obj.h/2)*s);
        }
      } else if (obj.type === 'line') {
        ctx.strokeStyle = obj.stroke;
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.moveTo(obj.x1*s, obj.y1*s);
        ctx.lineTo(obj.x2*s, obj.y2*s);
        ctx.stroke();
      } else if (obj.type === 'circle') {
        ctx.fillStyle   = obj.fill   || 'transparent';
        ctx.strokeStyle = obj.stroke || 'transparent';
        ctx.lineWidth   = (obj.lw || 1) * s;
        ctx.beginPath();
        ctx.arc(obj.x*s, obj.y*s, obj.r*s, 0, Math.PI*2);
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

  _drawTrail(ctx, s) {
    if (this.trail.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(124,106,247,0.45)';
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([4*s, 4*s]);
    ctx.beginPath();
    ctx.moveTo(this.trail[0].x * s, this.trail[0].y * s);
    for (let i = 1; i < this.trail.length; i++) {
      ctx.lineTo(this.trail[i].x * s, this.trail[i].y * s);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawRobot(ctx, s) {
    const r = this.robot;
    ctx.save();
    ctx.translate(r.x * s, r.y * s);
    // +90° offset: robot is drawn with "forward" pointing along local -Y (up),
    // but heading=0 in our system means "right" (+X). Adding 90° aligns them.
    ctx.rotate((r.heading + 90) * Math.PI / 180);

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

  _updateSensorPanel() {
    const s = this.robot.sensors;
    const el = id => document.getElementById(id);
    const r = this.robot;
    const panel = el('sensor-panel');
    if (!panel) return;

    const set = (elId, val) => { const e = el(elId); if (e) e.textContent = val; };
    const deg = r.heading % 360;
    set('sp-x',       (r.x / 10).toFixed(1) + ' cm');
    set('sp-y',       (r.y / 10).toFixed(1) + ' cm');
    set('sp-heading', (((deg % 360) + 360) % 360).toFixed(0) + '°');
    set('sp-color',   s.colorValue || 'none');
    set('sp-dist',    (s.distanceMM / 10).toFixed(1) + ' cm');

    const swatch = el('color-swatch');
    if (swatch) {
      const c = COLOR_MAP[s.colorValue];
      swatch.style.background = c || '#444';
    }
  }

  stop() {
    this.isRunning = false;
  }

  reset() {
    this.stop();
    this.robot   = makeRobotState();
    this.trail   = [{ x: this.robot.x, y: this.robot.y }];
    this.pairMap = {};
    this._stopRequested = false;
    this._setStatus('ready');
  }

  // ── Command execution ───────────────────────────────────────────────────────

  async _execCmd(cmd) {
    switch (cmd.type) {

      case 'pair':
        this.pairMap[cmd.pair_id] = { left: cmd.left, right: cmd.right };
        break;

      case 'move': {
        // steering: -100 (full left) → 0 (straight) → +100 (full right)
        const distMM = this._amountToMM(cmd.amount, cmd.unit);
        const spd    = cmd.speed / 1000;  // normalize -1..1
        const steer  = (cmd.steering || 0) / 100;  // -1..1
        // steering > 0 = right: left wheel faster, right wheel slower/reversed
        const leftV  = spd * (1 + steer);
        const rightV = spd * (1 - steer);
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
        break;

      case 'hub_display_off':
        this.robot.display = Array(25).fill(0);
        break;

      case 'hub_pixel':
        if (cmd.x >= 0 && cmd.x < 5 && cmd.y >= 0 && cmd.y < 5)
          this.robot.display[cmd.y * 5 + cmd.x] = cmd.brightness;
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
    // leftV/rightV: normalized speed ratio (-1 to 1); refDistMM is the
    // distance the *faster* wheel should travel (used for duration + scaling).
    const maxV = Math.max(Math.abs(leftV), Math.abs(rightV), 0.01);
    const totalMM = Math.abs(refDistMM);
    if (totalMM < 0.1) return;

    // Duration: how long at 100% speed would refDist take, scaled by maxV
    const durationMs = (totalMM / (maxV * MM_PER_MS_100)) / this.speedMult;
    const FPS   = 60;
    const steps = Math.max(1, Math.round(durationMs * FPS / 1000));
    const dt    = durationMs / steps;

    // Each wheel's actual distance per step, scaled proportionally to refDist
    const scale = totalMM / maxV;
    const leftMmPerStep  = (leftV  / steps) * scale;
    const rightMmPerStep = (rightV / steps) * scale;

    for (let i = 0; i < steps; i++) {
      if (!this.isRunning) break;

      const avg  = (leftMmPerStep + rightMmPerStep) / 2;
      const diff = rightMmPerStep - leftMmPerStep;

      // Canvas Y is inverted vs math convention, so clockwise (right turn) requires negating
      this.robot.heading -= (diff / TRACK_W_MM) * (180 / Math.PI);

      const headRad = this.robot.heading * Math.PI / 180;
      const prevX = this.robot.x;
      const prevY = this.robot.y;
      this.robot.x += Math.cos(headRad) * avg;
      this.robot.y += Math.sin(headRad) * avg;

      for (const box of this._missionBoxes) {
        if (this._robotOverlapsAABB(this.robot, box)) {
          this.robot.x = prevX;
          this.robot.y = prevY;
          return;
        }
      }

      this.trail.push({ x: this.robot.x, y: this.robot.y });
      this._clampRobot();

      const sp = this._sensorPosition(this.robot);
      this.robot.sensors.colorValue = this._colorAtPosition(sp.x, sp.y);

      await this._sleep(dt);
    }
  }

  async _animateSingleMotor(port, velocity, distMM) {
    // Determine if this is a drive motor based on pair configuration
    const pair = this._findPairForPort(port);
    if (pair) {
      const isLeft = pair.left === port;
      const leftV  = isLeft ? velocity : 0;
      const rightV = isLeft ? 0 : velocity;
      await this._animateTank(leftV, rightV, distMM);
    } else {
      // Non-drive motor: just wait proportional time
      const ms = (distMM / MM_PER_MS_100) / Math.max(0.1, Math.abs(velocity));
      await this._sleep(ms / this.speedMult);
    }
  }

  _findPairForPort(port) {
    for (const [id, p] of Object.entries(this.pairMap)) {
      if (p.left === port || p.right === port) return p;
    }
    return null;
  }

  _clampRobot() {
    this.robot.x = Math.max(0, Math.min(FIELD_W_MM, this.robot.x));
    this.robot.y = Math.max(0, Math.min(FIELD_H_MM, this.robot.y));
  }

  // ── SAB sensor snapshot ──────────────────────────────────────────────────────

  _sensorState() {
    const r = this.robot;
    return {
      x:           r.x,
      y:           r.y,
      heading:     r.heading,
      color:       r.sensors.colorValue,
      distance_mm: r.sensors.distanceMM,
      motors:      { ...r.motors },
      stopped:     false,
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

  // ── AABB collision ───────────────────────────────────────────────────────────
  // Treats robot as circle radius 90mm. box = {x,y,w,h} in mm (x/y = top-left).

  _robotOverlapsAABB(robot, box) {
    const closestX = Math.max(box.x, Math.min(robot.x, box.x + box.w));
    const closestY = Math.max(box.y, Math.min(robot.y, box.y + box.h));
    const dx = robot.x - closestX;
    const dy = robot.y - closestY;
    return (dx * dx + dy * dy) <= (90 * 90);
  }

  _sensorPosition(robot) {
    const localY = ROBOT_BODY_H / 2 - 12;  // 88mm from center to color sensor
    const rotRad = (robot.heading + 90) * Math.PI / 180;
    return {
      x: robot.x - localY * Math.sin(rotRad),
      y: robot.y + localY * Math.cos(rotRad),
    };
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

  getDistanceSensorValue()    { return this.robot.sensors.distanceMM; }
  getDistanceSensorPresence() { return this.robot.sensors.distanceMM < 100; }
  getForceSensorValue()       { return 0; }
  getForceSensorPressed()     { return false; }
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
