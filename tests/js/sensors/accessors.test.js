'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim, createSimWithDocument } = require('../sim-helper');

test('getColorSensorColor: returns robot.sensors.colorValue (default "none")', () => {
  const sim = createSim();
  assert.strictEqual(sim.getColorSensorColor(), 'none');
});

test('getColorSensorColor: reflects robot.sensors.colorValue', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'black';
  assert.strictEqual(sim.getColorSensorColor(), 'black');
});

test('getColorSensorReflection: returns 50 (hardcoded stub)', () => {
  assert.strictEqual(createSim().getColorSensorReflection(), 50);
});

test('getColorSensorAmbient: returns 30 (hardcoded stub)', () => {
  assert.strictEqual(createSim().getColorSensorAmbient(), 30);
});

test('getColorSensorRGB: returns [128, 128, 128]', () => {
  const rgb = createSim().getColorSensorRGB();
  assert.strictEqual(rgb[0], 128);
  assert.strictEqual(rgb[1], 128);
  assert.strictEqual(rgb[2], 128);
  assert.strictEqual(rgb.length, 3);
});

test('getDistanceSensorValue: returns robot.sensors.distanceMM (default 9999, OOR)', () => {
  assert.strictEqual(createSim().getDistanceSensorValue(), 9999);
});

test('getDistanceSensorValue: reflects updated distanceMM', () => {
  const sim = createSim();
  sim.robot.sensors.distanceMM = 50;
  assert.strictEqual(sim.getDistanceSensorValue(), 50);
});

test('getDistanceSensorPresence: false when distanceMM >= 100', () => {
  const sim = createSim();
  assert.strictEqual(sim.getDistanceSensorPresence(), false);
});

test('getDistanceSensorPresence: true when distanceMM < 100', () => {
  const sim = createSim();
  sim.robot.sensors.distanceMM = 99;
  assert.strictEqual(sim.getDistanceSensorPresence(), true);
});

test('robot.sensors.distanceHit: defaults to null', () => {
  assert.strictEqual(createSim().robot.sensors.distanceHit, null);
});

test('robot.sensors.distanceOrigin: defaults to null', () => {
  assert.strictEqual(createSim().robot.sensors.distanceOrigin, null);
});

test('getForceSensorValue: returns 0 when forceN is 0', () => {
  assert.strictEqual(createSim().getForceSensorValue(), 0);
});

test('getForceSensorValue: 5 N → 50 dN', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 5;
  assert.strictEqual(sim.getForceSensorValue(), 50);
});

test('getForceSensorValue: 12 N over-range clamps to 100 dN', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 12;
  assert.strictEqual(sim.getForceSensorValue(), 100);
});

test('getForceSensorPressed: false below 0.5 N', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 0.49;
  assert.strictEqual(sim.getForceSensorPressed(), false);
});

test('getForceSensorPressed: true at and above 0.5 N', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 0.5;
  assert.strictEqual(sim.getForceSensorPressed(), true);
});

test('getForceSensorRaw: 0 N → 0', () => {
  assert.strictEqual(createSim().getForceSensorRaw(), 0);
});

test('getForceSensorRaw: 10 N → 4095 (clamp)', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 10;
  assert.strictEqual(sim.getForceSensorRaw(), 4095);
});

test('getForceSensorRaw: 0.5 N → ~205', () => {
  const sim = createSim();
  sim.robot.sensors.forceN = 0.5;
  const raw = sim.getForceSensorRaw();
  assert.ok(raw >= 200 && raw <= 210, `raw=${raw}`);
});

test('getMotorSpeed: returns 0 for any port', () => {
  const sim = createSim();
  assert.strictEqual(sim.getMotorSpeed('A'), 0);
  assert.strictEqual(sim.getMotorSpeed('F'), 0);
});

test('getMotorPosition: returns 0 for unpaired port', () => {
  assert.strictEqual(createSim().getMotorPosition('A'), 0);
});

test('getColorSensorColorInt: returns -1 for "none" (default)', () => {
  assert.strictEqual(createSim().getColorSensorColorInt(), -1);
});

test('getColorSensorColorInt: returns 0 for "black"', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'black';
  assert.strictEqual(sim.getColorSensorColorInt(), 0);
});

test('getColorSensorColorInt: returns 9 for "red"', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'red';
  assert.strictEqual(sim.getColorSensorColorInt(), 9);
});

test('getColorSensorColorInt: returns 6 for "green"', () => {
  const sim = createSim();
  sim.robot.sensors.colorValue = 'green';
  assert.strictEqual(sim.getColorSensorColorInt(), 6);
});

test('units: defaults to "cm"', () => {
  assert.strictEqual(createSim().units, 'cm');
});

test('setUnits: assigns the new unit and marks _dirty', () => {
  const sim = createSim();
  sim._dirty = false;
  sim.setUnits('mm');
  assert.strictEqual(sim.units, 'mm');
  assert.strictEqual(sim._dirty, true);
});

test('_updateSensorPanel: Yaw Change reads sim.getYaw(), signed degrees', () => {
  const { sim, document } = createSimWithDocument();
  const elMap = {};
  const fakeEl = (id) => { elMap[id] = elMap[id] || { textContent: '', style: {} }; return elMap[id]; };
  document.getElementById = (id) => fakeEl(id);

  // Spawn heading = 90; constructor seeds yawZero to 90 → getYaw() = 0.
  sim._updateSensorPanel();
  assert.strictEqual(elMap['sp-yaw'].textContent, '0°');

  // 30° CW from reset (heading decreases in math-y-up) → yaw +30.
  sim.robot.heading = 60;
  sim._updateSensorPanel();
  assert.strictEqual(elMap['sp-yaw'].textContent, '30°');

  // 30° CCW from reset → yaw -30.
  sim.robot.heading = 120;
  sim._updateSensorPanel();
  assert.strictEqual(elMap['sp-yaw'].textContent, '-30°');
});

test('_updateSensorPanel: X/Y formatted via formatPosition(this.units)', () => {
  const { sim, document } = createSimWithDocument();
  sim.robot.x = 980;
  sim.robot.y = 254;

  // Build a minimal element map and wire it into the harness document.
  const elMap = {};
  const fakeEl = (id) => { elMap[id] = elMap[id] || { textContent: '', style: {} }; return elMap[id]; };
  document.getElementById = (id) => fakeEl(id);

  sim.setUnits('mm');
  sim._updateSensorPanel();
  assert.strictEqual(elMap['sp-x'].textContent, '980 mm');
  assert.strictEqual(elMap['sp-y'].textContent, '254 mm');

  sim.setUnits('in');
  sim._updateSensorPanel();
  assert.strictEqual(elMap['sp-x'].textContent, '38.6 in');
  assert.strictEqual(elMap['sp-y'].textContent, '10.0 in');
});

test('_drawRuler: reads this.units for tick pitch and label format', () => {
  const sim = createSim();
  sim.setUnits('in');
  // Stand in a fake ctx that records ops and label texts.
  const calls = [];
  const fakeCtx = new Proxy({
    save: () => calls.push({ op: 'save' }),
    restore: () => calls.push({ op: 'restore' }),
  }, {
    get(t, k) { if (k in t) return t[k]; return (...a) => calls.push({ op: k, args: a }); },
    set() { return true; },
  });
  sim._drawRuler(fakeCtx, 1);
  // The rendered text labels should include " in" suffix (origin or some major).
  const labels = calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(labels.some(t => / in$/.test(t)),
    `expected at least one tick label to end with " in", got: ${labels.join(', ')}`);
});
