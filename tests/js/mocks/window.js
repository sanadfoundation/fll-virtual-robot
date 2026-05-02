'use strict';

const { makeCanvas } = require('./canvas');

function makeWindowGlobals() {
  const canvas = makeCanvas();
  const fakeEl = () => ({ textContent: '', className: '', style: {} });

  const window = {
    addEventListener: () => {},
    RobotSimulator: null,   // set by simulator.js at end of file
    getColorSensorColor:        () => 'none',
    getColorSensorReflection:   () => 50,
    getColorSensorAmbient:      () => 30,
    getColorSensorRGB:          () => [128, 128, 128],
    getDistanceSensorValue:     () => 300,
    getDistanceSensorPresence:  () => false,
    getForceSensorValue:        () => 0,
    getForceSensorPressed:      () => false,
    getMotorSpeed:              () => 0,
    getMotorPosition:           () => 0,
    receiveCommands:            () => {},
    appendOutput:               () => {},
    AudioContext:               null,
    webkitAudioContext:         null,
  };

  const document = {
    getElementById: (id) => id === 'robot-canvas' ? canvas : fakeEl(),
  };

  return { window, document, canvas };
}

module.exports = { makeWindowGlobals };
