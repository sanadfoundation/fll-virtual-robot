'use strict';

// Regression for the BACKLOG / audit 2026-05-13 follow-up entry on
// flippermotor_motorStop granularity. The block has a PORT field but the
// generator used to emit `window.sim.stop()` — which sets isRunning=false
// and kills the entire program. The fix: emit a port-targeted motor_stop
// so any concurrent motor (not named) keeps running.

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
  // Must scope to the chosen PORT via motor_stop command.
  assert.ok(code.includes("type:'motor_stop'") || code.includes('"motor_stop"'),
    `motorStop generator must emit a motor_stop command. Got: ${code}`);
  assert.ok(code.includes("'C'") || code.includes('"C"'),
    `motorStop generator must pass the chosen PORT. Got: ${code}`);
});
