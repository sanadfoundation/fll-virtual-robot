'use strict';

// Regression for the BACKLOG / audit 2026-05-13 follow-up entry on
// flippermotor_motorStop granularity. The block has a PORT field but the
// generator used to emit `window.sim.stop()` — which sets isRunning=false
// and kills the entire program. The fix: emit a port-targeted stop so any
// concurrent motor (not named) keeps running.
//
// Issue #47 update: the generator now emits sim._motorStopAndAwait(port),
// which signals abort on the matching port AND waits for the background
// motion to actually unwind before the next block runs.

const test = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupGenerators() {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  return env;
}

test('flippermotor_motorStop generator scopes to the chosen PORT', () => {
  const { Blockly } = setupGenerators();
  const block = {
    getFieldValue: (name) => (name === 'PORT' ? 'C' : null),
    getInputTargetBlock: () => null,
  };
  const gen = Blockly.JavaScript['flippermotor_motorStop'];
  const code = gen(block);
  // Must NOT call sim.stop() (kills whole program).
  assert.ok(!code.includes('sim.stop()'),
    `motorStop generator must not call sim.stop() — it kills the whole sim. Got: ${code}`);
  // Must route through _motorStopAndAwait so the program waits for unwind.
  assert.ok(code.includes('_motorStopAndAwait'),
    `motorStop generator must emit _motorStopAndAwait. Got: ${code}`);
  // Must be awaited — otherwise the next block runs before the background
  // motion has terminated.
  assert.ok(code.trimStart().startsWith('await '),
    `motorStop generator must await the call. Got: ${code}`);
  assert.ok(code.includes("'C'") || code.includes('"C"'),
    `motorStop generator must pass the chosen PORT. Got: ${code}`);
});
