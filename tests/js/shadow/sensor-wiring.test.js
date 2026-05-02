'use strict';

// Integration tests verifying that sensor accessors read from shadowRobot,
// that resetShadow() seeds the shadow from the actual robot position,
// and that shadowCmd() updates the shadow sensor after movement.

module.exports = [
  // ── getColorSensorColor reads from shadowRobot ────────────────────────────
  {
    name: 'getColorSensorColor: default returns "none" (shadow sensor at initial position)',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim.getColorSensorColor(), 'none');
    },
  },
  {
    name: 'getColorSensorColor: reads shadowRobot.sensors.colorValue, not robot.sensors.colorValue',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'black';
      sim.robot.sensors.colorValue = 'red'; // must be ignored
      assert.strictEqual(sim.getColorSensorColor(), 'black');
    },
  },

  // ── resetShadow seeds shadow sensor from robot position ───────────────────
  {
    name: 'resetShadow: robot positioned so sensor is on midfield line → "black"',
    fn(createSim, assert) {
      // Sensor is 88mm south at heading -90. For sensor.y=680: robot.y = 592.
      const sim = createSim();
      sim.robot.x = 1000; sim.robot.y = 592; sim.robot.heading = -90;
      sim.resetShadow();
      assert.strictEqual(sim.getColorSensorColor(), 'black');
    },
  },
  {
    name: 'resetShadow: initial robot position sensor is off all lines → "none"',
    fn(createSim, assert) {
      // Default (350, 980, -90): sensor at y=1068 — 68mm from launch line at y=1000.
      const sim = createSim();
      sim.resetShadow();
      assert.strictEqual(sim.getColorSensorColor(), 'none');
    },
  },

  // ── shadowCmd full pipeline: movement → sensor update ─────────────────────
  {
    name: 'shadowCmd: moving so sensor reaches midfield line → getColorSensorColor returns "black"',
    fn(createSim, assert) {
      // From (350, 980, -90°), sensor at y=1068. Need to travel ~388mm north.
      // 388mm ÷ WHEEL_CIRC(175.93mm) × 360° ≈ 795°.
      const sim = createSim();
      sim.resetShadow();
      sim.shadowCmd(JSON.stringify({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 795, unit: 'degrees',
      }));
      assert.strictEqual(sim.getColorSensorColor(), 'black');
    },
  },
  {
    name: 'shadowCmd: short move that keeps sensor off all lines → "none"',
    fn(createSim, assert) {
      // 41° ≈ 20mm forward: sensor moves from y=1068 to y=1048 — 48mm from launch line.
      const sim = createSim();
      sim.resetShadow();
      sim.shadowCmd(JSON.stringify({
        type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 41, unit: 'degrees',
      }));
      assert.strictEqual(sim.getColorSensorColor(), 'none');
    },
  },

  // ── getColorSensorReflection maps shadow color to reflectance ─────────────
  {
    name: 'getColorSensorReflection: "black" → low value (≤ 20)',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'black';
      assert.ok(sim.getColorSensorReflection() <= 20, `got ${sim.getColorSensorReflection()}`);
    },
  },
  {
    name: 'getColorSensorReflection: "white" → high value (≥ 80)',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'white';
      assert.ok(sim.getColorSensorReflection() >= 80, `got ${sim.getColorSensorReflection()}`);
    },
  },
  {
    name: 'getColorSensorReflection: "none" → 50',
    fn(createSim, assert) {
      const sim = createSim();
      // default shadowRobot.sensors.colorValue = 'none'
      assert.strictEqual(sim.getColorSensorReflection(), 50);
    },
  },

  // ── getColorSensorRGB maps shadow color to RGB ────────────────────────────
  {
    name: 'getColorSensorRGB: "red" → high R, low G, low B',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'red';
      const [r, g, b] = sim.getColorSensorRGB();
      assert.ok(r > 150, `R=${r}`);
      assert.ok(g < 100, `G=${g}`);
      assert.ok(b < 100, `B=${b}`);
    },
  },
  {
    name: 'getColorSensorRGB: "none" → [128, 128, 128]',
    fn(createSim, assert) {
      const sim = createSim();
      // default: 'none'
      const rgb = sim.getColorSensorRGB();
      assert.strictEqual(rgb[0], 128);
      assert.strictEqual(rgb[1], 128);
      assert.strictEqual(rgb[2], 128);
    },
  },

  // ── getMotorPosition reads from shadowRobot ───────────────────────────────
  {
    name: 'getMotorPosition: returns shadowRobot motor degrees, not robot motor',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.motors['A'] = 720;
      sim.robot.motors['A'] = 0;
      assert.strictEqual(sim.getMotorPosition('A'), 720);
    },
  },

  // ── _animateTank updates robot.sensors.colorValue live during playback ─────
  {
    name: '_animateTank: robot.sensors.colorValue reflects position after move across midfield line',
    async fn(createSim, assert) {
      // Start at y=700 (sensor at 788). Move 108mm north → y=592 (sensor at 680, on midfield).
      const sim = createSim();
      sim.robot.x = 1000; sim.robot.y = 700; sim.robot.heading = -90;
      sim.isRunning = true;
      await sim._animateTank(1, 1, 108);
      assert.strictEqual(sim.robot.sensors.colorValue, 'black');
    },
  },

  // ── reset() also clears shadowRobot ───────────────────────────────────────
  {
    name: 'reset(): resets shadowRobot to initial state',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.x = 9999;
      sim.shadowRobot.sensors.colorValue = 'black';
      sim.shadowPairMap[0] = { left: 'A', right: 'B' };
      sim.reset();
      assert.strictEqual(sim.shadowRobot.x, 350);
      assert.strictEqual(sim.shadowRobot.y, 980);
      assert.strictEqual(sim.shadowRobot.sensors.colorValue, 'none');
      assert.strictEqual(Object.keys(sim.shadowPairMap).length, 0);
    },
  },
];
