'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { makeWindowGlobals } = require('./mocks/window');
const { TextEncoder, TextDecoder } = require('util');

const KINEMATICS_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/kinematics.js'), 'utf8',
);
const RULER_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/ruler.js'), 'utf8',
);
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

  vm.runInContext(KINEMATICS_CODE, context);
  // In real browsers `this` at script top-level is window; in vm contexts it's
  // the context object itself, so the UMD assigns to `context.kinematics`
  // rather than `context.window.kinematics`. Bridge them.
  context.window.kinematics = context.kinematics;
  vm.runInContext(RULER_CODE, context);
  context.window.ruler = context.ruler;
  vm.runInContext(SIM_CODE, context);

  const sim = new context.window.RobotSimulator('robot-canvas');
  sim._sleep = () => Promise.resolve();
  return sim;
}

module.exports = { createSim };
