'use strict';

// Simulator-unit tests for hub.light_matrix.show_image rendering.
// Drives _execCmd directly; no Python in the loop.
//
// Cross-runtime contract guard lives in tests/js/integration/hub-image.test.js
// (one test that Python show_image flows through to the same outcome).
//
// Audit ref: 2026-05-13 §4.3 — show_image used to silently no-op because
// _execCmd had no matching 'hub_image' case.

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('hub_image: HAPPY lights the eye pixels', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  assert.strictEqual(sim.robot.display.length, 25);
  // HAPPY pattern has eyes at row 1 (indices 6 and 8).
  assert.ok(sim.robot.display[6] > 0, `eye pixel 6 should be lit, got ${sim.robot.display[6]}`);
  assert.ok(sim.robot.display[8] > 0, `eye pixel 8 should be lit, got ${sim.robot.display[8]}`);
});

test('hub_image: distinct images produce distinct patterns', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  const happy = [...sim.robot.display];
  await sim._execCmd({ type: 'hub_image', image: 'SAD' });
  const sad = [...sim.robot.display];
  assert.notDeepStrictEqual(happy, sad,
    'HAPPY and SAD must render different bitmaps');
});

test('hub_image: unknown image clears display rather than silently doing nothing', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  await sim._execCmd({ type: 'hub_image', image: 'NOSUCHIMAGE' });
  // Unknown image must NOT preserve the previous frame (that would mask
  // typos in user code). Renders blank.
  assert.ok(sim.robot.display.every((v) => v === 0),
    `unknown image should render blank; got ${sim.robot.display}`);
});

test('hub_image: int constant resolves to the named pattern', async () => {
  const sim = createSim();
  // IMAGE_HAPPY = 3 in py/spike_bridge.py; bridge sends str(3) = "3".
  await sim._execCmd({ type: 'hub_image', image: '3' });
  // Should match HAPPY's eye pixels.
  assert.ok(sim.robot.display[6] > 0 && sim.robot.display[8] > 0,
    'int constant 3 should map to HAPPY');
});
