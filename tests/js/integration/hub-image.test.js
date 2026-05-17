'use strict';

// Cross-runtime contract guard for audit 2026-05-13 §4.3.
//
// Behavioural coverage (HAPPY/SAD/unknown/int-constant) lives at the
// simulator-unit tier in tests/js/commands/hub-image.test.js. This test
// proves the same outcome reaches the sim through the Python bridge.

const test   = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: hub.light_matrix.show_image renders through Python', async () => {
  const { sim, runUserCode } = await makeRoundtrip();

  await runUserCode(`
async def main():
    await hub.light_matrix.show_image(hub.light_matrix.IMAGE_HAPPY)
runloop.run(main())
`);

  assert.ok(sim.robot.display.some((v) => v > 0),
    'expected at least one pixel lit after Python show_image(IMAGE_HAPPY); '
    + 'if blank, the IMAGE_* int constant did not survive the bridge round-trip');
});
