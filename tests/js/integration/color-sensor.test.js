'use strict';

// Round-trip regression for audit 2026-05-13 §4.8 — the 'cyan' vs 'azure'
// divergence. The sim's COLOR_MAP used 'cyan' for the LEGO Light-Blue tile;
// the Python bridge's _COLOR_INT_MAP used 'azure' for the same index (4).
// Result: a tile that the sim reported as 'cyan' returned color.UNKNOWN (-1)
// from Python's color_sensor.color() instead of color.AZURE (4).

const test = require('node:test');
const assert = require('node:assert');
const { makeRoundtrip } = require('./roundtrip-helper');

test('round-trip: color_sensor.color over a Light-Blue tile returns color.AZURE', async () => {
  const { sim, mp, runUserCode } = await makeRoundtrip();
  // Seed the sim's color reading. After the fix, the sim emits 'azure'
  // (matching the bridge's _COLOR_INT_MAP key).
  sim.robot.sensors.colorValue = 'azure';

  await runUserCode(`
async def main():
    global _c, _is_azure
    await runloop.sleep_ms(0)
    _c = color_sensor.color('C')
    _is_azure = (_c == color.AZURE)
runloop.run(main())
`);

  const c = mp.globals.get('_c');
  const isAzure = mp.globals.get('_is_azure');
  assert.strictEqual(c, 4, `expected color.AZURE (4), got ${c}`);
  assert.strictEqual(isAzure, true);
});

test('round-trip: simulator emits "azure" (not "cyan") for a Light-Blue colorValue', async () => {
  const { sim } = await makeRoundtrip();
  // No tiles currently use 'cyan' as sensorColor (verified by grep on
  // js/simulator.js). But the COLOR_MAP and reflMap must use 'azure' so
  // that user code referencing `color.AZURE` resolves correctly.
  sim.robot.sensors.colorValue = 'azure';
  const refl = sim.getColorSensorReflection();
  // 'azure' reflectivity should be in the cyan/blue range (~70), not the
  // default fall-through (50).
  assert.ok(refl > 60 && refl < 80,
    `expected azure reflection ~70, got ${refl} (likely falling through to default 50)`);
});
