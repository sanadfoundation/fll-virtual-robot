'use strict';

// Run/stop/reset pipeline tests for js/main.js. These exercise the surface
// reachable without a real PyScript worker — the warn/early-return branches
// of handleRun, runPython, runBlockly, handleStop, and the setButtons helper.
// The Python happy path (postMessage to _pyWorker) is not tested here; that
// requires worker mocking that doesn't exist in main-env yet.

const test   = require('node:test');
const assert = require('node:assert');
const { makeMainEnv } = require('../mocks/main-env');

function consoleLines(elementsById) {
  // appendOutput appends <span class="line ..."> + <br> pairs to console-output.
  const out = elementsById['console-output'];
  return out.children.map(c => c.textContent || '');
}

// ── setButtons (directly callable) ──────────────────────────────────────────

test('setButtons(true): disables run, enables stop', () => {
  const { context, elementsById } = makeMainEnv();
  context.setButtons(true);
  assert.strictEqual(elementsById['btn-run'].disabled,  true);
  assert.strictEqual(elementsById['btn-stop'].disabled, false);
});

test('setButtons(false): enables run, disables stop', () => {
  const { context, elementsById } = makeMainEnv();
  context.setButtons(false);
  assert.strictEqual(elementsById['btn-run'].disabled,  false);
  assert.strictEqual(elementsById['btn-stop'].disabled, true);
});

// ── handleRun: sim missing → no-op ─────────────────────────────────────────

test('handleRun: no-op when sim is null (default state)', async () => {
  const { context, elementsById } = makeMainEnv();
  // Default state: initSim() has not been called → script-local `sim` is null.
  await context.handleRun();
  // No output should be written, no buttons toggled.
  assert.strictEqual(consoleLines(elementsById).length, 0);
});

// ── runPython: pyReady=false → warns and returns ───────────────────────────

test('runPython: warns when Python runtime is not ready', async () => {
  const { context, elementsById } = makeMainEnv();
  context.initSim();
  await context.runPython();
  const lines = consoleLines(elementsById);
  assert.ok(lines.length >= 1, 'expected a warning line');
  assert.match(lines[0], /Python runtime not ready/i);
});

// ── runBlockly: workspace missing → warns ──────────────────────────────────

test('runBlockly: warns when Blockly workspace is not initialized', async () => {
  const { context, elementsById } = makeMainEnv();
  context.initSim();
  await context.runBlockly();
  const lines = consoleLines(elementsById);
  assert.ok(lines.length >= 1);
  assert.match(lines[0], /Blockly not initialized/i);
});

test('runBlockly: warns when workspace exists but generated code is empty', async () => {
  const calls = { msgs: [] };
  const { context, elementsById, window } = makeMainEnv({
    initBlockly: () => ({ addChangeListener: () => {} }),
  });
  // Override generateBlocklyJS to return an empty string.
  window.generateBlocklyJS = () => '   \n  ';
  context.initSim();
  // Force initBlocklyWorkspace to set blocklyWs (calls window.initBlockly we mocked).
  context.initBlocklyWorkspace();

  await context.runBlockly();
  const lines = consoleLines(elementsById);
  // Last line should be the "no blocks" warn.
  assert.ok(lines.some(l => /No blocks to run/i.test(l)),
    `expected 'No blocks' warn, got: ${JSON.stringify(lines)}`);
});

// ── runBlockly: drains fire-and-forget motion before flipping isRunning ────
//
// A solo "start motor" Blockly program emits a fire-and-forget call into
// sim._animateSingleMotor — the AsyncFunction body has nothing else to
// `await`, so fn() returns immediately. Without the drain loop, runBlockly's
// finally flips isRunning=false right then, killing the background motion
// before the user sees the motor spin. The drain loops on sim._motionPromise
// until the motion ends (Stop button → isRunning=false) or naturally clears.

test('runBlockly: waits for fire-and-forget motion before tearing down isRunning', async () => {
  let resolveMotion;
  const motionPromise = new Promise((r) => { resolveMotion = r; });

  const { context, window, elementsById } = makeMainEnv({
    initBlockly: () => ({
      addChangeListener: () => {},
      getTopBlocks: () => [{}],  // non-empty so runBlockly proceeds past the "no blocks" guard
    }),
  });
  context.initSim();
  context.initBlocklyWorkspace();

  // Generated code: a fire-and-forget call that sets _motionPromise on the
  // sim. runBlockly's drain loop should then wait on that promise.
  window.installMotionPromise = function () {
    window.sim._motionPromise = motionPromise;
  };
  window.generateBlocklyJS = () => 'window.installMotionPromise();';
  // Pre-seed sim slots the drain loop reads.
  window.sim._motionPromise = null;

  const runP = context.runBlockly();

  // Yield enough microtasks for fn() to run and the drain loop to enter
  // its await. runBlockly should NOT have hit its finally yet.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const lines = consoleLines(elementsById);
  assert.strictEqual(window.sim.isRunning, true,
    `runBlockly should be draining; isRunning=${window.sim.isRunning}; lines=${JSON.stringify(lines)}`);

  // Simulate Stop button: isRunning=false + resolve the motion's promise.
  window.sim.isRunning = false;
  // Clear _motionPromise so the next while-check exits.
  window.sim._motionPromise = null;
  resolveMotion();
  await runP;

  assert.strictEqual(window.sim.isRunning, false,
    'runBlockly should flip isRunning=false in finally after drain');
});

test('runBlockly: exits immediately when fn() leaves no motion in flight', async () => {
  const { context, window } = makeMainEnv({
    initBlockly: () => ({ addChangeListener: () => {} }),
  });
  context.initSim();
  context.initBlocklyWorkspace();

  // Generated code that does nothing → fn() returns immediately and
  // _motionPromise stays null. The drain loop must not block.
  window.generateBlocklyJS = () => '/* no-op */';
  window.sim.isRunning = false;
  window.sim._motionPromise = null;

  await context.runBlockly();

  assert.strictEqual(window.sim.isRunning, false);
});

// ── handleStop: toggles sim flags and logs '[Stopped]' ─────────────────────

test('handleStop: sets _stopRequested and isRunning=false on the sim', () => {
  const { context, window } = makeMainEnv();
  context.initSim();
  // initSim sets window.sim (and the script-local sim) to a stub from
  // window.RobotSimulator. The stub has _stopRequested/isRunning slots if we
  // pre-seed them; the makeMainEnv default RobotSimulator is minimal.
  // Pre-seed by reaching through window.sim.
  window.sim._stopRequested = false;
  window.sim.isRunning      = true;

  context.handleStop();

  assert.strictEqual(window.sim._stopRequested, true);
  assert.strictEqual(window.sim.isRunning,      false);
});

test('handleStop: disables stop button (running=false)', () => {
  const { context, elementsById } = makeMainEnv();
  context.initSim();
  context.handleStop();
  assert.strictEqual(elementsById['btn-stop'].disabled, true);
  assert.strictEqual(elementsById['btn-run'].disabled,  false);
});

test('handleStop: appends [Stopped] to console output', () => {
  const { context, elementsById } = makeMainEnv();
  context.initSim();
  context.handleStop();
  const lines = consoleLines(elementsById);
  assert.ok(lines.some(l => /\[Stopped\]/.test(l)),
    `expected [Stopped] line, got: ${JSON.stringify(lines)}`);
});

// ── handleReset: invokes sim.reset and logs ready ──────────────────────────

test('handleReset: invokes sim.reset (verified via spy on the sim instance)', () => {
  const { context, window } = makeMainEnv();
  context.initSim();
  // window.sim is the script-local sim, set by initSim. Replace its reset
  // method with a spy AFTER instantiation — handleReset reads the live method.
  const calls = [];
  window.sim.reset = () => { calls.push(true); };
  context.handleReset();
  assert.strictEqual(calls.length, 1);
});

test('handleReset: logs [Ready] message', () => {
  const { context, elementsById } = makeMainEnv();
  context.initSim();
  context.handleReset();
  const lines = consoleLines(elementsById);
  assert.ok(lines.some(l => /\[Ready\]/.test(l)));
});

test('handleReset: when running, signals stop and keeps _stopRequested=true after reset', () => {
  const { context, window } = makeMainEnv();
  context.initSim();
  // Pretend a program is in flight. Mimic the real reset(): it clears
  // _stopRequested back to false as part of normalising state, which is the
  // bug handleReset has to compensate for.
  window.sim.isRunning      = true;
  window.sim._stopRequested = false;
  window.sim.reset = function () { this._stopRequested = false; };

  context.handleReset();

  // Worker commands flushed after the reset must still see the stop signal,
  // otherwise the next Python step would act on the freshly-reset robot.
  assert.strictEqual(window.sim._stopRequested, true);
  assert.strictEqual(window.sim.isRunning,      false);
});

test('handleReset: when idle, does not poison _stopRequested', () => {
  const { context, window } = makeMainEnv();
  context.initSim();
  window.sim.isRunning      = false;
  window.sim._stopRequested = false;
  window.sim.reset = function () { this._stopRequested = false; };

  context.handleReset();

  assert.strictEqual(window.sim._stopRequested, false);
});

test('handleReset: re-applies mission friction multiplier to sim after reset (enabled)', () => {
  const { context, window } = makeMainEnv();
  context.initSim();
  window.sim.reset = () => {};
  const frictionCalls = [];
  window.sim.setFrictionMultiplier = (v) => { frictionCalls.push(v); };

  window.missionApp = {
    mode:    'play',
    mission: { modifiers: { friction: { enabled: true, multiplier: 0.5 }, poke: { enabled: false } } },
    engine:  { reset: () => {} },
    ui:      { updateProgress: () => {}, updateTimer: () => {} },
  };

  context.handleReset();

  assert.deepStrictEqual(frictionCalls, [0.5]);
});

test('handleReset: restores friction to 1.0 when modifier is disabled', () => {
  const { context, window } = makeMainEnv();
  context.initSim();
  window.sim.reset = () => {};
  const frictionCalls = [];
  window.sim.setFrictionMultiplier = (v) => { frictionCalls.push(v); };

  window.missionApp = {
    mode:    'play',
    mission: { modifiers: { friction: { enabled: false, multiplier: 0.5 }, poke: { enabled: false } } },
    engine:  { reset: () => {} },
    ui:      { updateProgress: () => {}, updateTimer: () => {} },
  };

  context.handleReset();

  assert.deepStrictEqual(frictionCalls, [1.0]);
});
