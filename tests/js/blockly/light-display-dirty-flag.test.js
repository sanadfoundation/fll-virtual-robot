'use strict';

// Regression test: the six Blockly LED-matrix mutator generators bypass
// _execCmd and write to window.sim.robot.display (or call _showText) directly,
// so they must mark the simulator dirty themselves — otherwise the draw loop
// only repaints when an unrelated _execCmd call happens to flip the flag, and
// the LED pattern stays invisible (or stale) until then.
//
// Reproducer from the user's program:
//   when program starts → turn on … 2s → rotate → turn on … 2s →
//     set centre button light to blue → turn on … 2s → set orientation
// Only the third "turn on" rendered, because block 4 (set centre button)
// flipped _dirty=true and the next animation frame redrew with whatever
// display state was current at that moment.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

// Generators that mutate the LED matrix and must flip _dirty themselves.
// Paired with a minimal block stub (only the fields each generator reads).
const CASES = [
  {
    type:   'flipperlight_lightDisplayImageOnForTime',
    fields: { MATRIX: '1'.repeat(25), VALUE: '2' },
  },
  {
    type:   'flipperlight_lightDisplayImageOn',
    fields: { MATRIX: '1'.repeat(25) },
  },
  {
    type:   'flipperlight_lightDisplayText',
    fields: { TEXT: 'Hi' },
  },
  {
    type:   'flipperlight_lightDisplayOff',
    fields: {},
  },
  {
    type:   'flipperlight_lightDisplaySetBrightness',
    fields: { BRIGHTNESS: '75' },
  },
  {
    type:   'flipperlight_lightDisplaySetPixel',
    fields: { X: '1', Y: '1', BRIGHTNESS: '100' },
  },
];

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

for (const c of CASES) {
  test(`${c.type}: marks the sim dirty so the canvas repaints`, () => {
    const js  = setup();
    const gen = js[c.type];
    assert.strictEqual(typeof gen, 'function',
      `${c.type} should be a registered generator`);
    const out = gen(blockStub(c.fields));
    const code = Array.isArray(out) ? out[0] : out;
    assert.match(code, /window\.sim\._dirty\s*=\s*true/,
      `${c.type} must set window.sim._dirty = true; got: ${code}`);
  });
}
