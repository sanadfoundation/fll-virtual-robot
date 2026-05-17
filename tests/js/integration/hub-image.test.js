'use strict';

// End-to-end regression for audit 2026-05-13 §4.3:
//   hub.light_matrix.show_image(image)  silently no-ops.
// The bridge emits {type:'hub_image', image:...} but _execCmd had no
// matching case, so the LEGO-documented "renders the image on the 5×5
// matrix" silently became "does nothing." robot.display remained whatever
// it was before, and no test in the suite caught it.
//
// After this fix: at minimum HAPPY and SAD render a recognisable pattern.
// Distinct images produce distinct patterns (the previous silent-drop made
// "all images look the same — namely whatever was last set" technically
// true but useless to users).

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');
const { makeRoundtrip } = require('./roundtrip-helper');

test('hub_image: HAPPY lights the eye pixels', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  assert.strictEqual(sim.robot.display.length, 25);
  // HAPPY has eyes at row 1 (indices 6 and 8) — left and right of centre.
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
  // Pre-light some pixels so we can tell a no-op apart from a deliberate clear.
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  await sim._execCmd({ type: 'hub_image', image: 'NOSUCHIMAGE' });
  // Unknown image should not preserve the previous frame — that would mask
  // typos. Spec: unknown images render a blank pattern.
  assert.ok(sim.robot.display.every((v) => v === 0),
    `unknown image should render blank; got ${sim.robot.display}`);
});

test('round-trip: hub.light_matrix.show_image renders through Python', async () => {
  const { sim, runUserCode } = await makeRoundtrip();

  await runUserCode(`
async def main():
    await hub.light_matrix.show_image(hub.light_matrix.IMAGE_HAPPY)
runloop.run(main())
`);

  assert.ok(sim.robot.display.some((v) => v > 0),
    'expected at least one pixel lit after Python show_image(IMAGE_HAPPY)');
});
