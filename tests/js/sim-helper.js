'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { makeWindowGlobals } = require('./mocks/window');
const { TextEncoder, TextDecoder } = require('util');

const KINEMATICS_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/kinematics.js'), 'utf8',
);
const FORCE_SENSOR_LOGIC_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/force_sensor_logic.js'), 'utf8',
);
const RULER_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/ruler.js'), 'utf8',
);
const FIELD_SWAP_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/mission_field_swap.js'), 'utf8',
);
const SIM_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/simulator.js'), 'utf8',
);

function createSimWithDocument(windowOverrides) {
  const { window, document } = makeWindowGlobals();
  Object.assign(window, windowOverrides || {});

  const context = vm.createContext({
    window, document,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame:  () => {},
    CanvasRenderingContext2D: { prototype: {} },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    TextEncoder, TextDecoder,
    performance: { now: () => Date.now() },
  });

  vm.runInContext(KINEMATICS_CODE, context);
  // In real browsers `this` at script top-level is window; in vm contexts it's
  // the context object itself, so the UMD assigns to `context.kinematics`
  // rather than `context.window.kinematics`. Bridge them.
  context.window.kinematics = context.kinematics;
  vm.runInContext(FORCE_SENSOR_LOGIC_CODE, context);
  context.window.forceSensorLogic = context.forceSensorLogic;
  vm.runInContext(RULER_CODE, context);
  context.window.ruler = context.ruler;
  vm.runInContext(FIELD_SWAP_CODE, context);
  // mission_field_swap UMD wrapper writes to `window.MISSIONS.fieldSwap` —
  // the sim's _colorAtPosition delegates here.
  context.window.MISSIONS = context.window.MISSIONS || context.MISSIONS;
  vm.runInContext(SIM_CODE, context);

  const sim = new context.window.RobotSimulator('robot-canvas');
  sim._sleep = () => Promise.resolve();
  return { sim, document };
}

function createSim(windowOverrides) {
  return createSimWithDocument(windowOverrides).sim;
}

module.exports = { createSim, createSimWithDocument };
