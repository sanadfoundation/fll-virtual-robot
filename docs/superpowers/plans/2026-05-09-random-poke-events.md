# Random Poke Events + Line-Follow Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject randomized lateral "poke" events that knock the robot off course during program execution, so a student program has to detect and recover. Bundle the BACKLOG'd `tilt_angles()` gyro fix and ship one Python + one Blockly line-follower example.

**Architecture:** A new `NoiseController` (`js/noise_events.js`) holds poke state and is queried each step by `_animateTank` for a perpendicular-velocity perturbation. The robot stays kinematic; the contact solver absorbs pokes into walls correctly. Heading is untouched, so trail/sensor pipelines are unaffected. The gyro fix is orthogonal: simulator pushes `yaw_dDeg` in the per-step sensor snapshot and the bridge's `_MotionSensor.tilt_angles()` reads it.

**Tech Stack:** Vanilla JS (no build), Box2D-WASM via `js/world_2d.js`, MicroPython via PolyScript, Node's built-in `node:test` runner for JS, `unittest` for Python.

**Spec:** `docs/superpowers/specs/2026-05-09-random-poke-events-design.md`

---

## File Structure

**New files:**
- `js/noise_events.js` — `NoiseController` class. Pure JS, no DOM/Box2D dependencies.
- `tests/js/noise/controller.test.js` — unit tests for the controller.
- `tests/js/noise/perturb-integration.test.js` — driving `_animateTank` with a stub Box2D world.
- `tests/js/noise/reset.test.js` — `RobotSimulator.reset()` clears `NoiseController` state.
- `tests/js/sensors/gyro.test.js` — sim-side `yaw_dDeg` snapshot + `reset_yaw` cmd.
- `tests/py/test_motion_sensor.py` — `_MotionSensor.tilt_angles()` + `reset_yaw()` round-trip.
- `static/examples/line_follow_p.py` — Python example.
- `static/examples/line_follow_p.llsp3` — Blockly example (single-project file).
- `tests/fixtures/examples/` — copy of the two examples for round-trip tests.

**Modified files:**
- `js/simulator.js` — perturbation hook in `_animateTank`, reset, sensor-snapshot adds `yaw_dDeg`, `reset_yaw` command, draw-arrow overlay.
- `js/main.js` — Noise panel wiring, idle `setInterval`, run/stop hooks, Examples dropdown.
- `index.html` — Noise panel + Examples dropdown markup.
- `css/main.css` (or whichever CSS file the existing speed/theme controls use — confirm at task time) — minor styles for the Noise panel.
- `py/spike_bridge.py` — `_MotionSensor.tilt_angles()` reads `_state['yaw_dDeg']`, `reset_yaw()` sends bridge command, `_state` initial values fixed to math y-up.
- `js/monaco_config.js` — add `tilt_angles` and `reset_yaw` to `SPIKE_API` for completion/hover.
- `tests/js/sim-helper.js` — load `noise_events.js` into the test vm context.
- `tests/js/state/sensor-state.test.js` — assert new `yaw_dDeg` field shape.
- `tests/py/mock_js.py` — `bridge_mock.install()` `_state` defaults match math y-up; include `yaw_dDeg`.
- `tests/py/run.py` — register `test_motion_sensor`.
- `CLAUDE.md` — manual smoke-test entry.
- `BACKLOG.md` — mark "Random Noise Events: poke variant" and `tilt_angles` stub as done; trim the "Example programs" entry.

---

## Task 1: `NoiseController` class

**Files:**
- Create: `js/noise_events.js`
- Create: `tests/js/noise/controller.test.js`
- Modify: `tests/js/sim-helper.js`

- [ ] **Step 1: Create the test file with the first failing test**

Write `tests/js/noise/controller.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');

const NOISE_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../../js/noise_events.js'), 'utf8',
);

function makeController(opts) {
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(NOISE_CODE, ctx);
  return new ctx.window.NoiseController(opts);
}

test('default state: mode off, strength medium, no active poke', () => {
  const c = makeController();
  assert.strictEqual(c.mode, 'off');
  assert.strictEqual(c.strength, 'medium');
  assert.strictEqual(c.activePoke, null);
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `node --test tests/js/noise/controller.test.js`
Expected: FAIL — `js/noise_events.js` does not exist.

- [ ] **Step 3: Create `js/noise_events.js` with minimal class**

```javascript
'use strict';

// NoiseController owns randomized "poke" perturbations applied to the robot's
// translational velocity each animation step. See
// docs/superpowers/specs/2026-05-09-random-poke-events-design.md.
class NoiseController {
  constructor(opts = {}) {
    this.rng         = opts.rng || Math.random;
    this.mode        = 'off';                     // 'off' | 'manual' | 'auto'
    this.strength    = 'medium';                  // 'light' | 'medium' | 'strong'
    this.autoMean_s  = 5;                         // mean seconds between auto pokes
    this.activePoke  = null;
    this.nextPokeAt_ms = this._sampleInterval();
  }

  _sampleInterval() {
    const min = this.autoMean_s * 500;
    const max = this.autoMean_s * 1500;
    return min + this.rng() * (max - min);
  }
}

if (typeof window !== 'undefined') window.NoiseController = NoiseController;
if (typeof module !== 'undefined') module.exports = { NoiseController };
```

- [ ] **Step 4: Run the test, expect pass**

Run: `node --test tests/js/noise/controller.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Add the `pokeNow` test**

Append to `tests/js/noise/controller.test.js`:

```javascript
test('pokeNow() with explicit side sets activePoke for medium strength', () => {
  const c = makeController();
  c.pokeNow(+1);
  assert.notStrictEqual(c.activePoke, null);
  assert.strictEqual(c.activePoke.side, +1);
  // medium = 50 mm displacement / 0.150 s duration = 333.33 mm/s
  assert.ok(Math.abs(c.activePoke.vPerpMag_mm_s - (50 / 0.150)) < 0.01);
  assert.strictEqual(c.activePoke.msRemaining, 150);
});

test('pokeNow() respects strength preset', () => {
  for (const [strength, mm] of [['light', 25], ['medium', 50], ['strong', 80]]) {
    const c = makeController();
    c.setStrength(strength);
    c.pokeNow(+1);
    assert.ok(
      Math.abs(c.activePoke.vPerpMag_mm_s - (mm / 0.150)) < 0.01,
      `strength=${strength} should map to ${mm}mm displacement`,
    );
  }
});
```

- [ ] **Step 6: Run, expect failure ("c.pokeNow is not a function")**

Run: `node --test tests/js/noise/controller.test.js`
Expected: FAIL.

- [ ] **Step 7: Implement `pokeNow` and `setStrength`**

Add to `NoiseController` in `js/noise_events.js`:

```javascript
  static STRENGTH_MM = { light: 25, medium: 50, strong: 80 };
  static POKE_DURATION_MS = 150;

  setStrength(s) {
    if (!(s in NoiseController.STRENGTH_MM)) throw new Error(`unknown strength: ${s}`);
    this.strength = s;
  }

  setMode(m) {
    if (!['off', 'manual', 'auto'].includes(m)) throw new Error(`unknown mode: ${m}`);
    this.mode = m;
  }

  setAutoMean(seconds) {
    if (!(seconds > 0)) throw new Error(`autoMean must be positive`);
    this.autoMean_s = seconds;
  }

  pokeNow(side) {
    if (side === undefined) side = this.rng() < 0.5 ? -1 : +1;
    const mm = NoiseController.STRENGTH_MM[this.strength];
    const duration_ms = NoiseController.POKE_DURATION_MS;
    this.activePoke = {
      side,
      vPerpMag_mm_s: mm / (duration_ms / 1000),
      msRemaining: duration_ms,
    };
  }
```

- [ ] **Step 8: Run, expect pass**

Run: `node --test tests/js/noise/controller.test.js`
Expected: PASS (3 tests).

- [ ] **Step 9: Add the `getPerturbation` tests**

Append:

```javascript
test('getPerturbation returns (0,0) when no poke active', () => {
  const c = makeController();
  const p = c.getPerturbation(Math.PI / 2);
  assert.strictEqual(p.vx, 0);
  assert.strictEqual(p.vy, 0);
});

test('getPerturbation: heading=π/2 north + side=+1 → push west (-x)', () => {
  const c = makeController();
  c.pokeNow(+1);
  const p = c.getPerturbation(Math.PI / 2);
  assert.ok(p.vx < -100, `vx should be strongly negative, got ${p.vx}`);
  assert.ok(Math.abs(p.vy) < 0.001, `vy ≈ 0, got ${p.vy}`);
});

test('getPerturbation: heading=0 east + side=-1 → push south (-y)', () => {
  const c = makeController();
  c.pokeNow(-1);
  const p = c.getPerturbation(0);
  assert.ok(Math.abs(p.vx) < 0.001, `vx ≈ 0, got ${p.vx}`);
  assert.ok(p.vy < -100, `vy should be strongly negative, got ${p.vy}`);
});

test('update(dt) decrements msRemaining; clears activePoke at zero', () => {
  const c = makeController();
  c.pokeNow(+1);
  assert.strictEqual(c.activePoke.msRemaining, 150);
  c.update(50);
  assert.strictEqual(c.activePoke.msRemaining, 100);
  c.update(120);    // would go negative → clear
  assert.strictEqual(c.activePoke, null);
});

test('getPerturbation returns (0,0) after poke expires', () => {
  const c = makeController();
  c.pokeNow(+1);
  c.update(200);    // poke is 150 ms; should be cleared
  const p = c.getPerturbation(Math.PI / 2);
  assert.strictEqual(p.vx, 0);
  assert.strictEqual(p.vy, 0);
});
```

- [ ] **Step 10: Run, expect failure**

Run: `node --test tests/js/noise/controller.test.js`
Expected: FAIL — `getPerturbation` and `update` not defined.

- [ ] **Step 11: Implement `getPerturbation` and `update` (manual-mode portion)**

Add to `NoiseController`:

```javascript
  getPerturbation(headingRad) {
    if (!this.activePoke || this.activePoke.msRemaining <= 0) {
      return { vx: 0, vy: 0 };
    }
    const perpHeading = headingRad + this.activePoke.side * (Math.PI / 2);
    const mag = this.activePoke.vPerpMag_mm_s;
    return { vx: mag * Math.cos(perpHeading), vy: mag * Math.sin(perpHeading) };
  }

  update(dt_ms) {
    if (this.activePoke) {
      this.activePoke.msRemaining -= dt_ms;
      if (this.activePoke.msRemaining <= 0) this.activePoke = null;
    }
    // Auto-mode scheduling lands in step 13.
  }
```

- [ ] **Step 12: Run, expect pass**

Run: `node --test tests/js/noise/controller.test.js`
Expected: PASS (8 tests).

- [ ] **Step 13: Add auto-mode tests**

Append:

```javascript
test('auto mode: update(dt) fires a poke after nextPokeAt_ms elapses', () => {
  // Seeded rng: returns 0.5 on every call (deterministic).
  const c = makeController({ rng: () => 0.5 });
  c.setMode('auto');
  c.setAutoMean(2);                 // window [1000, 3000] ms; rng=0.5 → 2000
  // Advance just under the interval — no poke yet.
  c.update(1999);
  assert.strictEqual(c.activePoke, null);
  // One more ms — should fire.
  c.update(1);
  assert.notStrictEqual(c.activePoke, null);
});

test('auto mode skips firing if a poke is already active', () => {
  const c = makeController({ rng: () => 0.5 });
  c.setMode('auto');
  c.setAutoMean(2);
  c.pokeNow(+1);                    // already active
  const sideBefore = c.activePoke.side;
  c.update(2000);                   // interval would fire, but activePoke != null
  assert.strictEqual(c.activePoke.side, sideBefore,
    'pre-existing poke should not be replaced');
});

test('off mode: update(dt) never fires pokes', () => {
  const c = makeController({ rng: () => 0.0 });   // would fire ASAP if mode=auto
  c.setMode('off');
  c.update(100000);
  assert.strictEqual(c.activePoke, null);
});

test('manual mode: update(dt) never auto-fires pokes', () => {
  const c = makeController({ rng: () => 0.0 });
  c.setMode('manual');
  c.update(100000);
  assert.strictEqual(c.activePoke, null);
});

test('reset() clears active poke and reseeds the auto timer', () => {
  const c = makeController({ rng: () => 0.5 });
  c.setMode('auto');
  c.pokeNow(+1);
  const interval = c.nextPokeAt_ms;
  c.update(interval - 1);
  c.reset();
  assert.strictEqual(c.activePoke, null);
  assert.ok(c.nextPokeAt_ms > 0, 'timer should be re-armed');
});
```

- [ ] **Step 14: Run, expect failure**

Run: `node --test tests/js/noise/controller.test.js`
Expected: FAIL — auto firing/reset not implemented.

- [ ] **Step 15: Implement auto firing + reset**

Replace the `update` method body and add `reset`:

```javascript
  update(dt_ms) {
    if (this.activePoke) {
      this.activePoke.msRemaining -= dt_ms;
      if (this.activePoke.msRemaining <= 0) this.activePoke = null;
    }
    if (this.mode !== 'auto') return;
    this.nextPokeAt_ms -= dt_ms;
    if (this.nextPokeAt_ms <= 0) {
      if (!this.activePoke) this.pokeNow();
      this.nextPokeAt_ms = this._sampleInterval();
    }
  }

  reset() {
    this.activePoke = null;
    this.nextPokeAt_ms = this._sampleInterval();
  }
```

- [ ] **Step 16: Run, expect pass**

Run: `node --test tests/js/noise/controller.test.js`
Expected: PASS (13 tests).

- [ ] **Step 17: Bridge `noise_events.js` into the test sim helper**

Modify `tests/js/sim-helper.js`. After `const SIM_CODE = …`, add:

```javascript
const NOISE_CODE = fs.readFileSync(
  path.resolve(__dirname, '../../js/noise_events.js'), 'utf8',
);
```

Inside `createSim`, after `vm.runInContext(RULER_CODE, context); context.window.ruler = context.ruler;`, before `vm.runInContext(SIM_CODE, context)`, add:

```javascript
  vm.runInContext(NOISE_CODE, context);
```

(`noise_events.js` self-assigns to `window.NoiseController`, so no manual bridge is needed.)

- [ ] **Step 18: Run all JS tests to confirm nothing else broke**

Run: `node --test tests/js/`
Expected: PASS — all existing tests still pass; the new noise tests pass too.

- [ ] **Step 19: Commit**

```bash
git add js/noise_events.js tests/js/noise/controller.test.js tests/js/sim-helper.js
git commit -m "feat(noise): NoiseController for randomized poke perturbations"
```

---

## Task 2: Wire perturbation into `_animateTank`

**Files:**
- Modify: `js/simulator.js` (`_animateTank`, constructor)
- Create: `tests/js/noise/perturb-integration.test.js`

- [ ] **Step 1: Write the integration test**

Create `tests/js/noise/perturb-integration.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

// _animateTank only runs if physics is initialised. The vm context's dynamic
// import of world_2d.js fails (test harness has no module loader), so we
// install a hand-rolled stub physics that the rest of _animateTank can drive.
function installStubPhysics(sim) {
  const robot = sim.robot;
  let vx = 0, vy = 0, omega = 0;
  sim.physics = {
    setKinematicVelocity: (_b, x, y, w) => { vx = x; vy = y; omega = w; },
    step: (dt_s) => {
      // Simple Euler integration; matches what Box2D would do for a kinematic
      // body driven purely by its imposed velocity.
      robot.x += vx * dt_s;
      robot.y += vy * dt_s;
      robot.heading += omega * dt_s * 180 / Math.PI;
    },
    readPose: () => ({
      x: robot.x, y: robot.y, angle: robot.heading * Math.PI / 180,
    }),
    setKinematicPose: () => {},
  };
  sim.robotBody = {};
  sim._physicsReady = Promise.resolve();
}

test('poke during _animateTank pushes robot laterally; heading unchanged', async () => {
  const sim = createSim();
  installStubPhysics(sim);

  // Robot at spawn (350, 163) heading 90° = north. Drive straight forward (no
  // wheel velocity differential), strong poke fires immediately.
  sim.noise.setStrength('strong');                  // 80 mm displacement
  sim.noise.pokeNow(+1);                            // push toward robot's left

  const headingBefore = sim.robot.heading;
  const xBefore = sim.robot.x;

  sim.isRunning = true;
  await sim._animateTank(0.5, 0.5, 100);            // forward for ~100 mm

  // 80 mm push west (heading=90°, side=+1 → +90° = 180° = -x).
  // Allow ±8 mm tolerance: integration is Euler and forward motion can
  // drag obstacles slightly in the real engine; in the stub it shouldn't.
  const dx = sim.robot.x - xBefore;
  assert.ok(dx <= -72 && dx >= -88, `expected ~-80 mm displacement in x, got ${dx}`);
  assert.ok(Math.abs(sim.robot.heading - headingBefore) < 1,
    `heading should be unchanged, got Δ=${sim.robot.heading - headingBefore}`);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test tests/js/noise/perturb-integration.test.js`
Expected: FAIL — `sim.noise` is undefined; `_animateTank` does not perturb.

- [ ] **Step 3: Construct a NoiseController in the simulator**

Modify `js/simulator.js`. In `RobotSimulator.constructor`, alongside the other initialisations (e.g., near `this._stopRequested = false;` at `js/simulator.js:144`), add:

```javascript
    this.noise = new (window.NoiseController || NoiseController)();
```

(Browser uses `window.NoiseController`; the test harness assigns to the same key.)

- [ ] **Step 4: Add the perturbation hook in `_animateTank`**

In `_animateTank` (inside the `for (let i = 0; i < totalSteps; i++)` loop), find the lines that compute the wheel-derived velocity:

```javascript
      const angle = this.robotBody.GetAngle();
      const v = window.kinematics.wheelsToBodyVelocity(
        leftV, rightV, angle, SPEED_MM_S, TRACK_W_MM,
      );

      this.physics.setKinematicVelocity(this.robotBody, v.vx, v.vy, v.angVel);
```

Replace with:

```javascript
      const angle = this.robotBody.GetAngle();
      const v = window.kinematics.wheelsToBodyVelocity(
        leftV, rightV, angle, SPEED_MM_S, TRACK_W_MM,
      );

      this.noise.update(wallStepMs);
      const perp = this.noise.getPerturbation(angle);

      this.physics.setKinematicVelocity(
        this.robotBody, v.vx + perp.vx, v.vy + perp.vy, v.angVel,
      );
```

Note: the test stub uses `robotBody = {}` (no `GetAngle`), so also adjust the stub's `GetAngle` if needed. **Easier:** in the test stub, add `sim.robotBody.GetAngle = () => sim.robot.heading * Math.PI / 180;`. Update the test from Step 1 to include this.

- [ ] **Step 5: Update the integration test stub to provide `GetAngle`**

In `tests/js/noise/perturb-integration.test.js`, update `installStubPhysics`:

```javascript
  sim.robotBody = {
    GetAngle: () => robot.heading * Math.PI / 180,
  };
```

- [ ] **Step 6: Run, expect pass**

Run: `node --test tests/js/noise/perturb-integration.test.js`
Expected: PASS.

- [ ] **Step 7: Run the full JS test suite**

Run: `node --test tests/js/`
Expected: PASS — existing physics/sensor tests should still pass since the perturbation is `(0, 0)` whenever no poke is active.

- [ ] **Step 8: Commit**

```bash
git add js/simulator.js tests/js/noise/perturb-integration.test.js
git commit -m "feat(noise): apply NoiseController perturbation in _animateTank"
```

---

## Task 3: Wire `RobotSimulator.reset()` to clear noise state

**Files:**
- Modify: `js/simulator.js` (`reset` method around `js/simulator.js:695`)
- Create: `tests/js/noise/reset.test.js`

- [ ] **Step 1: Write the test**

Create `tests/js/noise/reset.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('sim.reset() clears active poke and re-arms auto timer', () => {
  const sim = createSim();
  sim.noise.setMode('auto');
  sim.noise.pokeNow(+1);
  assert.notStrictEqual(sim.noise.activePoke, null);

  sim.reset();

  assert.strictEqual(sim.noise.activePoke, null);
  assert.ok(sim.noise.nextPokeAt_ms > 0);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test tests/js/noise/reset.test.js`
Expected: FAIL — `reset()` does not call `noise.reset()`.

- [ ] **Step 3: Update `reset()`**

In `js/simulator.js`, find the `reset()` method (currently around `js/simulator.js:695`). Right after `this._stopRequested = false;` and before the trail clear, add:

```javascript
    this.noise.reset();
```

- [ ] **Step 4: Run, expect pass**

Run: `node --test tests/js/noise/reset.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full JS test suite**

Run: `node --test tests/js/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add js/simulator.js tests/js/noise/reset.test.js
git commit -m "feat(noise): clear NoiseController state on simulator reset"
```

---

## Task 4: Noise UI panel HTML

**Files:**
- Modify: `index.html`
- Modify: the project's main CSS file (find by inspecting `<link rel="stylesheet">` tags in `index.html` — likely `css/main.css` or similar; do not assume.)

- [ ] **Step 1: Find the speed control to anchor the new panel near it**

Run: `grep -n 'id="speed' index.html`
Expected: locate the existing speed slider (e.g. `id="speed-slider"`), and the surrounding container — the noise panel goes alongside it in the toolbar.

- [ ] **Step 2: Find the active CSS file**

Run: `grep -n '<link.*stylesheet' index.html`
Expected: identify the stylesheet path (e.g. `css/main.css`).

- [ ] **Step 3: Add the noise panel markup**

In `index.html`, inside the toolbar/header section that contains the speed slider, add:

```html
<div class="noise-panel" id="noise-panel">
  <label class="noise-label">Noise:</label>
  <select id="noise-mode" aria-label="Noise mode">
    <option value="off">Off</option>
    <option value="manual">Manual</option>
    <option value="auto">Auto</option>
  </select>
  <select id="noise-strength" aria-label="Noise strength">
    <option value="light">Light</option>
    <option value="medium" selected>Medium</option>
    <option value="strong">Strong</option>
  </select>
  <button id="noise-poke-btn" hidden>Poke</button>
  <span id="noise-auto-rate" hidden>
    <input type="range" id="noise-auto-mean" min="2" max="12" step="1" value="5">
    <span id="noise-auto-mean-label">5s avg</span>
  </span>
</div>
```

- [ ] **Step 4: Add minimal CSS**

In the active CSS file, append:

```css
.noise-panel {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.noise-label {
  font-size: 0.85rem;
  opacity: 0.7;
}
#noise-poke-btn {
  /* Match the visual style of existing toolbar buttons. Confirm the existing
     button class name in index.html and reuse it instead of restyling here. */
}
```

- [ ] **Step 5: Smoke-check the page renders**

Run: `python3 -m http.server 8787` (in repo root) and open `http://localhost:8787`. Visually confirm: the Noise panel appears in the toolbar; mode dropdown defaults to "Off"; strength dropdown defaults to "Medium"; Poke button and auto-rate slider are hidden (because they are gated by mode).

- [ ] **Step 6: Commit**

```bash
git add index.html css/<file>
git commit -m "ui(noise): toolbar panel with mode/strength/poke controls"
```

---

## Task 5: Wire UI panel to `NoiseController`

**Files:**
- Modify: `js/main.js`
- Create: `tests/js/main/noise-panel.test.js`

- [ ] **Step 1: Write the persistence/visibility test**

Create `tests/js/main/noise-panel.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');
const { makeWindowGlobals } = require('../mocks/window');

// Lightweight test: verify the wireup function reads/writes localStorage and
// toggles control visibility in response to mode changes. We don't load all
// of main.js — instead extract a small wireNoisePanel(sim, doc, ls) helper
// and test that.

const MAIN_FNS_CODE = `
function wireNoisePanel(noise, doc, ls) {
  const modeEl   = doc.getElementById('noise-mode');
  const strEl    = doc.getElementById('noise-strength');
  const pokeBtn  = doc.getElementById('noise-poke-btn');
  const rateWrap = doc.getElementById('noise-auto-rate');
  const meanEl   = doc.getElementById('noise-auto-mean');
  const meanLbl  = doc.getElementById('noise-auto-mean-label');

  const restored = {
    mode:     ls.getItem('fll-vr-noise-mode')     || 'off',
    strength: ls.getItem('fll-vr-noise-strength') || 'medium',
    mean:     parseInt(ls.getItem('fll-vr-noise-mean') || '5', 10),
  };
  modeEl.value = restored.mode;  noise.setMode(restored.mode);
  strEl.value  = restored.strength; noise.setStrength(restored.strength);
  meanEl.value = String(restored.mean); noise.setAutoMean(restored.mean);
  meanLbl.textContent = restored.mean + 's avg';
  applyVisibility();

  function applyVisibility() {
    pokeBtn.hidden  = noise.mode !== 'manual';
    rateWrap.hidden = noise.mode !== 'auto';
  }

  modeEl.addEventListener('change', () => {
    noise.setMode(modeEl.value);
    ls.setItem('fll-vr-noise-mode', modeEl.value);
    applyVisibility();
  });
  strEl.addEventListener('change', () => {
    noise.setStrength(strEl.value);
    ls.setItem('fll-vr-noise-strength', strEl.value);
  });
  meanEl.addEventListener('input', () => {
    const v = parseInt(meanEl.value, 10);
    noise.setAutoMean(v);
    ls.setItem('fll-vr-noise-mean', String(v));
    meanLbl.textContent = v + 's avg';
  });
  pokeBtn.addEventListener('click', () => noise.pokeNow());
}
module.exports = { wireNoisePanel };
`;

function setupDom() {
  const { window, document } = makeWindowGlobals();
  // Inject the IDs the wire function looks for.
  for (const id of ['noise-mode', 'noise-strength', 'noise-poke-btn',
                    'noise-auto-rate', 'noise-auto-mean', 'noise-auto-mean-label']) {
    const el = document.createElement(id.includes('mode') || id.includes('strength')
      ? 'select' : id.includes('mean') && !id.includes('label') ? 'input' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
  return { window, document };
}

test('wireNoisePanel restores from localStorage and applies visibility', () => {
  const { document } = setupDom();
  const ls = (() => {
    const m = new Map([
      ['fll-vr-noise-mode', 'auto'],
      ['fll-vr-noise-strength', 'strong'],
      ['fll-vr-noise-mean', '7'],
    ]);
    return {
      getItem: k => m.has(k) ? m.get(k) : null,
      setItem: (k, v) => m.set(k, v),
    };
  })();
  const NOISE_CODE = fs.readFileSync(
    path.resolve(__dirname, '../../../js/noise_events.js'), 'utf8',
  );
  const ctx = vm.createContext({ window: {}, console });
  vm.runInContext(NOISE_CODE, ctx);
  const noise = new ctx.window.NoiseController();

  const { wireNoisePanel } = (() => {
    const modCtx = { module: { exports: {} } };
    vm.runInNewContext(MAIN_FNS_CODE + '\nmodule.exports = { wireNoisePanel };', modCtx);
    return modCtx.module.exports;
  })();

  wireNoisePanel(noise, document, ls);

  assert.strictEqual(noise.mode, 'auto');
  assert.strictEqual(noise.strength, 'strong');
  assert.strictEqual(noise.autoMean_s, 7);
  assert.strictEqual(document.getElementById('noise-poke-btn').hidden, true);  // not manual
  assert.strictEqual(document.getElementById('noise-auto-rate').hidden, false);
});
```

(If `tests/js/mocks/window.js` does not export `createElement`/`appendChild`/`addEventListener`/`querySelector`/etc., extend it minimally to support this test. Read it first to see what's there.)

- [ ] **Step 2: Run, expect failure**

Run: `node --test tests/js/main/noise-panel.test.js`
Expected: FAIL until `wireNoisePanel` exists in `js/main.js`.

- [ ] **Step 3: Implement `wireNoisePanel` in `js/main.js`**

Add to `js/main.js`, near other init helpers:

```javascript
const NOISE_MODE_KEY     = 'fll-vr-noise-mode';
const NOISE_STRENGTH_KEY = 'fll-vr-noise-strength';
const NOISE_MEAN_KEY     = 'fll-vr-noise-mean';

function wireNoisePanel(noise, doc, ls) {
  const modeEl   = doc.getElementById('noise-mode');
  const strEl    = doc.getElementById('noise-strength');
  const pokeBtn  = doc.getElementById('noise-poke-btn');
  const rateWrap = doc.getElementById('noise-auto-rate');
  const meanEl   = doc.getElementById('noise-auto-mean');
  const meanLbl  = doc.getElementById('noise-auto-mean-label');

  const mode     = ls.getItem(NOISE_MODE_KEY)     || 'off';
  const strength = ls.getItem(NOISE_STRENGTH_KEY) || 'medium';
  const mean     = parseInt(ls.getItem(NOISE_MEAN_KEY) || '5', 10);

  modeEl.value = mode;       noise.setMode(mode);
  strEl.value  = strength;   noise.setStrength(strength);
  meanEl.value = String(mean); noise.setAutoMean(mean);
  meanLbl.textContent = mean + 's avg';
  applyVisibility();

  function applyVisibility() {
    pokeBtn.hidden  = noise.mode !== 'manual';
    rateWrap.hidden = noise.mode !== 'auto';
  }

  modeEl.addEventListener('change', () => {
    noise.setMode(modeEl.value);
    ls.setItem(NOISE_MODE_KEY, modeEl.value);
    applyVisibility();
  });
  strEl.addEventListener('change', () => {
    noise.setStrength(strEl.value);
    ls.setItem(NOISE_STRENGTH_KEY, strEl.value);
  });
  meanEl.addEventListener('input', () => {
    const v = parseInt(meanEl.value, 10);
    noise.setAutoMean(v);
    ls.setItem(NOISE_MEAN_KEY, String(v));
    meanLbl.textContent = v + 's avg';
  });
  pokeBtn.addEventListener('click', () => noise.pokeNow());
}
```

- [ ] **Step 4: Call `wireNoisePanel` from main.js init**

Find where existing controls (speed, theme) are wired up in `js/main.js`. After the `sim` is created and the speed control is wired, add:

```javascript
  wireNoisePanel(sim.noise, document, window.localStorage);
```

- [ ] **Step 5: Add idle setInterval driving `noise.update()` so manual mode advances when no program is running**

In `js/main.js`, near the other init code, add:

```javascript
  // ~30 Hz idle pulse so the noise controller keeps decrementing activePoke
  // even when no program is running (manual pokes still need to time out).
  const NOISE_IDLE_MS = 33;
  setInterval(() => {
    if (!sim.isRunning) sim.noise.update(NOISE_IDLE_MS);
  }, NOISE_IDLE_MS);
```

- [ ] **Step 6: Run the noise-panel test, expect pass**

Run: `node --test tests/js/main/noise-panel.test.js`
Expected: PASS.

- [ ] **Step 7: Run the full JS test suite**

Run: `node --test tests/js/`
Expected: PASS.

- [ ] **Step 8: Manual smoke check in the browser**

`python3 -m http.server 8787`, open `http://localhost:8787`. Switch noise mode to Manual; the Poke button appears. Click it: nothing visible *yet* — the arrow overlay is Task 6, but program-driven motion will already be perturbed. Set mode to Auto / Strong; load any default program; run; observe the robot wobble.

- [ ] **Step 9: Commit**

```bash
git add js/main.js tests/js/main/noise-panel.test.js
git commit -m "ui(noise): wire panel controls and idle update loop"
```

---

## Task 6: Renderer arrow overlay during a poke

**Files:**
- Modify: `js/simulator.js` (the robot drawing path; locate via `grep -n '_drawRobot\|ctx.rotate' js/simulator.js`)

- [ ] **Step 1: Locate the robot draw method**

Run: `grep -n '_drawRobot\|drawRobot' js/simulator.js`
Expected: identifies the function (e.g. `_drawRobot` near line 400). Read it to understand its current signature and the canvas transform stack it leaves the context in.

- [ ] **Step 2: Add the arrow draw call**

After the robot body is drawn, but before the canvas transform is restored, add:

```javascript
    if (this.noise && this.noise.activePoke) {
      this._drawPokeArrow(ctx, this.noise.activePoke);
    }
```

Add the helper method on the simulator class (near the other draw helpers):

```javascript
  // Draws a small inwards-pointing chevron on the side of the robot being
  // poked. ctx is already translated to robot center and rotated to the
  // robot's heading frame (body-local +X = forward).
  _drawPokeArrow(ctx, poke) {
    // side = +1 → pushed toward robot's left. The chevron points INWARD
    // (toward body) on the side the poke is coming FROM, so it goes on the
    // opposite side: side=+1 → arrow on the RIGHT (-Y in body frame).
    const yLocal = poke.side * (ROBOT_BODY_W / 2 + 18);
    const fade = Math.max(0, poke.msRemaining / 150);
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = '#ff5050';
    ctx.beginPath();
    ctx.moveTo(0, yLocal);
    ctx.lineTo(-12, yLocal + (poke.side > 0 ? -10 : 10));
    ctx.lineTo(+12, yLocal + (poke.side > 0 ? -10 : 10));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
```

(Confirm the body-local axis convention — body-local `+X` = forward, `+Y` = left in the existing draw code — by reading the existing `_drawRobot` orientation. If `+Y` = right instead, flip the sign on `yLocal`.)

- [ ] **Step 3: Manual smoke check**

`python3 -m http.server 8787`, set noise mode to Manual, click Poke while the robot is moving. A red chevron should appear on the side the robot is being pushed away from, fading over ~150 ms.

- [ ] **Step 4: Commit**

```bash
git add js/simulator.js
git commit -m "ui(noise): chevron overlay during active poke"
```

---

## Task 7: Sim-side gyro snapshot + `reset_yaw` command

**Files:**
- Modify: `js/simulator.js` (`_sensorState`, `_execCmd`, `reset`, constructor)
- Modify: `tests/js/state/sensor-state.test.js`
- Create: `tests/js/sensors/gyro.test.js`

- [ ] **Step 1: Read existing `_sensorState`**

Run: `grep -n '_sensorState' js/simulator.js`
Expected: locate the method (around `js/simulator.js:789`). Read the surrounding code so the next edit drops in cleanly.

- [ ] **Step 2: Write the gyro test**

Create `tests/js/sensors/gyro.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('_sensorState includes yaw_dDeg = 0 right after reset', () => {
  const sim = createSim();
  sim.reset();
  const s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 0);
});

test('yaw_dDeg = -CCW * 10: heading rotates +30° (CCW) → yaw -300 dDeg', () => {
  const sim = createSim();
  sim.reset();   // capture spawn heading=90 as zero
  sim.robot.heading = 90 + 30;   // CCW 30° from spawn
  const s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, -300);
});

test('reset_yaw command sets yaw to the supplied dDeg value', async () => {
  const sim = createSim();
  sim.robot.heading = 90;
  await sim._execCmd({ type: 'reset_yaw', angle_dDeg: 0 });
  let s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 0);

  sim.robot.heading = 120;       // CCW 30°
  s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, -300);

  await sim._execCmd({ type: 'reset_yaw', angle_dDeg: 900 });
  s = sim._sensorState();
  assert.strictEqual(s.yaw_dDeg, 900);
});

test('yaw_dDeg wraps into [-1800, 1800]', () => {
  const sim = createSim();
  sim.reset();
  sim.robot.heading = 90 + 200;   // would be -2000 dDeg unwrapped
  const s = sim._sensorState();
  assert.ok(s.yaw_dDeg >= -1800 && s.yaw_dDeg <= 1800,
    `expected wrap to [-1800,1800], got ${s.yaw_dDeg}`);
  // 200° CCW = -200° in LEGO frame → +160° in [-180,180] → +1600 dDeg
  assert.strictEqual(s.yaw_dDeg, 1600);
});
```

- [ ] **Step 3: Run, expect failure**

Run: `node --test tests/js/sensors/gyro.test.js`
Expected: FAIL — `_sensorState` does not include `yaw_dDeg`.

- [ ] **Step 4: Add yaw tracking to the simulator**

In `js/simulator.js` `RobotSimulator.constructor`, near `this._stopRequested = false;`, add:

```javascript
    this._yawZeroHeading_deg = this.robot.heading;
```

In `reset()`, after `this.robot = makeRobotState();`, add:

```javascript
    this._yawZeroHeading_deg = this.robot.heading;
```

Add a private helper near the other state helpers:

```javascript
  _yawDeciDeg() {
    // LEGO yaw is CW-positive; sim heading is CCW-positive. Negate, scale by 10.
    let d = -(this.robot.heading - this._yawZeroHeading_deg) * 10;
    // Wrap to [-1800, +1800].
    d = ((d + 1800) % 3600 + 3600) % 3600 - 1800;
    return d;
  }
```

In `_sensorState`, add `yaw_dDeg` to the returned object:

```javascript
  _sensorState() {
    const r = this.robot;
    return {
      x:           r.x,
      y:           r.y,
      heading:     r.heading,
      yaw_dDeg:    this._yawDeciDeg(),
      color:       r.sensors.colorValue,
      distance_mm: r.sensors.distanceMM,
      motors:      { ...r.motors },
      stopped:     false,
    };
  }
```

In `_execCmd`'s switch, add a case:

```javascript
      case 'reset_yaw':
        // angle_dDeg lets the program assert "yaw should read N here" without
        // physically rotating the robot.
        this._yawZeroHeading_deg = this.robot.heading + (cmd.angle_dDeg || 0) / 10;
        break;
```

- [ ] **Step 5: Run, expect pass**

Run: `node --test tests/js/sensors/gyro.test.js`
Expected: PASS.

- [ ] **Step 6: Update `tests/js/state/sensor-state.test.js` for the new field**

Read the current test file. It almost certainly asserts the shape of `_sensorState()`. Add an assertion that `yaw_dDeg` is present and is a number; do not assume the existing test has a strict equality on the whole object (verify by reading first). If the test asserts an exact object shape, add `yaw_dDeg: 0` to the expected.

- [ ] **Step 7: Run the full JS suite**

Run: `node --test tests/js/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/simulator.js tests/js/sensors/gyro.test.js tests/js/state/sensor-state.test.js
git commit -m "feat(motion-sensor): emit yaw_dDeg in sensor snapshot, reset_yaw cmd"
```

---

## Task 8: Python-side gyro: `tilt_angles()` + `reset_yaw()`

**Files:**
- Modify: `py/spike_bridge.py` (`_state` defaults at line 35; `_MotionSensor` at line 421)
- Modify: `tests/py/mock_js.py` (`_state` defaults; add `yaw_dDeg`)
- Create: `tests/py/test_motion_sensor.py`
- Modify: `tests/py/run.py` (register the new test module)
- Modify: `js/monaco_config.js` — add `tilt_angles` and `reset_yaw` to `SPIKE_API`

- [ ] **Step 1: Fix the stale `_state` defaults in `spike_bridge.py`**

Replace lines 34-39 of `py/spike_bridge.py`:

```python
_state = {
    'x': 350, 'y': 163, 'heading': 90,
    'color': 'none', 'distance_mm': 300,
    'yaw_dDeg': 0,
    'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
    'stopped': False,
}
```

- [ ] **Step 2: Mirror the fix in `mock_js.py`**

In `tests/py/mock_js.py`, update `bridge_mock.install()` (lines 65-75):

```python
    def install(self):
        import spike_bridge as sb
        sb._test_intercept = self._capture
        sb._state.clear()
        sb._state.update({
            'x': 350, 'y': 163, 'heading': 90,
            'color': 'none', 'distance_mm': 300,
            'yaw_dDeg': 0,
            'motors': {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'E': 0, 'F': 0},
            'stopped': False,
        })
        self._calls = []
```

- [ ] **Step 3: Write the motion sensor test**

Create `tests/py/test_motion_sensor.py`:

```python
"""Tests for hub.motion_sensor.tilt_angles and reset_yaw."""
import unittest
import mock_js
import spike_bridge as sb


class TestMotionSensor(unittest.TestCase):

    def setUp(self):
        mock_js.bridge_mock.install()

    def test_tilt_angles_returns_yaw_pitch_roll_tuple(self):
        result = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(len(result), 3)

    def test_tilt_angles_yaw_reads_from_state(self):
        sb._state['yaw_dDeg'] = 450
        yaw, pitch, roll = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(yaw, 450)
        self.assertEqual(pitch, 0)
        self.assertEqual(roll, 0)

    def test_tilt_angles_yaw_negative(self):
        sb._state['yaw_dDeg'] = -300
        yaw, _, _ = sb.hub.motion_sensor.tilt_angles()
        self.assertEqual(yaw, -300)

    def test_reset_yaw_default_sends_zero(self):
        sb.hub.motion_sensor.reset_yaw()
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd, {'type': 'reset_yaw', 'angle_dDeg': 0})

    def test_reset_yaw_with_angle(self):
        sb.hub.motion_sensor.reset_yaw(900)
        cmd = mock_js.bridge_mock.last()
        self.assertEqual(cmd, {'type': 'reset_yaw', 'angle_dDeg': 9000})
        # Note: LEGO API takes degrees, bridge command carries decidegrees.


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 4: Register the new test module in the runner**

Modify `tests/py/run.py`. After `import test_motor_sensor_gaps`, add:

```python
import test_motion_sensor
```

And in the `for mod in [...]` list, append `test_motion_sensor`.

- [ ] **Step 5: Run, expect failure**

Run: `python3 tests/py/run.py`
Expected: FAIL — `tilt_angles()` returns frozen `(0, 0, 0)`; `reset_yaw()` returns no-op without sending a command.

- [ ] **Step 6: Implement `tilt_angles()` and `reset_yaw()` in `_MotionSensor`**

Replace lines 430 and 433 of `py/spike_bridge.py`:

```python
    def tilt_angles(self):
        # Returns (yaw, pitch, roll) in decidegrees per LEGO convention.
        # Top-down sim has no third axis, so pitch and roll are always 0.
        return (_state.get('yaw_dDeg', 0), 0, 0)

    def angular_velocity(self, raw_unfiltered=False): return (0, 0, 0)
    def acceleration(self, raw_unfiltered=False):     return (0, 0, 981)

    def reset_yaw(self, angle=0):
        # angle is in degrees per LEGO docs; the bridge carries decidegrees.
        return _bridge_call({'type': 'reset_yaw', 'angle_dDeg': int(angle * 10)})
```

(Remove the existing `def reset_yaw(self, angle=0): return _NoopAwaitable()` line.)

- [ ] **Step 7: Run, expect pass**

Run: `python3 tests/py/run.py`
Expected: PASS — all Python tests, including the new motion sensor tests.

- [ ] **Step 8: Add `tilt_angles` and `reset_yaw` to Monaco SPIKE_API**

Open `js/monaco_config.js`. Find the `SPIKE_API` table entries for `motion_sensor` (search for `motion_sensor` in the file). Add or update entries:

```javascript
  'motion_sensor.tilt_angles': {
    sig: 'motion_sensor.tilt_angles() -> (yaw, pitch, roll)',
    doc: 'Returns yaw, pitch, roll in decidegrees. Yaw is driven from simulator heading; pitch and roll are always 0.',
    params: [],
  },
  'motion_sensor.reset_yaw': {
    sig: 'motion_sensor.reset_yaw(angle=0)',
    doc: 'Records the current heading as the new yaw zero (or as `angle` degrees if supplied).',
    params: [{ name: 'angle', type: 'int', default: 0 }],
  },
```

(Match the exact key style used by the file's existing `motion_sensor.*` entries — read first.)

- [ ] **Step 9: Commit**

```bash
git add py/spike_bridge.py tests/py/mock_js.py tests/py/test_motion_sensor.py tests/py/run.py js/monaco_config.js
git commit -m "feat(motion-sensor): tilt_angles reads sim yaw; reset_yaw plumbed"
```

---

## Task 9: Examples dropdown UI + loader

**Files:**
- Modify: `index.html` (header next to Open/Save buttons)
- Modify: `js/main.js`
- (Examples *content* is Task 10; this task wires the *plumbing*.)

- [ ] **Step 1: Find the Open/Save buttons in `index.html`**

Run: `grep -n 'btn-open\|btn-save\|Open\|Save' index.html`
Expected: locates the existing Open/Save markup. Read it to understand the surrounding container.

- [ ] **Step 2: Add the Examples dropdown**

Next to the existing Open/Save buttons, add:

```html
<select id="examples-dropdown" aria-label="Load example">
  <option value="" selected>Examples…</option>
  <option value="line_follow_p">Line follow (P controller)</option>
</select>
```

- [ ] **Step 3: Locate the existing project-load entry point**

Run: `grep -n 'loadProject\|llsp3.*load\|openFile\|llsp3_io' js/main.js`
Expected: finds the function that handles the existing Open button. The Examples dropdown reuses this entry point — it just feeds it bytes from `static/examples/<name>.llsp3` instead of from a `<input type=file>`.

- [ ] **Step 4: Add the loader hook in `js/main.js`**

Add an init helper:

```javascript
async function wireExamplesDropdown() {
  const sel = document.getElementById('examples-dropdown');
  if (!sel) return;
  sel.addEventListener('change', async () => {
    const key = sel.value;
    sel.value = '';
    if (!key) return;
    if (dirty && !confirm('Discard current changes and load example?')) return;

    const url = `static/examples/${key}.llsp3`;
    const resp = await fetch(url);
    if (!resp.ok) {
      appendOutput(`[!] Failed to load example: ${resp.status}`, 'error');
      return;
    }
    const buf = await resp.arrayBuffer();
    // Reuse the existing llsp3 ingest path. The exact function name lives in
    // js/llsp3_io.js (or similar) — find it via grep at task time and call it.
    await window.loadLlsp3Bytes(new Uint8Array(buf), { fromExample: key });
  });
}
```

Call `wireExamplesDropdown();` from the same init block that wires the noise panel.

- [ ] **Step 5: Verify `window.loadLlsp3Bytes` (or the equivalent) exists**

Run: `grep -n 'loadLlsp3\|loadProject\|llsp3.*Bytes' js/llsp3_io.js js/main.js`
Expected: locates the actual function name. Update the call in step 4 if it differs. If the function is not exposed on `window`, expose it (one-line `window.loadLlsp3Bytes = …` near its definition).

- [ ] **Step 6: Manual smoke check (the dropdown does not load anything yet)**

`python3 -m http.server 8787`, open the page. Confirm the dropdown renders next to Open/Save and the only entry is "Line follow (P controller)". Selecting it should hit the fetch and produce a 404 (because Task 10 hasn't created the file yet) — that is the expected failure mode at this point. Watch the console for the 404 entry to confirm the wiring fires.

- [ ] **Step 7: Commit**

```bash
git add index.html js/main.js
git commit -m "ui(examples): dropdown + loader plumbing for example programs"
```

---

## Task 10: Line-follow example content (Python + Blockly)

**Files:**
- Create: `static/examples/line_follow_p.py`
- Create: `static/examples/line_follow_p.llsp3`
- Create: `tests/fixtures/examples/line_follow_p.llsp3` — fixture copy
- Create: `tests/js/llsp3/example-roundtrip.test.js` — verify the bundled `.llsp3` can be loaded by the existing parser

- [ ] **Step 1: Write the Python example**

Create `static/examples/line_follow_p.py`:

```python
# Line-follow P controller demo
#
# Drives north from spawn, finds the black east-west line, pivots east,
# then runs a proportional controller against the color-sensor reflection
# to stay on the line. Random poke events (Noise panel → Auto/Medium)
# disturb the robot perpendicularly; the P loop steers it back.
#
# Tuning notes:
# - Reflection in this simulator is a step function: black ≈ 5, off ≈ 50.
#   target = midpoint = 27.
# - Higher Kp = faster reacquisition but louder oscillation.

from hub import motion_sensor, port
import color_sensor
import motor_pair
import runloop


PAIR    = motor_pair.PAIR_1
LEFT    = port.A
RIGHT   = port.B
SENSOR  = port.E
TARGET  = 27
KP      = 1.2
SPEED   = 400


async def main():
    motor_pair.pair(PAIR, LEFT, RIGHT)

    # Phase 1: drive north until sensor sees the line.
    motor_pair.move(PAIR, 0, velocity=SPEED)
    while await color_sensor.reflection(SENSOR) >= 30:
        await runloop.sleep_ms(20)

    # Phase 2: pivot in place 90° clockwise (LEGO yaw +90°).
    await motor_pair.move_for_degrees(PAIR, 360, 100, velocity=300)

    # Phase 3: P-controller line follow.
    while True:
        error = await color_sensor.reflection(SENSOR) - TARGET
        steering = max(-100, min(100, int(KP * error)))
        motor_pair.move(PAIR, steering, velocity=SPEED)
        await runloop.sleep_ms(20)


runloop.run(main())
```

(Match exact API surface against `py/spike_bridge.py` — names like `motor_pair.pair`, `motor_pair.move`, `color_sensor.reflection`, `runloop.sleep_ms` may differ; substitute whichever the bridge actually exposes. Read the bridge first.)

- [ ] **Step 2: Smoke-run the Python example in the browser**

`python3 -m http.server 8787`, open the page. Switch to the Python editor, paste the example into the editor (since the dropdown loader is .llsp3-only, paste manually for this step), Run. Confirm: robot drives north, hits the line, pivots, then begins line-following along y=463. Set noise to Auto/Medium and watch recovery.

If pivot direction or line acquisition behaves wrong, fix the code in `line_follow_p.py` until the demo works end to end. (Pivot direction depends on which motor port is left vs right and which steering sign turns CW; the bridge docs in `py/spike_bridge.py` are the source of truth.)

- [ ] **Step 3: Build the Blockly equivalent**

Open the page, switch to the Blocks editor. Hand-build the equivalent program with the available blocks (drive forward, until-condition, motor-pair pivot, repeat-forever with the steering computation). Save as a `.llsp3` via the existing Save button to `static/examples/line_follow_p.llsp3` (move the file there manually after the browser download).

- [ ] **Step 4: Verify the dropdown loads it**

Reload the page, select "Line follow (P controller)" from the Examples dropdown. The Blocks editor should populate with the program. Run; same demo behavior as in step 2.

- [ ] **Step 5: Add a roundtrip test**

Copy the working `.llsp3` to `tests/fixtures/examples/line_follow_p.llsp3`. Then create `tests/js/llsp3/example-roundtrip.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');

test('bundled line_follow_p.llsp3 parses without error', () => {
  const fixturePath = path.resolve(
    __dirname, '../../fixtures/examples/line_follow_p.llsp3',
  );
  const bytes = fs.readFileSync(fixturePath);
  // Use whichever parsing entry point the existing llsp3 tests use; run
  // `node --test tests/js/llsp3/` first to see the established pattern, then
  // mirror it here. The assertion is simply: parsing the bytes does not
  // throw and yields a non-empty workspace.
  const { parseLlsp3 } = require('../../../js/llsp3_io.js');  // adjust if export differs
  const project = parseLlsp3(bytes);
  assert.ok(project);
  assert.ok(project.python || project.blockly);
});
```

(Read the existing `tests/js/llsp3/*.test.js` files to see the exact import path and parser function name; adjust the test accordingly.)

- [ ] **Step 6: Run, expect pass**

Run: `node --test tests/js/llsp3/example-roundtrip.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add static/examples/line_follow_p.py static/examples/line_follow_p.llsp3 tests/fixtures/examples/line_follow_p.llsp3 tests/js/llsp3/example-roundtrip.test.js
git commit -m "feat(examples): line-follow P controller (Python + Blockly)"
```

---

## Task 11: Docs cleanup (CLAUDE.md + BACKLOG.md)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `BACKLOG.md`

- [ ] **Step 1: Add the manual smoke test entry to CLAUDE.md**

In `CLAUDE.md`, after the "Constraints" section, add a new section:

```markdown
## Smoke tests

After touching the noise system, simulator, motion sensor, or examples:

- Open `http://localhost:8787` (`python3 -m http.server 8787`).
- Examples dropdown → **Line follow (P controller)**.
- Set Noise → **Auto** / **Medium**.
- Run. Expected: robot drives north, finds the line, pivots east, follows the line, recovers from periodic side-pokes. Strong pokes can throw it off the line entirely (intended — that is the gain-tuning lesson).
```

- [ ] **Step 2: Update BACKLOG.md**

In `BACKLOG.md`:

- Under **Sensor stubs that need real values**, remove (or strike through) the `tilt_angles()` portion of the Motion sensor bullet, leaving the rest of the motion-sensor stubs intact.
- Under **Random Noise Events**, remove the "Like poking the robot away from its course…" bullet. Leave the friction-variation bullet and a follow-up note that auto/manual pokes are now in place.
- Under **Program Management → Example programs**, update the bullet to note that the dropdown UI exists with one entry (line follow) and more programs are still wanted.

- [ ] **Step 3: Run the full test suite one more time**

```
node --test tests/js/
python3 tests/py/run.py
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md BACKLOG.md
git commit -m "docs: smoke test for noise events; trim BACKLOG entries"
```

---

## Self-review checklist (run before handoff)

- **Spec coverage:**
  - Architecture (NoiseController, simulator patch, UI panel) → Tasks 1, 2, 4, 5.
  - Reset on stop → Task 3.
  - Renderer overlay → Task 6.
  - Gyro fix (sim + bridge + Monaco) → Tasks 7, 8.
  - Examples dropdown UI → Task 9.
  - Two example programs → Task 10.
  - Smoke test in CLAUDE.md, BACKLOG cleanup → Task 11.
- **Placeholder scan:** None — every step contains the code or shell command needed.
- **Type consistency:** `NoiseController` API names (`pokeNow`, `getPerturbation`, `update`, `reset`, `setMode`, `setStrength`, `setAutoMean`, `activePoke`, `nextPokeAt_ms`) used consistently across Tasks 1–5. `_yawZeroHeading_deg` and `_yawDeciDeg` consistent in Task 7. `yaw_dDeg` field name consistent across Tasks 7 and 8.
