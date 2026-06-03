# Poke & Friction Modifiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement timer-based poke events and a global friction multiplier as per-mission difficulty modifiers, wired into the existing missions schema, engine, simulator, and editor.

**Architecture:** The mission schema's `modifiers` stub is replaced with a structured `{ poke, friction }` shape. The simulator gains two new hooks (`applyPoke`, `setFrictionMultiplier`). The mission engine's 60 Hz tick schedules and fires pokes by calling the sim directly (passed as a 3rd argument to `tick`). The mission app wires friction at load time. The editor gains a collapsible accordion for authoring modifier settings.

**Tech Stack:** Vanilla JS (IIFE modules, no build step), Node built-in test runner (`node:test`/`node:assert`), existing `makeMissionsEnv` + `sim-helper` test utilities.

---

### Task 1: Schema migration — loader normalisation

**Files:**
- Modify: `js/mission_loader.js` (around line 100, the `modifiers:` line)
- Test: `tests/js/missions/loader-modifiers.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/js/missions/loader-modifiers.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_loader']).ctx;
}

const BASE = {
  schema_version: 1, id: 'm1', title: 'M1', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 350, y: 163, heading: 90 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 's1', title: 'S1', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'red' } }],
  scoring: { kind: 'step_sum' },
};

test('loader: normalises old {available,defaults} shape to new poke/friction shape', () => {
  const ctx = env();
  const m = ctx.MISSIONS.loader.load({ ...BASE, modifiers: { available: [], defaults: {} } });
  assert.deepStrictEqual(m.modifiers.poke,     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 });
  assert.deepStrictEqual(m.modifiers.friction, { enabled: false, multiplier: 1.0 });
});

test('loader: preserves poke.enabled=true from new schema shape', () => {
  const ctx = env();
  const m = ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: {
      poke:     { enabled: true, interval_min_s: 5, interval_max_s: 12, severity: 0.6 },
      friction: { enabled: false, multiplier: 1.0 },
    },
  });
  assert.strictEqual(m.modifiers.poke.enabled, true);
  assert.strictEqual(m.modifiers.poke.severity, 0.6);
});

test('loader: normalises missing modifiers field to defaults', () => {
  const ctx = env();
  const m = ctx.MISSIONS.loader.load(BASE);
  assert.strictEqual(m.modifiers.poke.enabled, false);
  assert.strictEqual(m.modifiers.friction.enabled, false);
  assert.strictEqual(m.modifiers.friction.multiplier, 1.0);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/missions/loader-modifiers.test.js
```

Expected: 3 failures — `modifiers.poke` is undefined because the loader still returns the old shape.

- [ ] **Step 3: Replace the modifiers normalisation in `js/mission_loader.js`**

Find the line (around line 100):
```js
      modifiers: raw.modifiers || { available: [], defaults: {} },
```

Replace it with:
```js
      modifiers: _normaliseModifiers(raw.modifiers),
```

Then add this helper function **above** the `load` function (before `function load(raw)`):
```js
  function _normaliseModifiers(raw) {
    const m = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const p = (m.poke     && typeof m.poke === 'object')     ? m.poke     : {};
    const f = (m.friction && typeof m.friction === 'object') ? m.friction : {};
    return {
      poke: {
        enabled:        !!(p.enabled),
        interval_min_s: typeof p.interval_min_s === 'number' ? p.interval_min_s : 8,
        interval_max_s: typeof p.interval_max_s === 'number' ? p.interval_max_s : 15,
        severity:       typeof p.severity       === 'number' ? p.severity       : 0.4,
      },
      friction: {
        enabled:    !!(f.enabled),
        multiplier: typeof f.multiplier === 'number' ? f.multiplier : 1.0,
      },
    };
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
node --test tests/js/missions/loader-modifiers.test.js
```

Expected: 3 passes.

- [ ] **Step 5: Run the full missions test suite to confirm no regressions**

```bash
node --test tests/js/missions/
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add js/mission_loader.js tests/js/missions/loader-modifiers.test.js
git commit -m "feat(modifiers): normalise mission modifiers schema in loader"
```

---

### Task 2: Editor state — new modifiers shape + setModifiers

**Files:**
- Modify: `js/mission_editor_state.js`
- Test: `tests/js/missions/editor-state-modifiers.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/js/missions/editor-state-modifiers.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
  ]).ctx;
}

test('editor-state: createBlank returns new poke/friction modifiers shape', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  assert.deepStrictEqual(s.modifiers.poke,     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 });
  assert.deepStrictEqual(s.modifiers.friction, { enabled: false, multiplier: 1.0 });
});

test('editor-state: clone deep-copies the poke object', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const c = ctx.MISSIONS.editor.state.clone(s);
  c.modifiers.poke.enabled = true;
  assert.strictEqual(s.modifiers.poke.enabled, false, 'original must not be mutated');
});

test('editor-state: setModifiers enables poke', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const next = ctx.MISSIONS.editor.state.setModifiers(s, { poke: { enabled: true } });
  assert.strictEqual(next.modifiers.poke.enabled, true);
  assert.strictEqual(next.modifiers.poke.interval_min_s, 8, 'unchanged fields preserved');
  assert.strictEqual(next.dirty, true);
});

test('editor-state: setModifiers updates friction multiplier', () => {
  const ctx = env();
  const s = ctx.MISSIONS.editor.state.createBlank();
  const next = ctx.MISSIONS.editor.state.setModifiers(s, { friction: { multiplier: 0.7 } });
  assert.strictEqual(next.modifiers.friction.multiplier, 0.7);
  assert.strictEqual(next.modifiers.friction.enabled, false, 'unchanged fields preserved');
});

test('editor-state: serializeToMission includes modifiers', () => {
  const ctx = env();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s = ctx.MISSIONS.editor.state.setModifiers(s, { poke: { enabled: true, severity: 0.8 } });
  const mission = ctx.MISSIONS.loader.load(ctx.MISSIONS.editor.state.serializeToMission(s));
  assert.strictEqual(mission.modifiers.poke.enabled, true);
  assert.strictEqual(mission.modifiers.poke.severity, 0.8);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/missions/editor-state-modifiers.test.js
```

Expected: failures — `createBlank` returns old shape, `setModifiers` doesn't exist.

- [ ] **Step 3: Update `createBlank` in `js/mission_editor_state.js`**

Find the `modifiers` line inside `createBlank` (line ~31):
```js
      modifiers: { available: [], defaults: {} },
```

Replace it with:
```js
      modifiers: {
        poke:     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
        friction: { enabled: false, multiplier: 1.0 },
      },
```

- [ ] **Step 4: Update `clone` in `js/mission_editor_state.js`**

Find the `modifiers:` line inside `clone` (line ~58):
```js
      modifiers: { available: state.modifiers.available.slice(), defaults: { ...state.modifiers.defaults } },
```

Replace it with:
```js
      modifiers: {
        poke:     { ...state.modifiers.poke },
        friction: { ...state.modifiers.friction },
      },
```

- [ ] **Step 5: Find the `importFromMission` / load-into-state section and update it**

Search `js/mission_editor_state.js` for the lines that load `mission.modifiers` into state (around lines 391–392):
```js
    state.modifiers = mission.modifiers
      ? { available: mission.modifiers.available.slice(), defaults: { ...mission.modifiers.defaults } }
```

Replace the whole `state.modifiers = ...` assignment block with:
```js
    state.modifiers = mission.modifiers
      ? {
          poke:     { ...mission.modifiers.poke },
          friction: { ...mission.modifiers.friction },
        }
```

The closing `}: { available: [], defaults: {} }` fallback line that follows should become:
```js
      : {
          poke:     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
          friction: { enabled: false, multiplier: 1.0 },
        };
```

- [ ] **Step 6: Add `setModifiers` function in `js/mission_editor_state.js`**

Add this new function just after the existing `setMeta` function (before `setSelection`):

```js
  function setModifiers(state, patch) {
    const next = dirty(state);
    next.modifiers = {
      poke:     { ...next.modifiers.poke,     ...(patch.poke     || {}) },
      friction: { ...next.modifiers.friction, ...(patch.friction || {}) },
    };
    return next;
  }
```

- [ ] **Step 7: Export `setModifiers` in `js/mission_editor_state.js`**

Find the export object at the bottom (around line 405):
```js
    setRobotStart, setSelection, setMeta,
```

Add `setModifiers` to it:
```js
    setRobotStart, setSelection, setMeta, setModifiers,
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
node --test tests/js/missions/editor-state-modifiers.test.js
```

Expected: 5 passes.

- [ ] **Step 9: Run the full missions test suite**

```bash
node --test tests/js/missions/
```

Expected: all existing tests still pass.

- [ ] **Step 10: Commit**

```bash
git add js/mission_editor_state.js tests/js/missions/editor-state-modifiers.test.js
git commit -m "feat(modifiers): update editor state for new modifiers schema"
```

---

### Task 3: Simulator hooks — applyPoke and setFrictionMultiplier

**Files:**
- Modify: `js/simulator.js`
- Test: `tests/js/missions/simulator-modifiers.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/js/missions/simulator-modifiers.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

function withStubbedPhysics(sim) {
  const poses = [];
  sim.physics = {
    setKinematicVelocity: () => {},
    setKinematicPose: (body, x, y, angle) => poses.push({ x, y, angle }),
    step: () => ({ force_impulses: {} }),
    readPose: () => ({ x: sim.robot.x, y: sim.robot.y, angle: sim.robot.heading * Math.PI / 180 }),
    castRay: () => ({ hit: false }),
  };
  sim.robotBody = { GetAngle: () => 0 };
  sim._physicsReady = Promise.resolve();
  sim.isRunning = true;
  return poses;
}

test('simulator: _frictionMultiplier defaults to 1.0', () => {
  const sim = createSim();
  assert.strictEqual(sim._frictionMultiplier, 1.0);
});

test('simulator: setFrictionMultiplier stores the value', () => {
  const sim = createSim();
  sim.setFrictionMultiplier(0.7);
  assert.strictEqual(sim._frictionMultiplier, 0.7);
});

test('simulator: setFrictionMultiplier ignores non-finite values', () => {
  const sim = createSim();
  sim.setFrictionMultiplier(NaN);
  assert.strictEqual(sim._frictionMultiplier, 1.0);
});

test('simulator: _pokeFlashUntilMs defaults to 0', () => {
  const sim = createSim();
  assert.strictEqual(sim._pokeFlashUntilMs, 0);
});

test('simulator: applyPoke shifts robot position and heading', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim.robot.x = 500; sim.robot.y = 500; sim.robot.heading = 0;
  sim.applyPoke(10, 20, 5);
  assert.strictEqual(sim.robot.x, 510);
  assert.strictEqual(sim.robot.y, 520);
  assert.strictEqual(sim.robot.heading, 5);
  assert.strictEqual(sim._dirty, true);
});

test('simulator: applyPoke sets _pokeFlashUntilMs ~300ms in the future', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  const before = Date.now();
  sim.applyPoke(0, 0, 0);
  assert.ok(sim._pokeFlashUntilMs >= before + 290, 'flash should expire ~300ms from now');
  assert.ok(sim._pokeFlashUntilMs <= before + 350, 'flash should not be too far in future');
});

test('simulator: applyPoke is a no-op when isRunning is false', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim.isRunning = false;
  sim.robot.x = 500;
  sim.applyPoke(10, 0, 0);
  assert.strictEqual(sim.robot.x, 500, 'position must not change when not running');
  assert.strictEqual(sim._pokeFlashUntilMs, 0, 'flash must not be set when not running');
});

test('simulator: applyPoke syncs Box2D pose', () => {
  const sim = createSim();
  const poses = withStubbedPhysics(sim);
  sim.robot.x = 500; sim.robot.y = 500; sim.robot.heading = 90;
  sim.applyPoke(10, 0, 0);
  assert.strictEqual(poses.length, 1, 'setKinematicPose should be called once');
  assert.strictEqual(poses[0].x, 510);
  assert.strictEqual(poses[0].y, 500);
});

test('simulator: reset clears _frictionMultiplier to 1.0', () => {
  const sim = createSim();
  withStubbedPhysics(sim);
  sim.setFrictionMultiplier(0.5);
  sim.reset();
  assert.strictEqual(sim._frictionMultiplier, 1.0);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/missions/simulator-modifiers.test.js
```

Expected: failures — `_frictionMultiplier` and `applyPoke` don't exist yet.

- [ ] **Step 3: Add `_frictionMultiplier` and `_pokeFlashUntilMs` to the constructor**

In `js/simulator.js`, find the end of the constructor (around the `this._scale = 1;` line, ~line 313). Add after `this._walls = [];`:

```js
    this._frictionMultiplier = 1.0;
    this._pokeFlashUntilMs   = 0;
```

- [ ] **Step 4: Add `setFrictionMultiplier` method to `js/simulator.js`**

Add this new method near the bottom of the class, before `_applyForceImpulse` or in the public-methods section:

```js
  setFrictionMultiplier(f) {
    this._frictionMultiplier = (typeof f === 'number' && Number.isFinite(f)) ? f : 1.0;
  }
```

- [ ] **Step 5: Add `applyPoke` method to `js/simulator.js`**

Add this method adjacent to `setFrictionMultiplier`:

```js
  applyPoke(dx, dy, dHeading) {
    if (!this.isRunning) return;
    const newX          = this.robot.x + dx;
    const newY          = this.robot.y + dy;
    const newHeadingDeg = this.robot.heading + dHeading;
    const newAngleRad   = newHeadingDeg * Math.PI / 180;
    const clamped = window.kinematics.clampRobotPose(
      { x: newX, y: newY, angle: newAngleRad },
      { bodyW: ROBOT_BODY_W, bodyH: ROBOT_BODY_H, bumperDepth: BUMPER_DEPTH_MM,
        fieldW: FIELD_W_MM, fieldH: FIELD_H_MM,
        walls: (this._walls || []).map(w => w.cfg) },
    );
    this.robot.x       = clamped.x;
    this.robot.y       = clamped.y;
    this.robot.heading = newHeadingDeg % 360;
    if (this.physics && this.robotBody) {
      this.physics.setKinematicPose(this.robotBody, clamped.x, clamped.y, newAngleRad);
    }
    this._pokeFlashUntilMs = Date.now() + 300;
    this._dirty = true;
  }
```

- [ ] **Step 6: Clear both fields in `reset()` in `js/simulator.js`**

Find `reset()` (around line 1167). After `this.robot = makeRobotState();` (line ~1172), add:

```js
    this._frictionMultiplier = 1.0;
    this._pokeFlashUntilMs   = 0;
```

- [ ] **Step 7: Run tests to confirm they pass**

```bash
node --test tests/js/missions/simulator-modifiers.test.js
```

Expected: 9 passes.

- [ ] **Step 8: Commit**

```bash
git add js/simulator.js tests/js/missions/simulator-modifiers.test.js
git commit -m "feat(modifiers): add applyPoke and setFrictionMultiplier to simulator"
```

---

### Task 4: Friction scale in `_animateTank`

**Files:**
- Modify: `js/simulator.js` (`_animateTank` per-step loop)

This task has no new test file — the behaviour (robot covers less distance with friction < 1) requires a running animation loop which is skipped in the test suite (see `motion-handoff.test.js`). The integration test is manual: run a mission with friction enabled and observe the robot stopping short.

- [ ] **Step 1: Apply `_frictionMultiplier` to the per-step velocity in `_animateTank`**

In `_animateTank` (around line 1585), find:
```js
      this.physics.setKinematicVelocity(this.robotBody, v.vx, v.vy, v.angVel);
```

Replace it with:
```js
      const f = this._frictionMultiplier;
      this.physics.setKinematicVelocity(this.robotBody, v.vx * f, v.vy * f, v.angVel * f);
```

Note: encoder accumulation (`leftStepMM` / `rightStepMM`) is intentionally NOT scaled — the wheels spin at full speed; the robot slips. Programs relying on encoder counts for distance will fall short, which is the intended perturbation.

- [ ] **Step 2: Run the full test suite to confirm no regressions**

```bash
node --test tests/js/
```

Expected: all tests still pass. The skipped `motion-handoff` tests remain skipped.

- [ ] **Step 3: Commit**

```bash
git add js/simulator.js
git commit -m "feat(modifiers): scale _animateTank velocity by _frictionMultiplier"
```

---

### Task 5: Poke flash in the draw loop

**Files:**
- Modify: `js/simulator.js` (`_drawLoop` and `_draw`)

- [ ] **Step 1: Keep the canvas dirty while the flash is active**

In `_drawLoop` (around line 455), find the existing dirty-setting block:
```js
    if (this._manualStartMs !== null || this._emaN > 0.001) {
      this._dirty = true;
    }
```

Add a poke-flash check immediately after:
```js
    if (this._pokeFlashUntilMs && Date.now() < this._pokeFlashUntilMs) {
      this._dirty = true;
    }
```

- [ ] **Step 2: Draw the flash ring in `_draw`**

In `_draw` (around line 493), find:
```js
    this._drawRobot(ctx, s);
    this._drawDistanceSensorRay(ctx, s);
```

Insert the flash ring between them:
```js
    this._drawRobot(ctx, s);
    if (Date.now() < this._pokeFlashUntilMs) {
      ctx.save();
      const cx = this.robot.x * s;
      const cy = (FIELD_H_MM - this.robot.y) * s;
      ctx.strokeStyle = 'rgba(203, 166, 247, 0.85)';
      ctx.lineWidth   = 4 * s;
      ctx.shadowColor = '#cba6f7';
      ctx.shadowBlur  = 12 * s;
      ctx.beginPath();
      ctx.arc(cx, cy, (ROBOT_BODY_H / 2 + 8) * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    this._drawDistanceSensorRay(ctx, s);
```

- [ ] **Step 3: Run the test suite**

```bash
node --test tests/js/
```

Expected: all tests pass (the flash only runs inside the canvas draw path which tests don't exercise).

- [ ] **Step 4: Commit**

```bash
git add js/simulator.js
git commit -m "feat(modifiers): draw poke flash ring on canvas for 300ms after applyPoke"
```

---

### Task 6: Mission engine — poke scheduling

**Files:**
- Modify: `js/mission_engine.js`
- Modify: `js/simulator.js` (the `_drawLoop` tick call — pass `this` to `engine.tick`)
- Modify: `js/mission_app.js` (the `_tickOnce` test seam — pass `sim` to `engine.tick`)
- Test: `tests/js/missions/engine-modifiers.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/js/missions/engine-modifiers.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const BASE = {
  schema_version: 1, id: 'pm', title: 'PM', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 's1', title: 'S1', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'red' } }],
  scoring: { kind: 'step_sum' },
};

function snap(opts = {}) {
  return {
    robot: opts.robot || { x: 0, y: 0, heading: 90 },
    obstacles: {}, sensors: {}, contacts: {},
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  };
}

test('engine: _nextPokeMs is null after load when poke disabled', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(BASE));
  assert.strictEqual(e._nextPokeMs, null);
});

test('engine: start schedules first poke when poke.enabled is true', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 10, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(1000);
  assert.ok(e._nextPokeMs >= 1000 + 5000, 'next poke must be ≥ min interval after start');
  assert.ok(e._nextPokeMs <= 1000 + 10000, 'next poke must be ≤ max interval after start');
});

test('engine: tick does not call applyPoke before _nextPokeMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const pokes = [];
  const mockSim = { applyPoke: (dx, dy, dH) => pokes.push({ dx, dy, dH }) };
  e.tick(snap(), 4999, mockSim);
  assert.strictEqual(pokes.length, 0);
});

test('engine: tick calls applyPoke when nowMs >= _nextPokeMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const pokes = [];
  const mockSim = { applyPoke: (dx, dy, dH) => pokes.push({ dx, dy, dH }) };
  e.tick(snap(), 5000, mockSim);
  assert.strictEqual(pokes.length, 1);
  const p = pokes[0];
  assert.ok(Number.isFinite(p.dx), 'dx must be a finite number');
  assert.ok(Number.isFinite(p.dy), 'dy must be a finite number');
  assert.ok(Number.isFinite(p.dH), 'dH must be a finite number');
});

test('engine: tick re-arms _nextPokeMs after firing', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const mockSim = { applyPoke: () => {} };
  e.tick(snap(), 5000, mockSim);
  assert.ok(e._nextPokeMs > 5000, 'next poke should be rescheduled past fire time');
});

test('engine: reset clears _nextPokeMs', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 10, severity: 0.5 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  assert.ok(e._nextPokeMs !== null);
  e.reset();
  assert.strictEqual(e._nextPokeMs, null);
});

test('engine: poke dx/dy are perpendicular to robot heading', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load({
    ...BASE,
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 5, severity: 1.0 },
                 friction: { enabled: false, multiplier: 1.0 } },
  }));
  e.start(0);
  const pokes = [];
  const mockSim = { applyPoke: (dx, dy, dH) => pokes.push({ dx, dy, dH }) };
  // Robot heading 0 (east): perpendicular is 90° (north), so dx ≈ 0 and dy = ±30.
  e.tick(snap({ robot: { x: 0, y: 0, heading: 0 } }), 5000, mockSim);
  assert.ok(Math.abs(pokes[0].dx) < 0.001, 'dx should be ~0 when heading is east');
  assert.ok(Math.abs(Math.abs(pokes[0].dy) - 30) < 0.001, 'dy magnitude should be 30 at severity 1.0');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/missions/engine-modifiers.test.js
```

Expected: failures — `_nextPokeMs` doesn't exist on the engine, `tick` doesn't accept a 3rd arg.

- [ ] **Step 3: Add `_nextPokeMs` and `_mods` to `ChallengeEngine` constructor**

In `js/mission_engine.js`, in the `constructor()` body, add:

```js
      this._nextPokeMs = null;
      this._mods       = null;
```

- [ ] **Step 4: Store `_mods` and clear `_nextPokeMs` in `load()`**

In `load(mission)`, after `this._goalReached = false;`, add:

```js
      this._mods       = mission.modifiers || null;
      this._nextPokeMs = null;
```

- [ ] **Step 5: Schedule first poke in `start()`**

In `start(nowMs)`, after `this.startTimeMs = nowMs;`, add:

```js
      if (this._mods && this._mods.poke.enabled) {
        this._nextPokeMs = nowMs + _randomIntervalMs(this._mods.poke.interval_min_s, this._mods.poke.interval_max_s);
      }
```

- [ ] **Step 6: Add the `_randomIntervalMs` helper**

Add this module-level helper function inside the IIFE but outside the class, near the top of the file (after `if (!MISSIONS.conditions)` guard):

```js
  function _randomIntervalMs(minS, maxS) {
    return (minS + Math.random() * (maxS - minS)) * 1000;
  }
```

- [ ] **Step 7: Fire pokes in `tick()` and add optional `sim` parameter**

Change the `tick` signature from `tick(simSnap, nowMs)` to `tick(simSnap, nowMs, sim)`.

In `tick`, after `const snap = this._snapshotFor(simSnap);` and before the obstacle-course goal check, add:

```js
      const mods = this._mods;
      if (mods && mods.poke.enabled && this._nextPokeMs !== null && nowMs >= this._nextPokeMs && sim) {
        const perpAngleRad = (snap.robot.heading + 90) * Math.PI / 180;
        const signPos = Math.random() < 0.5 ? 1 : -1;
        const signHdg = Math.random() < 0.5 ? 1 : -1;
        const dx = Math.cos(perpAngleRad) * signPos * mods.poke.severity * 30;
        const dy = Math.sin(perpAngleRad) * signPos * mods.poke.severity * 30;
        const dH = signHdg * mods.poke.severity * 20;
        sim.applyPoke(dx, dy, dH);
        this._nextPokeMs = nowMs + _randomIntervalMs(mods.poke.interval_min_s, mods.poke.interval_max_s);
      }
```

- [ ] **Step 8: Clear `_nextPokeMs` in `reset()`**

In `reset()` (which calls `this.load(this.mission)`), the `load()` call already resets `_nextPokeMs`. No additional change needed — confirm by reading `load()`.

- [ ] **Step 9: Pass `this` to `engine.tick` in `_drawLoop` in `js/simulator.js`**

In `js/simulator.js` around line 472, find:
```js
      window.missionApp.engine.tick(snap, now);
```

Replace with:
```js
      window.missionApp.engine.tick(snap, now, this);
```

- [ ] **Step 10: Pass `sim` to `engine.tick` in `_tickOnce` in `js/mission_app.js`**

In `js/mission_app.js` around line 164, find:
```js
      engine.tick(snap, now);
```

Replace with:
```js
      engine.tick(snap, now, sim);
```

- [ ] **Step 11: Run tests to confirm they pass**

```bash
node --test tests/js/missions/engine-modifiers.test.js
```

Expected: 7 passes.

- [ ] **Step 12: Run the full test suite**

```bash
node --test tests/js/
```

Expected: all tests pass.

- [ ] **Step 13: Commit**

```bash
git add js/mission_engine.js js/simulator.js js/mission_app.js tests/js/missions/engine-modifiers.test.js
git commit -m "feat(modifiers): poke scheduling in ChallengeEngine tick"
```

---

### Task 7: Mission app — friction wiring

**Files:**
- Modify: `js/mission_app.js`

- [ ] **Step 1: Call `setFrictionMultiplier` when entering play mode**

In `js/mission_app.js`, in the `app.onChange` callback, find the `if (mode === 'play' && mission)` block. After `engine.load(mission);`, add:

```js
        if (sim && typeof sim.setFrictionMultiplier === 'function') {
          const mods = mission.modifiers;
          sim.setFrictionMultiplier(mods && mods.friction.enabled ? mods.friction.multiplier : 1.0);
        }
```

- [ ] **Step 2: Reset friction multiplier when leaving play mode**

In the same `onChange`, in the `else if (mode === 'sandbox')` block, after `engine.reset();`, add:

```js
        if (sim && typeof sim.setFrictionMultiplier === 'function') {
          sim.setFrictionMultiplier(1.0);
        }
```

And in the `else if (mode === 'editor')` block, after `engine.reset();`, add the same line:

```js
        if (sim && typeof sim.setFrictionMultiplier === 'function') {
          sim.setFrictionMultiplier(1.0);
        }
```

- [ ] **Step 3: Run the full test suite**

```bash
node --test tests/js/
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add js/mission_app.js
git commit -m "feat(modifiers): wire friction multiplier in mission_app on mode transitions"
```

---

### Task 8: Play-mode UI — modifier badge chips

**Files:**
- Modify: `index.html` (add `mm-modifiers` element)
- Modify: `js/mission_ui.js` (populate badges in `render`)
- Test: `tests/js/missions/ui-modifier-badges.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/js/missions/ui-modifier-badges.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

// Minimal DOM that auto-creates elements on first getElementById — same
// pattern as ui-mission-map.test.js so we don't need makeEditorDoc.
function makeEl(tag) {
  const el = {
    tag, children: [], style: {}, attrs: {},
    textContent: '', hidden: false,
    classList: { _set: new Set(), add(c) { this._set.add(c); }, contains(c) { return this._set.has(c); } },
    get innerHTML() { return ''; },
    set innerHTML(v) { if (v === '' || v == null) this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k] || null; },
    addEventListener() {},
  };
  return el;
}

function makeDom() {
  const ids = {};
  function el(id) { return (ids[id] = ids[id] || makeEl('div')); }
  return {
    getElementById(id) { return el(id); },
    createElement(tag)  { return makeEl(tag); },
    ids,
  };
}

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_ui',
  ]).ctx;
}

const BASE_MISSION = {
  schema_version: 1, id: 'bm', title: 'BM', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 's1', title: 'S1', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'red' } }],
  scoring: { kind: 'step_sum' },
};

function setup(missionOverrides) {
  const ctx = env();
  const doc = makeDom();
  const ui = ctx.MISSIONS.ui.mount(doc);
  const e  = new ctx.MISSIONS.engine.ChallengeEngine();
  const mission = ctx.MISSIONS.loader.load({ ...BASE_MISSION, ...(missionOverrides || {}) });
  e.load(mission);
  ui.render(mission, e);
  return { doc, ui };
}

test('ui: no modifier badges rendered when both disabled', () => {
  const { doc } = setup();
  const el = doc.getElementById('mm-modifiers');
  assert.ok(el, 'mm-modifiers element must exist');
  assert.strictEqual(el.children.length, 0);
});

test('ui: poke badge rendered when poke enabled', () => {
  const { doc } = setup({
    modifiers: { poke: { enabled: true, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
                 friction: { enabled: false, multiplier: 1.0 } },
  });
  const el = doc.getElementById('mm-modifiers');
  const badges = Array.from(el.children);
  assert.ok(badges.some(b => b.textContent.includes('Poke')), 'Poke badge must be present');
  assert.ok(badges.some(b => b.textContent.includes('0.4')), 'Severity value must appear');
});

test('ui: friction badge rendered when friction enabled', () => {
  const { doc } = setup({
    modifiers: { poke: { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
                 friction: { enabled: true, multiplier: 0.7 } },
  });
  const el = doc.getElementById('mm-modifiers');
  const badges = Array.from(el.children);
  assert.ok(badges.some(b => b.textContent.includes('Friction')), 'Friction badge must be present');
  assert.ok(badges.some(b => b.textContent.includes('0.7')), 'Multiplier value must appear');
});

test('ui: both badges rendered when both enabled', () => {
  const { doc } = setup({
    modifiers: { poke: { enabled: true, interval_min_s: 5, interval_max_s: 10, severity: 0.5 },
                 friction: { enabled: true, multiplier: 0.8 } },
  });
  const el = doc.getElementById('mm-modifiers');
  assert.strictEqual(el.children.length, 2);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/missions/ui-modifier-badges.test.js
```

Expected: failures — `mission_ui` doesn't populate `mm-modifiers`.

- [ ] **Step 3: Add `mm-modifiers` element to `index.html`**

In `index.html`, find the Mission Map head section (around line 448):
```html
      <div class="mm-meta"  id="mm-meta">—</div>
    </div>
```

After `mm-meta` and before the closing `</div>` of `mm-head`, add:
```html
      <div class="mm-modifiers" id="mm-modifiers"></div>
```

- [ ] **Step 4: Populate modifier badges in `mission_ui.js` `render` function**

In `js/mission_ui.js`, in the `render(mission, engine)` function, after the `metaEl.textContent = ...` line, add:

```js
      if (modsEl) {
        modsEl.innerHTML = '';
        const mods = mission.modifiers;
        if (mods && mods.poke && mods.poke.enabled) {
          const chip = doc.createElement('span');
          chip.className = 'mm-modifier-badge mm-modifier-poke';
          chip.textContent = `⚡ Poke · ${mods.poke.severity}`;
          modsEl.appendChild(chip);
        }
        if (mods && mods.friction && mods.friction.enabled) {
          const chip = doc.createElement('span');
          chip.className = 'mm-modifier-badge mm-modifier-friction';
          chip.textContent = `≈ Friction · ${mods.friction.multiplier}×`;
          modsEl.appendChild(chip);
        }
      }
```

You also need to declare `modsEl` in the `mount` function. At the top of `mount`, alongside the other `$('...')` calls, add:

```js
    const modsEl      = $('mm-modifiers');
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
node --test tests/js/missions/ui-modifier-badges.test.js
```

Expected: 4 passes.

- [ ] **Step 6: Run the full test suite**

```bash
node --test tests/js/
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add index.html js/mission_ui.js tests/js/missions/ui-modifier-badges.test.js
git commit -m "feat(modifiers): modifier badge chips in Mission Map panel"
```

---

### Task 9: Editor UI — modifiers accordion

**Files:**
- Modify: `index.html` (add `<details>` section)
- Create: `js/mission_editor_modifiers.js`
- Modify: `index.html` (add `<script>` tag for new module)
- Test: `tests/js/missions/editor-modifiers.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/js/missions/editor-modifiers.test.js`:

```js
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc }   = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_modifiers',
  ]).ctx;
}

const MODIFIER_IDS = [
  'editor-mod-poke-enabled', 'editor-mod-poke-interval-min',
  'editor-mod-poke-interval-max', 'editor-mod-poke-severity',
  'editor-mod-friction-enabled', 'editor-mod-friction-multiplier',
];

function setup() {
  const ctx = env();
  const doc = makeEditorDoc(MODIFIER_IDS);
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.modifiers.attach(app, doc);
  return { ctx, doc, app };
}

test('modifiers editor: enterEditor reflects default disabled state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const pokeToggle = doc.getElementById('editor-mod-poke-enabled');
  assert.ok(pokeToggle, 'poke toggle must exist');
  assert.strictEqual(pokeToggle.checked, false);
  const frictionToggle = doc.getElementById('editor-mod-friction-enabled');
  assert.ok(frictionToggle, 'friction toggle must exist');
  assert.strictEqual(frictionToggle.checked, false);
});

test('modifiers editor: toggling poke updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const toggle = doc.getElementById('editor-mod-poke-enabled');
  toggle.checked = true;
  toggle._fire('change', { target: toggle });
  assert.strictEqual(app.editorState.modifiers.poke.enabled, true);
  assert.strictEqual(app.editorState.dirty, true);
});

test('modifiers editor: changing severity updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const severity = doc.getElementById('editor-mod-poke-severity');
  severity.value = '0.8';
  severity._fire('input', { target: severity });
  assert.strictEqual(app.editorState.modifiers.poke.severity, 0.8);
});

test('modifiers editor: changing friction multiplier updates editor state', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const slider = doc.getElementById('editor-mod-friction-multiplier');
  slider.value = '0.6';
  slider._fire('input', { target: slider });
  assert.strictEqual(app.editorState.modifiers.friction.multiplier, 0.6);
});

test('modifiers editor: loadFromMission populates fields', () => {
  const { ctx, doc, app } = setup();
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 100, y: 100 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s = ctx.MISSIONS.editor.state.setModifiers(s, {
    poke: { enabled: true, severity: 0.7 },
    friction: { enabled: true, multiplier: 0.6 },
  });
  const mission = ctx.MISSIONS.loader.load(ctx.MISSIONS.editor.state.serializeToMission(s));
  app.enterEditor(mission);
  assert.strictEqual(doc.getElementById('editor-mod-poke-enabled').checked, true);
  assert.strictEqual(doc.getElementById('editor-mod-poke-severity').value, '0.7');
  assert.strictEqual(doc.getElementById('editor-mod-friction-enabled').checked, true);
  assert.strictEqual(doc.getElementById('editor-mod-friction-multiplier').value, '0.6');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test tests/js/missions/editor-modifiers.test.js
```

Expected: failures — `mission_editor_modifiers` module doesn't exist.

- [ ] **Step 3: Add the modifiers `<details>` section to `index.html`**

In `index.html`, find the editor right panel. After the closing `</details>` of `editor-meta-section` and before the `<details class="editor-steps-section"`, add:

```html
    <details class="editor-modifiers-section" id="editor-modifiers-section">
      <summary><h4>⚡ Difficulty Modifiers</h4></summary>
      <div class="editor-section-body">
        <div class="editor-modifier-group">
          <label class="editor-modifier-toggle">
            <input type="checkbox" id="editor-mod-poke-enabled">
            <span>Poke</span>
            <span class="editor-modifier-desc">random impulse during run</span>
          </label>
          <div class="editor-modifier-fields" id="editor-mod-poke-fields">
            <label class="editor-field">
              <span>Interval min (s)</span>
              <input type="number" id="editor-mod-poke-interval-min" min="1" max="60" value="8">
            </label>
            <label class="editor-field">
              <span>Interval max (s)</span>
              <input type="number" id="editor-mod-poke-interval-max" min="1" max="60" value="15">
            </label>
            <label class="editor-field">
              <span>Severity</span>
              <input type="range" id="editor-mod-poke-severity" min="0" max="1" step="0.1" value="0.4">
              <div class="editor-modifier-range-labels">
                <span>Barely noticeable</span><span>Clearly off-course</span>
              </div>
            </label>
          </div>
        </div>
        <div class="editor-modifier-group">
          <label class="editor-modifier-toggle">
            <input type="checkbox" id="editor-mod-friction-enabled">
            <span>Friction</span>
            <span class="editor-modifier-desc">global speed multiplier</span>
          </label>
          <div class="editor-modifier-fields" id="editor-mod-friction-fields">
            <label class="editor-field">
              <span>Multiplier</span>
              <input type="range" id="editor-mod-friction-multiplier" min="0.3" max="1.5" step="0.05" value="1.0">
              <div class="editor-modifier-range-labels">
                <span>Sticky (0.3)</span><span>Slippery (1.5)</span>
              </div>
            </label>
          </div>
        </div>
      </div>
    </details>
```

- [ ] **Step 4: Create `js/mission_editor_modifiers.js`**

```js
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const $ = (id) => doc.getElementById(id);

    const pokeEnabled     = $('editor-mod-poke-enabled');
    const pokeMin         = $('editor-mod-poke-interval-min');
    const pokeMax         = $('editor-mod-poke-interval-max');
    const pokeSeverity    = $('editor-mod-poke-severity');
    const frictionEnabled = $('editor-mod-friction-enabled');
    const frictionMult    = $('editor-mod-friction-multiplier');

    function patchPoke(patch) {
      if (app.mode !== 'editor' || !app.editorState) return;
      const next = MISSIONS.editor.state.setModifiers(app.editorState, { poke: patch });
      app.setEditorState(next);
    }

    function patchFriction(patch) {
      if (app.mode !== 'editor' || !app.editorState) return;
      const next = MISSIONS.editor.state.setModifiers(app.editorState, { friction: patch });
      app.setEditorState(next);
    }

    if (pokeEnabled)     pokeEnabled    .addEventListener('change', (e) => patchPoke({ enabled: e.target.checked }));
    if (pokeMin)         pokeMin        .addEventListener('input',  (e) => patchPoke({ interval_min_s: parseFloat(e.target.value) || 1 }));
    if (pokeMax)         pokeMax        .addEventListener('input',  (e) => patchPoke({ interval_max_s: parseFloat(e.target.value) || 1 }));
    if (pokeSeverity)    pokeSeverity   .addEventListener('input',  (e) => patchPoke({ severity: parseFloat(e.target.value) }));
    if (frictionEnabled) frictionEnabled.addEventListener('change', (e) => patchFriction({ enabled: e.target.checked }));
    if (frictionMult)    frictionMult   .addEventListener('input',  (e) => patchFriction({ multiplier: parseFloat(e.target.value) }));

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) return;
      const mods = editorState.modifiers;
      if (pokeEnabled)     pokeEnabled    .checked = mods.poke.enabled;
      if (pokeMin)         pokeMin        .value   = String(mods.poke.interval_min_s);
      if (pokeMax)         pokeMax        .value   = String(mods.poke.interval_max_s);
      if (pokeSeverity)    pokeSeverity   .value   = String(mods.poke.severity);
      if (frictionEnabled) frictionEnabled.checked = mods.friction.enabled;
      if (frictionMult)    frictionMult   .value   = String(mods.friction.multiplier);
    });
  }

  editor.modifiers = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: Add the new IDs to `makeEditorDoc` in `tests/js/mocks/editor-dom.js`**

In `editor-dom.js`, find the `ids` array inside `makeEditorDoc` (around line 174). Add these IDs to the list after `'editor-meta-time-limit',`:

```js
    // modifiers
    'editor-mod-poke-enabled', 'editor-mod-poke-interval-min',
    'editor-mod-poke-interval-max', 'editor-mod-poke-severity',
    'editor-mod-friction-enabled', 'editor-mod-friction-multiplier',
    // mission map
    'mm-modifiers',
```

This means all future tests using `makeEditorDoc()` without `idsExtra` will have these elements available automatically.

- [ ] **Step 7: Add the script tag to `index.html`**

In `index.html`, after `<script src="js/mission_editor_meta.js"></script>`, add:
```html
  <script src="js/mission_editor_modifiers.js"></script>
```

- [ ] **Step 8: Wire `mission_editor_modifiers.attach` into the app boot**

In `js/main.js` (or wherever `mission_editor_meta.attach` is called during boot), add the modifiers attach call. Search for the line that calls `MISSIONS.editor.meta.attach`:

```js
MISSIONS.editor.meta.attach(missionApp, document);
```

Add the following immediately after:
```js
if (MISSIONS.editor.modifiers) MISSIONS.editor.modifiers.attach(missionApp, document);
```

- [ ] **Step 9: Run tests to confirm they pass**

```bash
node --test tests/js/missions/editor-modifiers.test.js
```

Expected: 5 passes.

- [ ] **Step 10: Run the full test suite**

```bash
node --test tests/js/
```

Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
git add index.html js/mission_editor_modifiers.js tests/js/mocks/editor-dom.js tests/js/missions/editor-modifiers.test.js
git commit -m "feat(modifiers): mission editor accordion for poke and friction settings"
```

---

### Task 10: Update bundled missions + enable on one

**Files:**
- Modify: `missions/red-zone-then-push/mission.json`
- Modify: `missions/slalom-course/mission.json`
- Modify: `missions/color-crawl/mission.json`
- Modify: `missions/energy-pickup/mission.json`
- Modify: `missions/the-30cm-square/mission.json`

- [ ] **Step 1: Update all five bundled missions to the new schema shape**

In each of the five `mission.json` files, replace:
```json
"modifiers": { "available": [], "defaults": {} }
```

with:
```json
"modifiers": {
  "poke":     { "enabled": false, "interval_min_s": 8, "interval_max_s": 15, "severity": 0.4 },
  "friction": { "enabled": false, "multiplier": 1.0 }
}
```

- [ ] **Step 2: Enable poke on `the-30cm-square` mission**

This mission is a precision driving challenge (drive the robot in a 30 cm square), making it a natural test of robustness. In `missions/the-30cm-square/mission.json`, set:

```json
"modifiers": {
  "poke":     { "enabled": true, "interval_min_s": 8, "interval_max_s": 15, "severity": 0.3 },
  "friction": { "enabled": false, "multiplier": 1.0 }
}
```

Severity 0.3 is gentle: ±6° heading + ±9 mm lateral — noticeable but not punishing.

- [ ] **Step 3: Verify the bundled mission loader test still passes**

```bash
node --test tests/js/missions/bundled-red-zone.test.js
```

Expected: pass.

- [ ] **Step 4: Run the full test suite**

```bash
node --test tests/js/
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add missions/
git commit -m "feat(modifiers): update bundled missions to new schema; enable poke on the-30cm-square"
```

---

### Task 11: End-to-end manual verification

- [ ] **Step 1: Start the dev server**

```bash
python3 -m http.server 8787
```

Open http://localhost:8787 in a browser.

- [ ] **Step 2: Verify friction works**

1. Open the Mission Library → open the Mission Editor.
2. Create a new mission with a zone at the far end of the field and one step.
3. Open the ⚡ Difficulty Modifiers accordion → enable Friction → set multiplier to 0.5.
4. Save the mission. Click Playtest.
5. Write a Python program: `await motor_pair.move(pair, 0, 1000)` (1000 mm straight).
6. Click Run. The robot should travel roughly 500 mm instead of 1000 mm (50% friction).

- [ ] **Step 3: Verify pokes work**

1. Open the Mission Library → select "The 30 cm Square".
2. Click Play. The Mission Map should show a `⚡ Poke · 0.3` badge.
3. Write a Python program that drives a 30 cm square and click Run.
4. Within 8–15 s, a purple ring should flash around the robot and the robot should be visibly nudged off-course.

- [ ] **Step 4: Verify the editor accordion**

1. Open any mission in the Editor.
2. The ⚡ Difficulty Modifiers section is collapsed by default.
3. Click to expand — poke and friction controls appear.
4. Enable poke, adjust severity. Save. Re-open — values are preserved.

- [ ] **Step 5: Verify reset clears friction**

1. In Play mode with a friction mission, click Run and observe short travel.
2. Click Stop. Click Run again. Travel distance should be the same (friction persists across runs in the same play session, cleared only on exit).
3. Click Exit Mission → re-enter Play on a non-friction mission → travel distance is normal.
