'use strict';

const { makeCanvas } = require('./canvas');

function makeWindowGlobals() {
  const canvas = makeCanvas();
  const fakeEl = () => ({ textContent: '', className: '', style: {} });

  const window = {
    addEventListener: () => {},
    RobotSimulator: null,   // set by simulator.js at end of file
    appendOutput:   () => {},
    AudioContext:   null,
    webkitAudioContext: null,
  };

  const document = {
    getElementById: (id) => id === 'robot-canvas' ? canvas : fakeEl(),
  };

  return { window, document, canvas };
}

module.exports = { makeWindowGlobals };
