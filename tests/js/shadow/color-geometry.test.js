'use strict';

// Tests for the pure-geometry helpers: _pointToLineDist, _sensorPosition,
// and _colorAtPosition (which reads sensorColor from FIELD_OBJECTS).

const EPS_PX = 0.01; // mm precision for geometry

function close(a, b, tol) { return Math.abs(a - b) <= tol; }

module.exports = [
  // ── _pointToLineDist ─────────────────────────────────────────────────────────
  {
    name: '_pointToLineDist: point on line → 0',
    fn(createSim, assert) {
      const sim = createSim();
      assert.ok(close(sim._pointToLineDist(50, 0, 0, 0, 100, 0), 0, EPS_PX));
    },
  },
  {
    name: '_pointToLineDist: perpendicular from above horizontal line',
    fn(createSim, assert) {
      const sim = createSim();
      assert.ok(close(sim._pointToLineDist(50, 10, 0, 0, 100, 0), 10, EPS_PX));
    },
  },
  {
    name: '_pointToLineDist: point past end of line → distance to endpoint',
    fn(createSim, assert) {
      const sim = createSim();
      assert.ok(close(sim._pointToLineDist(150, 0, 0, 0, 100, 0), 50, EPS_PX));
    },
  },
  {
    name: '_pointToLineDist: point before start of line → distance to start',
    fn(createSim, assert) {
      const sim = createSim();
      assert.ok(close(sim._pointToLineDist(-10, 0, 0, 0, 100, 0), 10, EPS_PX));
    },
  },

  // ── _sensorPosition ──────────────────────────────────────────────────────────
  // The color sensor is at local (0, 88mm) from robot center.
  // world = rotate(local, heading+90°) + robot_center.
  {
    name: '_sensorPosition: heading -90 (north) → sensor 88mm south of center',
    fn(createSim, assert) {
      const sim = createSim();
      const pos = sim._sensorPosition({ x: 350, y: 980, heading: -90 });
      assert.ok(close(pos.x, 350, 0.1), `x=${pos.x}`);
      assert.ok(close(pos.y, 1068, 0.1), `y=${pos.y}`); // 980 + 88
    },
  },
  {
    name: '_sensorPosition: heading 0 (east) → sensor 88mm west of center',
    fn(createSim, assert) {
      const sim = createSim();
      const pos = sim._sensorPosition({ x: 350, y: 980, heading: 0 });
      assert.ok(close(pos.x, 262, 0.1), `x=${pos.x}`); // 350 - 88
      assert.ok(close(pos.y, 980, 0.1), `y=${pos.y}`);
    },
  },
  {
    name: '_sensorPosition: heading 90 (south) → sensor 88mm north of center',
    fn(createSim, assert) {
      const sim = createSim();
      const pos = sim._sensorPosition({ x: 350, y: 980, heading: 90 });
      assert.ok(close(pos.x, 350, 0.1), `x=${pos.x}`);
      assert.ok(close(pos.y, 892, 0.1), `y=${pos.y}`); // 980 - 88
    },
  },

  // ── _colorAtPosition ─────────────────────────────────────────────────────────
  // Depends on FIELD_OBJECTS having sensorColor set on relevant elements.
  {
    name: '_colorAtPosition: midfield line at y=680 → "black"',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(1000, 680), 'black');
    },
  },
  {
    name: '_colorAtPosition: launch line segment (y=1000, x=300) → "black"',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(300, 1000), 'black');
    },
  },
  {
    name: '_colorAtPosition: past launch line end (x=900, y=1000) → "none"',
    fn(createSim, assert) {
      // Launch line ends at x=680; x=900 is 220mm beyond → outside 20mm detection radius.
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(900, 1000), 'none');
    },
  },
  {
    name: '_colorAtPosition: yellow mission area center → "yellow"',
    fn(createSim, assert) {
      // Rect x:900..1100, y:100..300
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(1000, 200), 'yellow');
    },
  },
  {
    name: '_colorAtPosition: green mission area center → "green"',
    fn(createSim, assert) {
      // Rect x:1600..1800, y:100..300
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(1700, 200), 'green');
    },
  },
  {
    name: '_colorAtPosition: red mission area center → "red"',
    fn(createSim, assert) {
      // Rect x:1900..2100, y:700..900
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(2000, 800), 'red');
    },
  },
  {
    name: '_colorAtPosition: open field far from any element → "none"',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim._colorAtPosition(1000, 400), 'none');
    },
  },
];
