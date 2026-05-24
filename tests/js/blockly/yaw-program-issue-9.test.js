'use strict';

// End-to-end: the exact four-block program from issue #9 must
//   - block (not return immediately) on `wait until yaw > 90`,
//   - exit the wait_until after the robot has actually rotated 90° CW.
//
// The pre-fix bug: yaw read = 270 immediately after reset → wait_until exited
// on the first tick → motor stopped a frame later → user reported "robot moves
// a little and then stops". After Task 3's fix, the wait should actually block
// until the robot has turned 90° CW.
//
// Mock strategy: the mock Blockly in makeBlocklyEnv is a stub — domToWorkspace
// and workspaceToCode are not implemented (they just record calls). Instead we
// register the real generators via initBlockly(), call them with block stubs,
// and construct the program code manually — exactly the pattern used by the
// generator smoke tests. This is faithful: each line of code is what Blockly
// would emit for the corresponding block in the issue-#9 program.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');
const { createSim } = require('../sim-helper');

// Build the JS code that Blockly would emit for:
//   when program starts
//     set yaw angle to 0
//     A start motor (counterclockwise)
//     wait until hub yaw angle > 90
//
// The hat block (flipperevents_whenProgramStarts) emits '' — it's a top-level
// wrapper that runBlockly handles externally, so we skip it.
function buildIssue9ProgramCode(Blockly, window) {
  const js = Blockly.JavaScript;

  // Block stubs — minimal surface matching getFieldValue / getInputTargetBlock.
  const resetYawBlock = {
    getFieldValue() { return null; },
    getInputTargetBlock() { return null; },
  };

  const motorStartBlock = {
    getFieldValue(name) {
      if (name === 'PORT')      return 'A';
      if (name === 'DIRECTION') return 'counterclockwise';
      return null;
    },
    getInputTargetBlock() { return null; },
  };

  // operator_gt with OPERAND1 = getYaw(), OPERAND2 = 90
  // val() falls back to its default when getInputTargetBlock returns null, so
  // we inject the sub-expressions directly into the wait_until condition.
  const yawCode   = `window.sim.getYaw()`;  // from flippersensors_orientationAxis
  const condition = `(${yawCode} > 90)`;    // from operator_gt

  const waitUntilBlock = {
    getFieldValue() { return null; },
    getInputTargetBlock(name) {
      if (name === 'CONDITION') {
        // Return a stub whose generator emits our condition expression.
        return { _condCode: condition };
      }
      return null;
    },
  };

  // Temporarily override valueToCode so waitUntilBlock's CONDITION slot
  // returns our pre-built expression.
  const origValueToCode = js.valueToCode;
  js.valueToCode = (block, name, _order) => {
    const sub = block.getInputTargetBlock(name);
    if (sub && sub._condCode) return sub._condCode;
    return origValueToCode.call(js, block, name, _order);
  };

  const line1 = js['flippersensors_resetYaw'](resetYawBlock);
  const line2 = js['flippermotor_motorStartDirection'](motorStartBlock);
  const line3 = js['control_wait_until'](waitUntilBlock);

  js.valueToCode = origValueToCode;   // restore

  const assembledBody = line1 + line2 + line3;

  // Use the real generateBlocklyJS() to get the authoritative preamble + body.
  // The function walks top-level blocks and calls js.blockToCode per block; we
  // synthesize a single whenProgramStarts top block whose emitted code is the
  // assembled body (whenProgramStarts is self-registering, so it's inlined
  // verbatim rather than wrapped in `_hats.push(...)`).
  const origBlockToCode = js.blockToCode;
  js.blockToCode = () => assembledBody;
  const fakeWs = {
    getAllVariables: () => [],
    getTopBlocks: () => [{ type: 'flipperevents_whenProgramStarts', outputConnection: null }],
  };
  const code = window.generateBlocklyJS(fakeWs);
  js.blockToCode = origBlockToCode;

  return code;
}

test('issue #9: wait_until does not exit immediately after resetYaw', async () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  // Blockly stub lives at env.Blockly (the vm-context object, not window).
  // The generators are registered on Blockly.JavaScript during initBlockly().
  const Blockly = env.Blockly;

  const code = buildIssue9ProgramCode(Blockly, env.window);

  // Verify the emitted code has the expected shape before running it.
  assert.ok(code.includes('window.sim.resetYaw()'),
    'code should call resetYaw()');
  assert.ok(code.includes("window.sim._animateSingleMotor('A'"),
    'code should start motor A');
  assert.ok(code.includes('window.sim.getYaw() > 90'),
    'wait_until condition should test getYaw() > 90');

  // Run the emitted code against a real sim. Stub motor animation: instead of
  // physically rotating, we drive heading manually on a timer so the wait_until
  // and the (fire-and-forget) motor call interleave deterministically.
  const sim = createSim();
  env.window.sim = sim;
  sim.isRunning = true;

  // Replace _animateSingleMotor with one that simulates a CW pivot at known rate.
  // Treat any non-zero velocity on port A as a CW pivot: left wheel forward,
  // right wheel held → robot turns right = CW = heading decreases in math-y-up.
  // Step heading down by 5° every awaited tick; getYaw() rises by 5° per tick.
  //
  // IMPORTANT: use Promise.resolve() (microtask), not setImmediate (macrotask).
  // The wait_until loop uses `await sim._sleep()` which is also a microtask
  // (sim-helper stubs _sleep = () => Promise.resolve()). If we used setImmediate,
  // the wait_until would spin indefinitely on the microtask queue before the
  // motor's macrotask ever ran.
  sim._animateSingleMotor = async (_port, _velocity, _distMM) => {
    assert.notStrictEqual(_velocity, 0, 'motor stub expected non-zero velocity');
    // 200-step ceiling is a watchdog — prevents an infinite loop if the wait
    // condition fails to release (e.g., if a future bug re-breaks yaw).
    let stepsLeft = 200;
    while (sim.isRunning && stepsLeft-- > 0) {
      sim.robot.heading -= 5;
      await Promise.resolve();
    }
  };

  const startHeading = sim.robot.heading;

  // runBlockly() in production calls `new AsyncFunction(code)` and resolves
  // `window.sim` from the real global. Node's vm context has no `window`
  // global, so we pass it as a named parameter instead. Same observable
  // behavior; different mechanism.
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction('window', code);
  await fn(env.window);

  // CW turn in math-y-up: heading decreases → totalCWturn is positive.
  // After resetYaw() the yaw offset is established at startHeading.
  // The wait_until exits when getYaw() > 90, so the robot must have rotated
  // at least 90° CW before the program completes.
  const totalCWturn = startHeading - sim.robot.heading;
  assert.ok(totalCWturn >= 90,
    `expected at least 90° CW rotation before wait_until released, got ${totalCWturn}° ` +
    `(startHeading=${startHeading}, endHeading=${sim.robot.heading})`);
});
