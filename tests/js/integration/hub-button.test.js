'use strict';

// Regression for BACKLOG / audit 2026-05-17 §4 easy-win #1:
// hub.button.pressed(button) used to always return 0. Per LEGO docs it
// returns the ms held duration of the named button (0 if not currently
// pressed).
//
// This test covers the round-trip contract: the sim writes button-held
// state into the snapshot; the bridge's _Button.pressed reads it back.
// The UI-side mechanism for injecting an actual button-down event lives
// elsewhere (out of scope here); tests seed the sim state directly.

const test = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: hub.button.pressed reads ms-held for LEFT', async () => {
  const { sim, mp, runUserCode } = await makeRoundtrip();
  // Seed left button held for 250 ms.
  sim.robot.buttons = { LEFT: 250, RIGHT: 0 };

  await runUserCode(`
async def main():
    global _left, _right
    await runloop.sleep_ms(0)
    _left  = hub.button.pressed(hub.button.LEFT)
    _right = hub.button.pressed(hub.button.RIGHT)
runloop.run(main())
`);

  assert.strictEqual(mp.globals.get('_left'),  250,
    'LEFT should report the 250 ms-held duration');
  assert.strictEqual(mp.globals.get('_right'), 0,
    'RIGHT should report 0 (not held)');
});

test('round-trip: hub.button.pressed returns 0 when nothing held', async () => {
  const { mp, runUserCode } = await makeRoundtrip();
  // Default sim state — no buttons held.
  await runUserCode(`
async def main():
    global _l, _r
    await runloop.sleep_ms(0)
    _l = hub.button.pressed(hub.button.LEFT)
    _r = hub.button.pressed(hub.button.RIGHT)
runloop.run(main())
`);
  assert.strictEqual(mp.globals.get('_l'), 0);
  assert.strictEqual(mp.globals.get('_r'), 0);
});
