'use strict';

// Tests that generateBlocklyJS emits the event-hat runtime scaffolding:
//   - preamble declares _hats / _mainBody / _hatBusy / _hatPrev / _hatFired / _t0
//   - epilogue awaits _mainBody (if present) then Promise.all(_hats)
//   - scrub_ override skips next-chain append for hat block types
//
// Generator-output tests for each individual hat live further down (added by
// later tasks). The scaffolding tests here run first because every hat
// generator's emitted closure references the preamble vars.

const test   = require('node:test');
const assert = require('node:assert');
const { makeBlocklyEnv } = require('../mocks/blockly-env');

function setupAndGenerate(xml = '<xml/>') {
  const env = makeBlocklyEnv({
    textToDom: (s) => ({ kind: 'parsed', src: s }),
  });
  env.window.initBlockly('blockly-div', 'light');
  // The stub workspace doesn't actually parse XML — we drive generateBlocklyJS
  // with an empty workspace to read just the preamble + epilogue.
  const ws = { getTopBlocks: () => [] };  // empty workspace
  return { env, source: env.window.generateBlocklyJS(ws) };
}

test('preamble declares _hats array', () => {
  const { source } = setupAndGenerate();
  assert.ok(source.includes('var _hats     = [];'),
    `expected _hats declaration in preamble, got:\n${source.slice(0, 500)}`);
});

test('preamble declares _mainBody null', () => {
  const { source } = setupAndGenerate();
  assert.ok(source.includes('var _mainBody = null;'),
    `expected _mainBody declaration in preamble`);
});

test('preamble declares per-id state maps', () => {
  const { source } = setupAndGenerate();
  for (const v of ['_hatBusy', '_hatPrev', '_hatFired']) {
    assert.ok(source.includes(`var ${v}  = {};`),
      `expected ${v} declaration in preamble`);
  }
});

test('preamble seeds _t0 at program start', () => {
  const { source } = setupAndGenerate();
  assert.ok(source.includes('var _t0       = performance.now();'),
    `expected _t0 declaration in preamble`);
});

test('epilogue starts hats concurrently then awaits _mainBody', () => {
  const { source } = setupAndGenerate();
  // The epilogue must (a) start every hat BEFORE awaiting _mainBody so hat
  // polling loops are on the event loop while main runs; (b) conditionally
  // run _mainBody; (c) wait for the previously-started hats to wind down.
  assert.ok(source.includes('await (async () => {'),
    `expected awaited IIFE in epilogue, got:\n${source.slice(-400)}`);
  assert.ok(source.includes('_hats.map(h => h())'),
    `expected _hats.map(h => h()) to start every hat`);
  assert.ok(source.includes('if (_mainBody)'),
    `expected guard on _mainBody`);
  assert.ok(source.includes('window.sim.isRunning = false'),
    `expected isRunning flip after _mainBody returns`);
  assert.ok(source.includes('Promise.all('),
    `expected Promise.all over the started hat promises`);
  // Order check: the hat-start call must appear BEFORE the _mainBody await.
  const hatStartIdx = source.indexOf('_hats.map(h => h())');
  const mainAwaitIdx = source.indexOf('await _mainBody()');
  assert.ok(hatStartIdx > 0 && mainAwaitIdx > 0,
    'both _hats.map and await _mainBody() must appear in source');
  assert.ok(hatStartIdx < mainAwaitIdx,
    `hats must start before main is awaited (hatStartIdx=${hatStartIdx}, mainAwaitIdx=${mainAwaitIdx})`);
});

test('epilogue drains _motionPromise before flipping isRunning', () => {
  // Without this, a solo "start motor" block (fire-and-forget Infinity) gets
  // killed by isRunning=false right when _mainBody returns — the motor spins
  // for a few ms and then halts, even though the program "should" run until
  // the user clicks Stop. The drain loops on _motionPromise so an in-flight
  // motion keeps the sim alive past _mainBody's return.
  const { source } = setupAndGenerate();
  assert.ok(/while\s*\(window\.sim\.isRunning\s*&&\s*window\.sim\._motionPromise\)/.test(source),
    `expected motion drain loop in epilogue, got:\n${source.slice(-600)}`);
  // The drain must come BEFORE isRunning=false.
  const drainIdx = source.search(/while\s*\(window\.sim\.isRunning\s*&&\s*window\.sim\._motionPromise\)/);
  const flipIdx  = source.indexOf('window.sim.isRunning = false');
  assert.ok(drainIdx > 0 && flipIdx > 0, 'both drain and isRunning flip must be present');
  assert.ok(drainIdx < flipIdx,
    `drain must run before isRunning is flipped (drainIdx=${drainIdx}, flipIdx=${flipIdx})`);
});

// ── scrub_ override ────────────────────────────────────────────────────────

test('scrub_ override is installed for hat block types', () => {
  const { env } = setupAndGenerate();
  const Blockly = env.Blockly;
  const js = Blockly.JavaScript || Blockly.javascriptGenerator;
  // The override should be a function (not the default scrub_).
  assert.strictEqual(typeof js.scrub_, 'function');
  // For a hat type, scrub_ should return code unchanged (no next-chain append).
  const hatBlock = { type: 'flipperevents_whenPressed', nextConnection: { targetBlock: () => null } };
  assert.strictEqual(js.scrub_(hatBlock, 'X;', undefined), 'X;');
  // For a non-hat, scrub_ should still append next-chain code (use a block
  // with no next so the result is just X; — this only checks the override
  // doesn't break non-hat blocks).
  const normalBlock = { type: 'flippermove_move', nextConnection: { targetBlock: () => null } };
  assert.strictEqual(js.scrub_(normalBlock, 'Y;', undefined), 'Y;');
});

// ── whenProgramStarts ──────────────────────────────────────────────────────

function makeHatBlock(type, fields = {}, nextBlock = null) {
  // Synthetic Blockly block for generator tests. `getNextBlock` returns the
  // block attached below the hat (its body). The real Blockly.JavaScript
  // recurses into that via blockToCode; tests can stub the recursion by
  // overriding what blockToCode returns.
  return {
    type,
    id: 'test-' + type,
    getFieldValue(name) { return name in fields ? fields[name] : ''; },
    getInputTargetBlock() { return null; },
    getNextBlock: () => nextBlock,
    nextConnection: { targetBlock: () => nextBlock },
  };
}

function setupAndRunGenerator(type, fields, nextBodyCode) {
  // Drive registerGenerators, monkey-patch blockToCode to return our stub
  // body for the next block, invoke the hat generator, return the source.
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const next = nextBodyCode ? makeHatBlock('test-body') : null;
  // Stub blockToCode so the hat's blockToCode(getNextBlock()) call returns
  // our scripted body code instead of trying to recurse into a real block.
  const origBlockToCode = js.blockToCode || (() => '');
  js.blockToCode = (b) => (b === next ? nextBodyCode : origBlockToCode(b));
  const block = makeHatBlock(type, fields, next);
  return js[type](block);
}

test('whenProgramStarts: emits _mainBody = async closure containing the body', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenProgramStarts', {}, "window.sim._sleep(100);\n",
  );
  assert.ok(code.includes('_mainBody = async () => {'),
    `expected _mainBody assignment, got:\n${code}`);
  assert.ok(code.includes('window.sim._sleep(100);'),
    `expected body inlined inside closure, got:\n${code}`);
  assert.ok(code.trim().endsWith('};'),
    `expected closure to terminate cleanly, got tail:\n${code.slice(-100)}`);
});

test('whenProgramStarts: empty body still emits a no-op closure', () => {
  const code = setupAndRunGenerator('flipperevents_whenProgramStarts', {}, '');
  assert.ok(code.includes('_mainBody = async () => {'),
    `expected _mainBody assignment, got:\n${code}`);
});

// ── whenPressed ────────────────────────────────────────────────────────────

test('whenPressed pressed: emits polling task with getForceSensorPressed', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'pressed' },
    "window.sim.stop();\n",
  );
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push, got:\n${code.slice(0, 200)}`);
  assert.ok(code.includes('const cur = window.sim.getForceSensorPressed();'),
    `expected getForceSensorPressed in cur, got:\n${code}`);
  assert.ok(code.includes("_hatPrev['"),
    `expected _hatPrev edge-detect`);
  assert.ok(code.includes("_hatBusy['"),
    `expected _hatBusy guard`);
  assert.ok(code.includes('window.sim.stop();'),
    `expected body inside try block`);
  assert.ok(code.includes('requestAnimationFrame'),
    `expected rAF yield`);
});

test('whenPressed hard-pressed: condition uses getForceSensorValue >= 70', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'hard-pressed' },
    '',
  );
  assert.ok(code.includes('const cur = window.sim.getForceSensorValue() >= 70;'),
    `expected hard-pressed threshold, got:\n${code}`);
});

test('whenPressed released: condition negates getForceSensorPressed', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'released' },
    '',
  );
  assert.ok(code.includes('const cur = !window.sim.getForceSensorPressed();'),
    `expected released condition, got:\n${code}`);
});

test('whenPressed pressure-changed: uses numeric !== edge', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'C', OPTION: 'pressure changed' },
    "window.appendOutput('changed');\n",
  );
  // Numeric prev: seeded outside the while loop at hat start; cur compared
  // via !== rather than && !prev.
  assert.ok(code.includes("_hatPrev['test-flipperevents_whenPressed'] = window.sim.getForceSensorValue();"),
    `expected numeric prev seed at hat start, got:\n${code}`);
  assert.ok(code.includes('const cur = window.sim.getForceSensorValue();'),
    `expected numeric cur, got:\n${code}`);
  assert.ok(code.includes("cur !== _hatPrev['"),
    `expected !== edge comparison, got:\n${code}`);
});

test('whenPressed on non-canonical port: emits stub-warn naming the right port', () => {
  // The simulator wires the force sensor to port C. Picking port A should
  // NOT silently fail — it should surface a clear warning.
  const code = setupAndRunGenerator(
    'flipperevents_whenPressed',
    { PORT: 'A', OPTION: 'pressed' },
    '',
  );
  assert.ok(code.includes('window.appendOutput') || code.includes('console.warn'),
    `expected stub-warn IIFE for wrong port, got:\n${code}`);
  assert.ok(code.includes('no force sensor on port A'),
    `expected warning to name the offending port A, got:\n${code}`);
  assert.ok(code.includes('port C'),
    `expected warning to mention the canonical port C, got:\n${code}`);
  assert.ok(!code.includes('window.sim.getForceSensorPressed()'),
    `wrong-port hat should not poll the sensor at all, got:\n${code}`);
});

// ── whenColor ──────────────────────────────────────────────────────────────

test('whenColor: black (OPTION=0) emits comparison against the "black" NAME', () => {
  // The _COLORS Blockly dropdown stores integer codes ('0' for black, '9' for
  // red, etc.). The simulator returns names. The generator must translate
  // index → name before comparing.
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'E', OPTION: '0' },
    "window.sim.stop();\n",
  );
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push`);
  assert.ok(code.includes('window.sim.getColorSensorColor() === "black"') ||
            code.includes("window.sim.getColorSensorColor() === 'black'"),
    `expected getColorSensorColor() === 'black', got:\n${code}`);
  assert.ok(code.includes('window.sim.stop();'),
    `expected body inside try block`);
});

test('whenColor: red (OPTION=9) emits comparison against the "red" NAME', () => {
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'E', OPTION: '9' },
    '',
  );
  assert.ok(code.includes('window.sim.getColorSensorColor() === "red"') ||
            code.includes("window.sim.getColorSensorColor() === 'red'"),
    `expected red NAME after index translation, got:\n${code}`);
});

test('whenColor: unknown OPTION falls back to "none" (never matches)', () => {
  // Defensive: an index outside the LEGO color table maps to 'none', so the
  // hat condition is always false rather than emitting an unmappable value
  // that could match nothing forever or throw.
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'E', OPTION: '99' },
    '',
  );
  assert.ok(code.includes('window.sim.getColorSensorColor() === "none"') ||
            code.includes("window.sim.getColorSensorColor() === 'none'"),
    `expected 'none' fallback for unknown index, got:\n${code}`);
});

test('whenColor on non-canonical port: emits stub-warn naming the right port', () => {
  // The simulator wires the colour sensor to port E. Picking port D in the
  // dropdown should NOT silently fail — it should surface a clear warning.
  const code = setupAndRunGenerator(
    'flipperevents_whenColor',
    { PORT: 'D', OPTION: '0' },
    '',
  );
  assert.ok(code.includes('window.appendOutput') || code.includes('console.warn'),
    `expected stub-warn IIFE for wrong port, got:\n${code}`);
  assert.ok(code.includes('no colour sensor on port D'),
    `expected warning to name the offending port D, got:\n${code}`);
  assert.ok(code.includes('port E'),
    `expected warning to mention the canonical port E, got:\n${code}`);
  // Must NOT emit a real polling task that reads getColorSensorColor.
  assert.ok(!code.includes('window.sim.getColorSensorColor()'),
    `wrong-port hat should not poll the sensor at all, got:\n${code}`);
});

// ── whenDistance ───────────────────────────────────────────────────────────

// whenDistance has a VALUE input (not a field), so we need to stub
// js.valueToCode to return the number string.
function setupWhenDistance(comparator, valueStr, unit, body = '') {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenDistance', { PORT: 'F', COMPARATOR: comparator, UNIT: unit });
  // valueToCode lookup for input VALUE
  const origValueToCode = js.valueToCode || (() => '');
  js.valueToCode = (b, name) => (b === block && name === 'VALUE' ? valueStr : origValueToCode(b, name));
  // body for the next-chain
  const origBlockToCode = js.blockToCode || (() => '');
  const next = body ? { _stub: true } : null;
  if (next) {
    block.getNextBlock = () => next;
    js.blockToCode = (b) => (b === next ? body : origBlockToCode(b));
  }
  return js['flipperevents_whenDistance'](block);
}

test('whenDistance closer-than cm: emits < with mm conversion', () => {
  const code = setupWhenDistance('<', '10', 'cm', "window.sim.stop();\n");
  assert.ok(code.includes('window.sim.getDistanceSensorValue() < 100'),
    `expected 10 cm → 100 mm threshold, got:\n${code}`);
});

test('whenDistance closer-than inches: emits < with mm conversion', () => {
  const code = setupWhenDistance('<', '5', 'inches', '');
  // 5 × 25.4 = 127
  assert.ok(code.includes('window.sim.getDistanceSensorValue() < 127'),
    `expected 5 in → 127 mm threshold, got:\n${code}`);
});

test('whenDistance closer-than %: emits < with percent-of-max conversion', () => {
  // DIST_SENSOR_MAX_MM = 2000; 25 % → 500 mm
  const code = setupWhenDistance('<', '25', '%', '');
  assert.ok(code.includes('window.sim.getDistanceSensorValue() < 500'),
    `expected 25 % → 500 mm threshold, got:\n${code}`);
});

test('whenDistance further-than: emits > with mm conversion', () => {
  const code = setupWhenDistance('>', '30', 'cm', '');
  assert.ok(code.includes('window.sim.getDistanceSensorValue() > 300'),
    `expected 30 cm → 300 mm with >, got:\n${code}`);
});

test('whenDistance exactly-at: emits tolerance band (Math.abs … <= 10)', () => {
  const code = setupWhenDistance('=', '20', 'cm', '');
  // Tolerance band of ±10 mm around 200 mm.
  assert.ok(code.includes('Math.abs(window.sim.getDistanceSensorValue() - 200) <= 10'),
    `expected exact-match tolerance band, got:\n${code}`);
});

test('whenDistance on non-canonical port: emits stub-warn naming the right port', () => {
  // setupWhenDistance helper wires PORT='F' by default; build a wrong-port
  // block by hand here.
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenDistance',
    { PORT: 'E', COMPARATOR: '<', UNIT: 'cm' });
  js.valueToCode = () => '10';
  const code = js['flipperevents_whenDistance'](block);
  assert.ok(code.includes('window.appendOutput') || code.includes('console.warn'),
    `expected stub-warn IIFE for wrong port, got:\n${code}`);
  assert.ok(code.includes('no distance sensor on port E'),
    `expected warning to name the offending port E, got:\n${code}`);
  assert.ok(code.includes('port F'),
    `expected warning to mention the canonical port F, got:\n${code}`);
  assert.ok(!code.includes('window.sim.getDistanceSensorValue()'),
    `wrong-port hat should not poll the sensor at all, got:\n${code}`);
});

// ── whenTimer ──────────────────────────────────────────────────────────────

function setupWhenTimer(secondsStr, body = '') {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenTimer', {});
  // valueToCode lookup for input VALUE
  const origValueToCode = js.valueToCode || (() => '');
  js.valueToCode = (b, name) => (b === block && name === 'VALUE' ? secondsStr : origValueToCode(b, name));
  // body for the next-chain
  const origBlockToCode = js.blockToCode || (() => '');
  const next = body ? { _stub: true } : null;
  if (next) {
    block.getNextBlock = () => next;
    js.blockToCode = (b) => (b === next ? body : origBlockToCode(b));
  }
  return js['flipperevents_whenTimer'](block);
}

test('whenTimer: emits one-shot polling with elapsed-ms threshold', () => {
  const code = setupWhenTimer('2', "window.sim.stop();\n");
  // 2 s → 2000 ms.
  assert.ok(code.includes('(performance.now() - _t0) >= 2000'),
    `expected elapsed-ms threshold, got:\n${code}`);
});

test('whenTimer: gated by _hatFired (one-shot)', () => {
  const code = setupWhenTimer('1', '');
  assert.ok(code.includes(`!_hatFired['`),
    `expected _hatFired gate, got:\n${code}`);
  assert.ok(code.includes(`_hatFired['`) && code.includes(`] = true;`),
    `expected _hatFired set inside body, got:\n${code}`);
});

test('whenTimer: fractional seconds round to ms', () => {
  const code = setupWhenTimer('0.5', '');
  assert.ok(code.includes('>= 500'),
    `expected 0.5 s → 500 ms, got:\n${code}`);
});

// ── whenCondition ──────────────────────────────────────────────────────────

test('whenCondition: wraps the CONDITION input in !!(…) and polls', () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenCondition', {});
  js.valueToCode = (b, name) => (b === block && name === 'CONDITION'
    ? '(window.sim.robot.x > 1000)' : 'false');
  const code = js['flipperevents_whenCondition'](block);
  assert.ok(code.startsWith('_hats.push(async () => {'),
    `expected polling-task push, got head:\n${code.slice(0, 80)}`);
  assert.ok(code.includes('const cur = !!((window.sim.robot.x > 1000));'),
    `expected wrapped boolean condition, got:\n${code}`);
});

test('whenCondition: empty CONDITION falls back to false', () => {
  const env = makeBlocklyEnv();
  env.window.initBlockly('blockly-div', 'light');
  const js = env.Blockly.JavaScript;
  const block = makeHatBlock('flipperevents_whenCondition', {});
  js.valueToCode = () => '';
  const code = js['flipperevents_whenCondition'](block);
  assert.ok(code.includes('const cur = !!(false);'),
    `expected false fallback, got:\n${code}`);
});

// ── Stub-warn hats ─────────────────────────────────────────────────────────

const STUB_HATS = [
  { type: 'flipperevents_whenButton',          msg: 'hub-button API isn'  },
  { type: 'flipperevents_whenTilted',          msg: 'motion sensor isn'   },
  { type: 'flipperevents_whenOrientation',     msg: 'motion sensor isn'   },
  { type: 'flipperevents_whenGesture',         msg: 'motion sensor isn'   },
  { type: 'event_whenbroadcastreceived',       msg: 'broadcast runtime isn' },
];

for (const { type, msg } of STUB_HATS) {
  test(`${type}: emits stub-warn IIFE + no-op polling loop`, () => {
    const env = makeBlocklyEnv();
    env.window.initBlockly('blockly-div', 'light');
    const block = makeHatBlock(type, {});
    const code = env.Blockly.JavaScript[type](block);
    // Warn IIFE
    assert.ok(code.includes('window.appendOutput'),
      `${type}: expected appendOutput call, got:\n${code}`);
    assert.ok(code.includes(msg),
      `${type}: expected reason mentioning "${msg}", got:\n${code}`);
    // No-op polling loop so Promise.all winds down cleanly on isRunning=false
    assert.ok(code.includes('_hats.push(async () => {'),
      `${type}: expected _hats.push wrapping the no-op poll`);
    assert.ok(code.includes('window.sim.isRunning'),
      `${type}: expected isRunning loop guard`);
    assert.ok(code.includes('requestAnimationFrame'),
      `${type}: expected rAF yield`);
  });
}
