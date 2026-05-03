'use strict';

// Characterize sensor accessor stubs — they return hardcoded values and correct types.

module.exports = [
  {
    name: 'getColorSensorColor: returns shadowRobot.sensors.colorValue (default "none")',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim.getColorSensorColor(), 'none');
    },
  },
  {
    name: 'getColorSensorColor: reflects shadowRobot.sensors.colorValue',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'black';
      assert.strictEqual(sim.getColorSensorColor(), 'black');
    },
  },
  {
    name: 'getColorSensorReflection: returns 50 (hardcoded stub)',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getColorSensorReflection(), 50);
    },
  },
  {
    name: 'getColorSensorAmbient: returns 30 (hardcoded stub)',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getColorSensorAmbient(), 30);
    },
  },
  {
    name: 'getColorSensorRGB: returns [128, 128, 128]',
    fn(createSim, assert) {
      const rgb = createSim().getColorSensorRGB();
      assert.strictEqual(rgb[0], 128);
      assert.strictEqual(rgb[1], 128);
      assert.strictEqual(rgb[2], 128);
      assert.strictEqual(rgb.length, 3);
    },
  },
  {
    name: 'getDistanceSensorValue: returns robot.sensors.distanceMM (default 300)',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getDistanceSensorValue(), 300);
    },
  },
  {
    name: 'getDistanceSensorValue: reflects updated distanceMM',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.sensors.distanceMM = 50;
      assert.strictEqual(sim.getDistanceSensorValue(), 50);
    },
  },
  {
    name: 'getDistanceSensorPresence: false when distanceMM >= 100',
    fn(createSim, assert) {
      const sim = createSim(); // default 300mm
      assert.strictEqual(sim.getDistanceSensorPresence(), false);
    },
  },
  {
    name: 'getDistanceSensorPresence: true when distanceMM < 100',
    fn(createSim, assert) {
      const sim = createSim();
      sim.robot.sensors.distanceMM = 99;
      assert.strictEqual(sim.getDistanceSensorPresence(), true);
    },
  },
  {
    name: 'getForceSensorValue: returns 0',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getForceSensorValue(), 0);
    },
  },
  {
    name: 'getForceSensorPressed: returns false',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getForceSensorPressed(), false);
    },
  },
  {
    name: 'getMotorSpeed: returns 0 for any port',
    fn(createSim, assert) {
      const sim = createSim();
      assert.strictEqual(sim.getMotorSpeed('A'), 0);
      assert.strictEqual(sim.getMotorSpeed('F'), 0);
    },
  },
  {
    name: 'getMotorPosition: returns 0 for unpaired port',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getMotorPosition('A'), 0);
    },
  },
  {
    name: 'getColorSensorColorInt: returns -1 for "none" (default)',
    fn(createSim, assert) {
      assert.strictEqual(createSim().getColorSensorColorInt(), -1);
    },
  },
  {
    name: 'getColorSensorColorInt: returns 0 for "black"',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'black';
      assert.strictEqual(sim.getColorSensorColorInt(), 0);
    },
  },
  {
    name: 'getColorSensorColorInt: returns 9 for "red"',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'red';
      assert.strictEqual(sim.getColorSensorColorInt(), 9);
    },
  },
  {
    name: 'getColorSensorColorInt: returns 6 for "green"',
    fn(createSim, assert) {
      const sim = createSim();
      sim.shadowRobot.sensors.colorValue = 'green';
      assert.strictEqual(sim.getColorSensorColorInt(), 6);
    },
  },
];
