'use strict';

// Regression for audit 2026-05-13 §4.9 / BACKLOG _showText. Before the fix
// `_showText` filled every-other-pixel proportional to text length, so
// `write("A")` and `write("B")` produced barely-different bitmaps that
// resembled no glyph. After: each character renders a recognisable 5×5
// pattern from a font table.

const test = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('hub_display: write("A") and write("B") produce different glyph patterns', async () => {
  const a = createSim();
  await a._execCmd({ type: 'hub_display', text: 'A' });
  const aPattern = [...a.robot.display];

  const b = createSim();
  await b._execCmd({ type: 'hub_display', text: 'B' });
  const bPattern = [...b.robot.display];

  assert.notDeepStrictEqual(aPattern, bPattern,
    'A and B must render distinguishable bitmaps (not every-other-pixel scaled)');
});

test('hub_display: write("A") matches the A glyph corners (top-row centre lit, sides at row 2)', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_display', text: 'A' });
  // 'A' pattern (top of pyramid + horizontal bar):
  //   . X X X .   ← row 0
  //   X . . . X   ← row 1
  //   X X X X X   ← row 2 (the bar)
  //   X . . . X   ← row 3
  //   X . . . X   ← row 4
  // Check specific signature pixels: row 0 centre (idx 2) is lit, row 1
  // sides (idx 5 and 9) are lit, row 1 centre (idx 7) is NOT lit.
  assert.ok(sim.robot.display[2] > 0, `row 0 centre should be lit, got ${sim.robot.display[2]}`);
  assert.ok(sim.robot.display[5] > 0, `row 1 left side should be lit, got ${sim.robot.display[5]}`);
  assert.ok(sim.robot.display[9] > 0, `row 1 right side should be lit, got ${sim.robot.display[9]}`);
  assert.strictEqual(sim.robot.display[7], 0, `row 1 centre should NOT be lit for 'A'`);
});

test('hub_display: write("") leaves the display blank', async () => {
  const sim = createSim();
  sim.robot.display = Array(25).fill(50);
  await sim._execCmd({ type: 'hub_display', text: '' });
  assert.ok(sim.robot.display.every((v) => v === 0),
    `empty string should clear the display; got non-zero pixels`);
});

test('hub_display: write("?") for unknown glyph renders blank, not garbage', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_display', text: '~' });  // ~ is not in our font
  // Unknown glyph: render blank rather than the every-other-pixel fake.
  // This is the same posture as hub_image for unknown image names.
  assert.ok(sim.robot.display.every((v) => v === 0),
    `unknown glyph should render blank; got ${sim.robot.display}`);
});
