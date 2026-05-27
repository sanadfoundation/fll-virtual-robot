'use strict';

// Generator-output tests for the rotate / set-orientation Blockly blocks.
// Each emits an _execCmd('hub_orientation', …) call into the AsyncFunction
// the Blockly runtime builds, so we just assert the emitted JS shape.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setup() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env.Blockly.JavaScript;
}

function blockStub(fields) {
  return {
    getFieldValue: (name) => fields[name],
    getInputTargetBlock: () => null,
  };
}

test('flipperlight_lightDisplayRotate (clockwise) emits a rotate command', () => {
  const js  = setup();
  const out = js['flipperlight_lightDisplayRotate'](blockStub({ DIRECTION: 'clockwise' }));
  const code = Array.isArray(out) ? out[0] : out;
  assert.match(code, /type:\s*'hub_orientation'/);
  assert.match(code, /mode:\s*'rotate'/);
  // JSON.stringify emits double quotes; either is fine since the emitted JS
  // is fed to AsyncFunction at runtime.
  assert.match(code, /direction:\s*["']clockwise["']/);
});

test('flipperlight_lightDisplayRotate (counterclockwise) emits direction faithfully', () => {
  const js  = setup();
  const out = js['flipperlight_lightDisplayRotate'](blockStub({ DIRECTION: 'counterclockwise' }));
  const code = Array.isArray(out) ? out[0] : out;
  assert.match(code, /direction:\s*["']counterclockwise["']/);
});

// The Blockly dropdown values for set-orientation are inherited from the
// SPIKE Scratch encoding ('1' upright, '2' left, '3' right, '4' upside down),
// distinct from the Python `orientation.UP/RIGHT/DOWN/LEFT` ints (0..3).
// The generator must translate so the simulator's _execCmd receives the
// Python-side 0..3 (single source of truth in the sim).
const ORIENTATION_MAPPING = [
  { dropdown: '1', label: 'upright',       top: 0 },
  { dropdown: '3', label: 'right',         top: 1 },
  { dropdown: '4', label: 'upside down',   top: 2 },
  { dropdown: '2', label: 'left',          top: 3 },
];

for (const c of ORIENTATION_MAPPING) {
  test(`flipperlight_lightDisplaySetOrientation: '${c.dropdown}' (${c.label}) → top=${c.top}`, () => {
    const js  = setup();
    const out = js['flipperlight_lightDisplaySetOrientation'](
      blockStub({ ORIENTATION: c.dropdown }));
    const code = Array.isArray(out) ? out[0] : out;
    assert.match(code, /type:\s*'hub_orientation'/);
    assert.match(code, /mode:\s*'set'/);
    assert.match(code, new RegExp(`top:\\s*${c.top}\\b`),
      `dropdown '${c.dropdown}' must emit top=${c.top}; got: ${code}`);
  });
}
