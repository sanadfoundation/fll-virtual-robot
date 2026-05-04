'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const assert = require('assert');
const { makeWindowGlobals } = require('./mocks/window');
const { TextEncoder, TextDecoder } = require('util');

const SIM_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/simulator.js'), 'utf8'
);

// Build a fresh RobotSimulator in a Node vm context with all browser globals mocked.
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
    // V8 built-ins (Math, Promise, Array, Int32Array, Uint8Array…) available automatically.
  });

  vm.runInContext(SIM_CODE, context);

  // simulator.js exports via `window.RobotSimulator = RobotSimulator`
  const sim = new context.window.RobotSimulator('robot-canvas');
  // Make animations instant so tests do not time out.
  sim._sleep = () => Promise.resolve();
  return sim;
}

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function runSuite(label, tests) {
  console.log(`\n--- ${label} ---`);
  for (const { name, fn } of tests) {
    try {
      await fn(createSim, assert);
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }
}

const SUITES = [
  ['physics/conversions',       './physics/conversions.test.js'],
  ['physics/tank-math',         './physics/tank-math.test.js'],
  ['physics/aabb',              './physics/aabb.test.js'],
  ['physics/collision',         './physics/collision.test.js'],
  ['commands/dispatch',         './commands/dispatch.test.js'],
  ['sensors/accessors',         './sensors/accessors.test.js'],
  ['state/reset',               './state/reset.test.js'],
  ['state/sensor-state',        './state/sensor-state.test.js'],
  ['bridge/protocol',           './bridge/bridge-protocol.test.js'],
];

(async () => {
  for (const [label, relPath] of SUITES) {
    const suite = require(relPath);
    await runSuite(label, suite);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
