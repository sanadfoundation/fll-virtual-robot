'use strict';

// End-to-end tests that drive the generated source (preamble + hat-task
// closures + epilogue) through new AsyncFunction(...) against a stubbed
// window.sim and a controllable requestAnimationFrame. We don't go through
// Blockly's workspaceToCode here — instead we hand-write the source pieces
// using the same shape the generators emit, so we can pin runtime behaviour
// independently of the generator output (those are covered in
// event-hats-generators.test.js).

const test   = require('node:test');
const assert = require('node:assert');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Minimal preamble matching what generateBlocklyJS emits.
const PREAMBLE = [
  `var _hats     = [];`,
  `var _mainBody = null;`,
  `var _hatBusy  = {};`,
  `var _hatPrev  = {};`,
  `var _hatFired = {};`,
  `var _t0       = performance.now();`,
].join('\n');

// Minimal epilogue matching what generateBlocklyJS emits. Hats are started
// BEFORE _mainBody so they're polling on the event loop while main runs —
// otherwise a `forever` main + a `when pressed → stop` hat deadlocks: main
// loops forever because the hat that would flip isRunning never gets called.
const EPILOGUE = [
  `await (async () => {`,
  `  const _hatPromises = _hats.map(h => h());`,
  `  if (_mainBody) {`,
  `    try { await _mainBody(); } finally { window.sim.isRunning = false; }`,
  `  }`,
  `  await Promise.all(_hatPromises);`,
  `})();`,
].join('\n');

function makeStubSim(overrides = {}) {
  const sim = {
    isRunning: true,
    pressed:   false,
    color:     'none',
    distance:  300,
    forceN:    0,
    stopCalls: 0,
    stop()    { this.isRunning = false; this.stopCalls++; },
    getForceSensorPressed() { return this.pressed; },
    getForceSensorValue()   { return this.forceN; },
    getColorSensorColor()   { return this.color; },
    getDistanceSensorValue(){ return this.distance; },
    ...overrides,
  };
  return sim;
}

function runProgram(source) {
  // requestAnimationFrame is run synchronously to keep tests deterministic.
  // performance.now is wall-clock; tests that need control over time inject
  // their own monkey-patch via the global setup before calling runProgram.
  const fn = new AsyncFunction(source);
  return fn();
}

// Each test runs with its own globalThis.window stub. setupWindow wires the
// stub sim and a deterministic rAF that schedules via setImmediate so tests
// can interleave with the polling loops via await.
function setupWindow(simOverrides = {}) {
  const sim = makeStubSim(simOverrides);
  const appendOutputCalls = [];
  globalThis.window = {
    sim,
    appendOutput: (msg, kind) => appendOutputCalls.push({ msg, kind }),
  };
  globalThis.requestAnimationFrame = (cb) => setImmediate(cb);
  return { sim, appendOutputCalls };
}

function teardown() {
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('whenProgramStarts only: program ends when main returns', async () => {
  const { sim } = setupWindow();
  const main = `_mainBody = async () => { window.sim.beeped = true; };\n`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + EPILOGUE);
    assert.strictEqual(sim.beeped, true);
    assert.strictEqual(sim.isRunning, false, 'isRunning flipped after main returned');
  } finally { teardown(); }
});

test('whenPressed edge-trigger: body fires once per false→true transition', async () => {
  const { sim } = setupWindow();
  // Scripted press sequence drained one value per poll.
  const seq = [false, false, true, true, true, false, true, false];
  let idx = 0;
  sim.getForceSensorPressed = () => seq[Math.min(idx++, seq.length - 1)];
  // Main exits when sim.fires hits 2 — gives the hat a chance to see both transitions.
  const main = `_mainBody = async () => {
    while (window.sim.isRunning && (window.sim.fires || 0) < 2) {
      await new Promise(r => requestAnimationFrame(r));
    }
  };`;
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try { window.sim.fires = (window.sim.fires || 0) + 1; }
        finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 2, 'edge-trigger fired exactly twice for two false→true transitions');
  } finally { teardown(); }
});

test('drop-while-busy: re-triggers during body execution are dropped', async () => {
  const { sim } = setupWindow();
  // Condition is permanently true.
  sim.getForceSensorPressed = () => true;
  const main = `_mainBody = async () => {
    // Wait long enough for the hat body to start and several poll ticks to elapse.
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  };`;
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try {
          // Body holds for 5 polling ticks — drop-while-busy must prevent re-fire.
          window.sim.fires = (window.sim.fires || 0) + 1;
          for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
        } finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 1, 'drop-while-busy permitted only one fire');
  } finally { teardown(); }
});

test('stop() inside hat body unwinds main and hats together', async () => {
  const { sim } = setupWindow();
  sim.getForceSensorPressed = () => true;  // hat will fire on first poll
  const main = `_mainBody = async () => {
    // Main is a forever-loop; only exits when isRunning flips.
    while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
  };`;
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try { window.sim.stop(); }
        finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.stopCalls, 1, 'hat body called sim.stop() exactly once');
    assert.strictEqual(sim.isRunning, false, 'isRunning is false after the run');
  } finally { teardown(); }
});

test('one-shot timer: body fires once, _hatFired prevents re-fire', async () => {
  const { sim } = setupWindow();
  // Main waits 10 polling ticks so the timer has many chances to re-fire.
  const main = `_mainBody = async () => {
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
  };`;
  // Condition is permanently true; one-shot gate via _hatFired is what limits it to 1.
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = true;  // condition met from frame 1
      if (cur && !_hatPrev['t1'] && !_hatBusy['t1'] && !_hatFired['t1']) {
        _hatBusy['t1'] = true;
        try {
          window.sim.fires = (window.sim.fires || 0) + 1;
          _hatFired['t1'] = true;
        } finally { _hatBusy['t1'] = false; }
      }
      _hatPrev['t1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 1, 'one-shot fired exactly once');
  } finally { teardown(); }
});

test('stub-warn hat: appendOutput called once at program start', async () => {
  const { sim, appendOutputCalls } = setupWindow();
  // No main; the stub-warn hat itself terminates when isRunning flips. The
  // test flips isRunning externally after one tick.
  const stubHat = `;(function () {
    var _msg = "[!] when button: hub-button API isn't implemented yet — this hat won't fire";
    if (window.appendOutput) window.appendOutput(_msg, 'warn');
  })();
  _hats.push(async () => {
    while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
  });`;
  // Schedule the cancellation.
  setImmediate(() => { sim.isRunning = false; });
  try {
    await runProgram(PREAMBLE + '\n' + stubHat + '\n' + EPILOGUE);
    assert.strictEqual(appendOutputCalls.length, 1, 'warn emitted exactly once');
    assert.match(appendOutputCalls[0].msg, /hub-button API isn/);
    assert.strictEqual(appendOutputCalls[0].kind, 'warn');
  } finally { teardown(); }
});

test('numeric-prev "pressure changed": fires once per distinct value, never spuriously on frame 1', async () => {
  // Mirrors what flipperevents_whenPressed(option='pressure changed') emits.
  // The contract is (a) _hatPrev is seeded BEFORE the loop with the current
  // value, so the first poll where cur === prev never fires; (b) every
  // !== transition fires exactly once; (c) re-fires while body is running
  // are dropped via _hatBusy.
  const { sim } = setupWindow();
  // Scripted force-value sequence: stay at 0, then 5, then 5 (no change),
  // then 12, then 0. Expected fires: 5, 12, 0 → 3 transitions.
  const seq = [0, 0, 5, 5, 12, 0, 0];
  let idx = 0;
  sim.getForceSensorValue = () => seq[Math.min(idx++, seq.length - 1)];
  const main = `_mainBody = async () => {
    // Drain enough polling ticks to walk the scripted sequence to completion.
    for (let i = 0; i < seq_length + 2; i++) await new Promise(r => requestAnimationFrame(r));
  };`.replace('seq_length', String(seq.length));
  // Hat shape pinned to what emitNumericHatPoll produces: seed prev OUTSIDE
  // the while, then compare with !== inside.
  const hat = `_hats.push(async () => {
    _hatPrev['p1'] = window.sim.getForceSensorValue();
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorValue();
      if (cur !== _hatPrev['p1'] && !_hatBusy['p1']) {
        _hatBusy['p1'] = true;
        try {
          window.sim.fires = (window.sim.fires || 0) + 1;
          window.sim.lastValue = cur;
        } finally { _hatBusy['p1'] = false; }
      }
      _hatPrev['p1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 3,
      'three distinct transitions (0→5, 5→12, 12→0) should fire three times; identical-value polls should not');
    assert.strictEqual(sim.lastValue, 0, 'last fire saw final value 0');
  } finally { teardown(); }
});

test('numeric-prev: identical first poll never spuriously fires', async () => {
  // Regression guard for the seed-prev-inside-loop bug: if _hatPrev were
  // seeded inside the while (e.g. starting at undefined), the first poll
  // would see cur=5 !== undefined and fire spuriously. Sequence here is
  // constant — no fire should ever happen.
  const { sim } = setupWindow();
  sim.getForceSensorValue = () => 42;
  const main = `_mainBody = async () => {
    for (let i = 0; i < 5; i++) await new Promise(r => requestAnimationFrame(r));
  };`;
  const hat = `_hats.push(async () => {
    _hatPrev['p2'] = window.sim.getForceSensorValue();
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorValue();
      if (cur !== _hatPrev['p2'] && !_hatBusy['p2']) {
        _hatBusy['p2'] = true;
        try { window.sim.fires = (window.sim.fires || 0) + 1; }
        finally { _hatBusy['p2'] = false; }
      }
      _hatPrev['p2'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, undefined, 'constant value must not fire');
  } finally { teardown(); }
});

test('hat body throw is swallowed; subsequent transitions still fire', async () => {
  // Mirrors emitBoolHatPoll's try/catch shape. A body that throws once must
  // (a) not kill the program, (b) flip _hatBusy back to false in finally
  // so a future false→true transition can re-arm.
  const { sim, appendOutputCalls } = setupWindow();
  const seq = [false, false, true, false, false, true, false];
  let idx = 0;
  sim.getForceSensorPressed = () => seq[Math.min(idx++, seq.length - 1)];
  const main = `_mainBody = async () => {
    for (let i = 0; i < seq_length + 2; i++) await new Promise(r => requestAnimationFrame(r));
  };`.replace('seq_length', String(seq.length));
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) {
      const cur = window.sim.getForceSensorPressed();
      if (cur && !_hatPrev['h1'] && !_hatBusy['h1']) {
        _hatBusy['h1'] = true;
        try {
          window.sim.fires = (window.sim.fires || 0) + 1;
          if (window.sim.fires === 1) throw new Error('boom');
        } catch (e) {
          if (window.appendOutput) window.appendOutput('[Error] hat: ' + ((e && e.message) || e), 'error');
        } finally { _hatBusy['h1'] = false; }
      }
      _hatPrev['h1'] = cur;
      await new Promise(r => requestAnimationFrame(r));
    }
  });`;
  try {
    await runProgram(PREAMBLE + '\n' + main + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.fires, 2, 'second false→true transition fired despite first body throwing');
    assert.strictEqual(appendOutputCalls.length, 1, 'error reported once');
    assert.match(appendOutputCalls[0].msg, /boom/);
    assert.strictEqual(appendOutputCalls[0].kind, 'error');
  } finally { teardown(); }
});

test('no whenProgramStarts + finite cancellation: program resolves cleanly', async () => {
  const { sim } = setupWindow();
  const hat = `_hats.push(async () => {
    while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
  });`;
  setImmediate(() => setImmediate(() => { sim.isRunning = false; }));
  try {
    await runProgram(PREAMBLE + '\n' + hat + '\n' + EPILOGUE);
    assert.strictEqual(sim.isRunning, false);
  } finally { teardown(); }
});
