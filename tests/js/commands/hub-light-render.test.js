'use strict';

// Verifies that the centre-button colour stored on robot.centreLight actually
// reaches the canvas during _drawRobot. Without this, a future refactor could
// drop the visual without breaking the dispatch tests.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

function instrumentFillStyles(sim) {
  const ctx = sim.ctx;
  const styles = [];
  let current = '';
  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true,
    get() { return current; },
    set(v) { current = v; styles.push(v); },
  });
  return styles;
}

test('hub_light: fillStyle stream includes the picked hex when POWER is set', async () => {
  const sim = createSim();
  const styles = instrumentFillStyles(sim);
  await sim._execCmd({ type: 'hub_light', light: 0, color: 6 }); // GREEN
  sim._drawRobot(sim.ctx, 1);
  // CENTRE_BTN_HEX[6] = '#1a9c4a' (matches the Blockly green swatch).
  assert.ok(styles.includes('#1a9c4a'),
    `expected green hex on canvas; got ${JSON.stringify(styles)}`);
});

test('hub_light: when off (color=0) the button renders as translucent off-white, not a lit palette hex', async () => {
  const sim = createSim();
  const styles = instrumentFillStyles(sim);
  // Fresh sim: centreLight is 0 by default.
  sim._drawRobot(sim.ctx, 1);
  assert.ok(styles.includes('#f4f4f4'),
    `expected unlit off-white on canvas; got ${JSON.stringify(styles)}`);
  // None of the lit (non-white) palette hexes should leak through when off.
  // WHITE (#ffffff) is intentionally absent from this list — the WHITE colour
  // is distinct from the unlit off-white (#f4f4f4) so a lit-white button
  // still reads as "on" against the chassis.
  const litHexes = ['#ff80c0', '#b066d8', '#1d6dd1', '#6db3e6', '#25b9d8',
                    '#1a9c4a', '#f7c911', '#f08020', '#d12a2a', '#ffffff'];
  for (const hex of litHexes) {
    assert.ok(!styles.includes(hex),
      `off state must not paint palette hex ${hex}`);
  }
});

test('hub_light: changing the color updates what reaches the canvas', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_light', light: 0, color: 9 }); // RED
  let styles = instrumentFillStyles(sim);
  sim._drawRobot(sim.ctx, 1);
  assert.ok(styles.includes('#d12a2a'), 'red should reach canvas');

  await sim._execCmd({ type: 'hub_light', light: 0, color: 3 }); // BLUE
  styles = instrumentFillStyles(sim);
  sim._drawRobot(sim.ctx, 1);
  assert.ok(styles.includes('#1d6dd1'), 'blue should reach canvas after switch');
  assert.ok(!styles.includes('#d12a2a'),
    'after switching to blue, red must not still paint');
});
