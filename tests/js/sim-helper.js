'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { makeWindowGlobals } = require('./mocks/window');
const { TextEncoder, TextDecoder } = require('util');

const SIM_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/simulator.js'), 'utf8',
);

function createSim(windowOverrides) {
  const { window, document } = makeWindowGlobals();
  Object.assign(window, windowOverrides || {});

  const context = vm.createContext({
    window, document,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame:  () => {},
    CanvasRenderingContext2D: { prototype: {} },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder,
  });

  vm.runInContext(SIM_CODE, context);

  const sim = new context.window.RobotSimulator('robot-canvas');
  sim._sleep = () => Promise.resolve();
  return sim;
}

module.exports = { createSim };
