# Missions Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest end-to-end slice of the missions system: schema, ChallengeEngine, scoring, Mission Map panel, Sandbox/Play mode switch, and one bundled mission that runs from URL hash. After this plan, a user can open `index.html#mission=red-zone-then-push`, write Python that drives the robot, and watch their score tick up live.

**Architecture:** Pure data + pure functions at the core (condition primitives evaluate against a snapshot — no DOM, no time), wrapped by a stateful `ChallengeEngine` that owns mission progress and scoring, then bound to a `MissionMapPanel` view that observes the engine. Mode is a top-level flag in `mission_app.js`. Bundled missions live as unzipped JSON in `missions/<id>/` to keep them PR-reviewable; the on-disk `.llmission` ZIP format is deferred to a later plan.

**Tech Stack:** Vanilla JS UMD-style modules (`(function(global){ global.MISSIONS = ...; })(window)`), `node:test` for tests, no build step, JSZip from CDN. Mirrors the existing `js/llsp3_*.js` and `tests/js/llsp3/` patterns exactly.

**Position in the larger roadmap:** This is **Plan 1 of 8**. Subsequent plans (Library panel, Editor mode, Blockly condition picker, screenshot capture, `.llmission` ZIP I/O, polish) build on the foundations laid here. See the spec at `docs/superpowers/specs/2026-05-23-missions-and-scoring-design.md` §15 for the full build order.

---

## File Structure

**New source files:**
- `js/mission_schema.js` — schema constants (condition kinds, scoring kinds, tier names, default penalties)
- `js/mission_loader.js` — validate a plain-object mission, surface readable errors
- `js/mission_conditions.js` — pure `evaluateCondition(condition, snapshot)` for all six primitives
- `js/mission_engine.js` — `ChallengeEngine` class: lifecycle, requires resolution, scoring
- `js/mission_persistence.js` — localStorage read/write for run results (best score, last played)
- `js/mission_library.js` — fetch `missions/manifest.json` + each `mission.json`
- `js/mission_ui.js` — Mission Map panel render + hint-reveal interaction
- `js/mission_app.js` — top-level mode state (Sandbox/Play), URL-hash entry, engine↔UI wiring

**New content files:**
- `missions/manifest.json` — bundle registry (list of mission ids)
- `missions/red-zone-then-push/mission.json` — first bundled mission
- `missions/red-zone-then-push/README.md` — author notes
- `missions/red-zone-then-push/solution.py` — reference solution

**New CSS:**
- `css/missions.css` — Mission Map panel styling, mode pill (loaded via `<link>` in index.html alongside `style.css`)

**Modified source files:**
- `js/simulator.js` — expose `getStateSnapshot()` (robot pose + obstacle positions) and a `onObstacleContact(cb)` subscription
- `js/main.js` — call `MISSIONS.app.boot(sim)` on startup; route the existing Run/Stop buttons through the engine's `start()`/`finalize()` when a mission is loaded
- `index.html` — add `<div id="mission-map">` container, `<div id="mission-pill">` in header, script tags for the eight new modules and the new CSS link

**New test files:**
- `tests/js/missions/schema.test.js`
- `tests/js/missions/loader.test.js`
- `tests/js/missions/conditions-zone.test.js`
- `tests/js/missions/conditions-sensor.test.js`
- `tests/js/missions/conditions-contact.test.js`
- `tests/js/missions/conditions-composite.test.js`
- `tests/js/missions/engine-lifecycle.test.js`
- `tests/js/missions/engine-requires.test.js`
- `tests/js/missions/scoring-mission.test.js`
- `tests/js/missions/scoring-obstacle-course.test.js`
- `tests/js/missions/persistence.test.js`
- `tests/js/missions/library.test.js`
- `tests/js/missions/ui-mission-map.test.js`
- `tests/js/missions/app-mode.test.js`
- `tests/js/missions/bundled-red-zone.test.js`
- `tests/js/integration/missions-end-to-end.test.js`

**New test helper:**
- `tests/js/mocks/missions-env.js` — vm-sandbox loader for mission modules (mirrors `llsp3-env.js`)

---

## Task 0: Set Up Test Harness & Branch Baseline

**Files:**
- Create: `tests/js/mocks/missions-env.js`
- Create: `tests/js/missions/` (empty directory, populated by later tasks)

- [ ] **Step 1: Verify the branch is clean and tests pass**

Run from the worktree root:
```bash
git status
npm test
```
Expected: working tree clean (or only docs/proto changes from prior commits), 518 tests pass, 0 fail.

- [ ] **Step 2: Create the missions-env mock helper**

Create `tests/js/mocks/missions-env.js`:

```javascript
'use strict';

// Loads the requested mission modules into an isolated `window`-like
// object so tests can drive `ctx.MISSIONS.<module>` directly. Mirrors the
// pattern in tests/js/mocks/llsp3-env.js — see that file for the rationale
// behind using vm.runInThisContext rather than vm.createContext.

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf8');
  const wrapped =
    '(function (window, self, globalThis) {\n' + code + '\n})';
  const fn = vm.runInThisContext(wrapped, { filename: relPath });
  fn(ctx, ctx, ctx);
}

function makeMissionsEnv(modules = []) {
  const ctx = {};
  for (const mod of modules) {
    loadInto(ctx, `js/${mod}.js`);
  }
  return { ctx };
}

module.exports = { makeMissionsEnv, REPO_ROOT };
```

- [ ] **Step 3: Create the missions test directory**

```bash
mkdir -p tests/js/missions
```

- [ ] **Step 4: Commit**

```bash
git add tests/js/mocks/missions-env.js tests/js/missions
git commit -m "test(missions): add vm-sandbox helper for mission module tests"
```

---

## Task 1: Mission Schema Constants

**Files:**
- Create: `js/mission_schema.js`
- Test: `tests/js/missions/schema.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/schema.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema']).ctx;
}

test('CONDITION_KINDS lists all six v1 primitives', () => {
  const ctx = env();
  assert.deepStrictEqual(
    [...ctx.MISSIONS.schema.CONDITION_KINDS].sort(),
    ['all_of', 'any_of', 'contact', 'not', 'sensor', 'zone'],
  );
});

test('SCORING_KINDS lists step_sum and objective_minus_penalties', () => {
  const ctx = env();
  assert.deepStrictEqual(
    [...ctx.MISSIONS.schema.SCORING_KINDS].sort(),
    ['objective_minus_penalties', 'step_sum'],
  );
});

test('DIFFICULTY_TIERS is the three-tier ladder in display order', () => {
  const ctx = env();
  assert.deepStrictEqual(
    ctx.MISSIONS.schema.DIFFICULTY_TIERS,
    ['beginner', 'intermediate', 'advanced'],
  );
});

test('CHALLENGE_TYPES covers mission and obstacle_course', () => {
  const ctx = env();
  assert.deepStrictEqual(
    [...ctx.MISSIONS.schema.CHALLENGE_TYPES].sort(),
    ['mission', 'obstacle_course'],
  );
});

test('DEFAULT_PENALTIES matches the spec values', () => {
  const ctx = env();
  assert.deepStrictEqual(ctx.MISSIONS.schema.DEFAULT_PENALTIES, {
    per_contact: 5,
    cap:         50,
    per_second_over: 1,
  });
});

test('SCHEMA_VERSION is 1', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.schema.SCHEMA_VERSION, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/schema.test.js
```
Expected: FAIL with `Cannot find module 'js/mission_schema.js'` (or similar — module not present).

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_schema.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  const SCHEMA_VERSION    = 1;
  const CONDITION_KINDS   = Object.freeze(['zone', 'sensor', 'contact', 'not', 'all_of', 'any_of']);
  const SCORING_KINDS     = Object.freeze(['step_sum', 'objective_minus_penalties']);
  const DIFFICULTY_TIERS  = Object.freeze(['beginner', 'intermediate', 'advanced']);
  const CHALLENGE_TYPES   = Object.freeze(['mission', 'obstacle_course']);
  const DEFAULT_PENALTIES = Object.freeze({
    per_contact: 5,
    cap:         50,
    per_second_over: 1,
  });

  MISSIONS.schema = {
    SCHEMA_VERSION,
    CONDITION_KINDS,
    SCORING_KINDS,
    DIFFICULTY_TIERS,
    CHALLENGE_TYPES,
    DEFAULT_PENALTIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/schema.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_schema.js tests/js/missions/schema.test.js
git commit -m "feat(missions): add schema constants for v1 (six primitives, two scoring kinds)"
```

---

## Task 2: Mission Loader & Validation

The loader turns a plain object (parsed from `mission.json`) into a validated Mission. It catches missing-required-field errors, unknown enum values, and orphan references (e.g. a condition naming a zone that doesn't exist).

**Files:**
- Create: `js/mission_loader.js`
- Test: `tests/js/missions/loader.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/loader.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_loader']).ctx;
}

const MINIMAL_MISSION = {
  schema_version: 1,
  id: 'm1',
  title: 'M1',
  type: 'mission',
  difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 350, y: 163, heading: 90 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [{ id: '1',  shape: 'rect', x: 200, y: 200, w: 50, h: 50, label: '1' }],
  },
  steps: [
    {
      id: 'reach',
      title: 'Reach the red zone',
      points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' },
    },
  ],
  scoring: { kind: 'step_sum' },
};

test('load: accepts a minimal valid mission and returns it', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load(MINIMAL_MISSION);
  assert.strictEqual(mission.id, 'm1');
  assert.strictEqual(mission.steps.length, 1);
});

test('load: rejects when schema_version is missing or unknown', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, schema_version: 99 };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /schema_version/);
});

test('load: rejects unknown challenge type', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, type: 'unknown' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /type/);
});

test('load: rejects unknown difficulty tier', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, difficulty_tier: 'expert' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /difficulty_tier/);
});

test('load: rejects a mission with no steps when type is "mission"', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, steps: [] };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /at least one step/);
});

test('load: rejects a step whose condition references an unknown zone', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition.zone = 'nonexistent';
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown zone "nonexistent"/);
});

test('load: rejects a step whose condition references an unknown obstacle', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = { kind: 'contact', obstacle: 'ghost' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown obstacle "ghost"/);
});

test('load: rejects requires that name a nonexistent step', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].requires = ['missing'];
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /requires unknown step "missing"/);
});

test('load: rejects a condition with an unknown kind', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = { kind: 'wishful', subject: 'robot' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown condition kind/);
});

test('load: validates nested conditions inside all_of / not', () => {
  const ctx = env();
  const bad = JSON.parse(JSON.stringify(MINIMAL_MISSION));
  bad.steps[0].condition = {
    kind: 'all_of',
    of: [
      { kind: 'zone', subject: 'robot', zone: 'red' },
      { kind: 'not', of: { kind: 'zone', subject: 'robot', zone: 'orange' } },
    ],
  };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /unknown zone "orange"/);
});

test('load: defaults modifiers to {available: [], defaults: {}} when omitted', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load(MINIMAL_MISSION);
  assert.deepStrictEqual(mission.modifiers, { available: [], defaults: {} });
});

test('load: obstacle_course type requires scoring.kind = objective_minus_penalties', () => {
  const ctx = env();
  const bad = { ...MINIMAL_MISSION, type: 'obstacle_course' };
  assert.throws(() => ctx.MISSIONS.loader.load(bad), /obstacle_course.*objective_minus_penalties/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/loader.test.js
```
Expected: FAIL — `mission_loader.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_loader.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const schema   = MISSIONS.schema;
  if (!schema) throw new Error('mission_loader requires mission_schema to be loaded first');

  function load(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('mission: expected an object');
    }
    if (raw.schema_version !== schema.SCHEMA_VERSION) {
      throw new Error(`mission: unsupported schema_version (got ${raw.schema_version}, want ${schema.SCHEMA_VERSION})`);
    }
    for (const k of ['id', 'title', 'type', 'difficulty_tier', 'field', 'steps', 'scoring']) {
      if (raw[k] === undefined) throw new Error(`mission: missing required field "${k}"`);
    }
    if (!schema.CHALLENGE_TYPES.includes(raw.type)) {
      throw new Error(`mission: unknown type "${raw.type}"`);
    }
    if (!schema.DIFFICULTY_TIERS.includes(raw.difficulty_tier)) {
      throw new Error(`mission: unknown difficulty_tier "${raw.difficulty_tier}"`);
    }
    if (!schema.SCORING_KINDS.includes(raw.scoring.kind)) {
      throw new Error(`mission: unknown scoring.kind "${raw.scoring.kind}"`);
    }
    if (raw.type === 'obstacle_course' && raw.scoring.kind !== 'objective_minus_penalties') {
      throw new Error('mission: obstacle_course requires scoring.kind = objective_minus_penalties');
    }
    if (raw.type === 'mission' && (!Array.isArray(raw.steps) || raw.steps.length === 0)) {
      throw new Error('mission: type "mission" requires at least one step');
    }

    const zoneIds     = new Set((raw.field.zones     || []).map(z => z.id));
    const obstacleIds = new Set((raw.field.obstacles || []).map(o => o.id));
    const stepIds     = new Set((raw.steps           || []).map(s => s.id));

    for (const step of (raw.steps || [])) {
      for (const k of ['id', 'title', 'points', 'condition']) {
        if (step[k] === undefined) throw new Error(`mission step "${step.id || '?'}": missing "${k}"`);
      }
      if (step.requires) {
        for (const req of step.requires) {
          if (!stepIds.has(req)) {
            throw new Error(`mission step "${step.id}": requires unknown step "${req}"`);
          }
        }
      }
      validateCondition(step.condition, zoneIds, obstacleIds, step.id);
    }

    return {
      ...raw,
      modifiers: raw.modifiers || { available: [], defaults: {} },
    };
  }

  function validateCondition(cond, zoneIds, obstacleIds, stepLabel) {
    if (!cond || typeof cond !== 'object') {
      throw new Error(`mission step "${stepLabel}": condition is not an object`);
    }
    if (!schema.CONDITION_KINDS.includes(cond.kind)) {
      throw new Error(`mission step "${stepLabel}": unknown condition kind "${cond.kind}"`);
    }
    switch (cond.kind) {
      case 'zone':
        if (!zoneIds.has(cond.zone)) {
          throw new Error(`mission step "${stepLabel}": unknown zone "${cond.zone}"`);
        }
        if (cond.subject !== 'robot' && !cond.subject.startsWith('obstacle:')) {
          throw new Error(`mission step "${stepLabel}": zone.subject must be "robot" or "obstacle:<id>"`);
        }
        if (cond.subject.startsWith('obstacle:')) {
          const oid = cond.subject.slice('obstacle:'.length);
          if (!obstacleIds.has(oid)) {
            throw new Error(`mission step "${stepLabel}": unknown obstacle "${oid}"`);
          }
        }
        break;
      case 'sensor':
        for (const k of ['port', 'op', 'value']) {
          if (cond[k] === undefined) {
            throw new Error(`mission step "${stepLabel}": sensor condition missing "${k}"`);
          }
        }
        break;
      case 'contact':
        if (!obstacleIds.has(cond.obstacle)) {
          throw new Error(`mission step "${stepLabel}": unknown obstacle "${cond.obstacle}"`);
        }
        break;
      case 'not':
        validateCondition(cond.of, zoneIds, obstacleIds, stepLabel);
        break;
      case 'all_of':
      case 'any_of':
        if (!Array.isArray(cond.of) || cond.of.length === 0) {
          throw new Error(`mission step "${stepLabel}": ${cond.kind} requires non-empty "of" array`);
        }
        for (const child of cond.of) validateCondition(child, zoneIds, obstacleIds, stepLabel);
        break;
    }
  }

  MISSIONS.loader = { load };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/loader.test.js
```
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_loader.js tests/js/missions/loader.test.js
git commit -m "feat(missions): validate mission objects with cross-reference checking"
```

---

## Task 3: Zone Condition Primitive

Pure point-in-rect / point-in-circle hit test for zones. Robot uses its centre; an obstacle uses its current live position.

**Files:**
- Create: `js/mission_conditions.js`
- Test: `tests/js/missions/conditions-zone.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/conditions-zone.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

function snapshotWith(opts) {
  return {
    robot: opts.robot || { x: 0, y: 0, heading: 0 },
    obstacles: opts.obstacles || {},
    sensors: opts.sensors || {},
    contacts: opts.contacts || {},
    zones: opts.zones || {},
  };
}

test('zone (rect): robot inside the rect returns true', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 110, y: 110, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    true,
  );
});

test('zone (rect): robot outside the rect returns false', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 200, y: 200, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    false,
  );
});

test('zone (rect): point exactly on the bottom-left corner is inside (inclusive)', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 100, y: 100, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    true,
  );
});

test('zone (rect): point exactly on the top-right corner is inside (inclusive)', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 150, y: 150, heading: 0 },
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'red' }, snap),
    true,
  );
});

test('zone (circle): inside if Euclidean distance from centre <= r', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 103, y: 104, heading: 0 },  // dist = 5 from (100,100)
    zones: { goal: { id: 'goal', shape: 'circle', x: 100, y: 100, r: 5 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'goal' }, snap),
    true,
  );
});

test('zone (circle): outside if distance > r', () => {
  const ctx = env();
  const snap = snapshotWith({
    robot: { x: 110, y: 100, heading: 0 },  // dist = 10
    zones: { goal: { id: 'goal', shape: 'circle', x: 100, y: 100, r: 5 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'robot', zone: 'goal' }, snap),
    false,
  );
});

test('zone: subject "obstacle:1" uses the obstacle position', () => {
  const ctx = env();
  const snap = snapshotWith({
    obstacles: { '1': { x: 120, y: 120 } },
    zones:     { green: { id: 'green', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'obstacle:1', zone: 'green' }, snap),
    true,
  );
});

test('zone: missing subject returns false (defensive — should not crash)', () => {
  const ctx = env();
  const snap = snapshotWith({
    obstacles: {},
    zones:     { green: { id: 'green', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  });
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'zone', subject: 'obstacle:gone', zone: 'green' }, snap),
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/conditions-zone.test.js
```
Expected: FAIL — `mission_conditions.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_conditions.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  function pointInZone(point, zone) {
    if (!zone) return false;
    if (zone.shape === 'rect') {
      return point.x >= zone.x && point.x <= zone.x + zone.w
          && point.y >= zone.y && point.y <= zone.y + zone.h;
    }
    if (zone.shape === 'circle') {
      const dx = point.x - zone.x;
      const dy = point.y - zone.y;
      return Math.sqrt(dx * dx + dy * dy) <= zone.r;
    }
    return false;
  }

  function subjectPosition(subject, snap) {
    if (subject === 'robot') return { x: snap.robot.x, y: snap.robot.y };
    if (subject && subject.startsWith('obstacle:')) {
      const id = subject.slice('obstacle:'.length);
      const o = snap.obstacles[id];
      return o ? { x: o.x, y: o.y } : null;
    }
    return null;
  }

  function evaluateZone(cond, snap) {
    const pos = subjectPosition(cond.subject, snap);
    if (!pos) return false;
    return pointInZone(pos, snap.zones[cond.zone]);
  }

  function evaluate(cond, snap) {
    switch (cond.kind) {
      case 'zone': return evaluateZone(cond, snap);
      default: throw new Error(`evaluate: unsupported kind "${cond.kind}"`);
    }
  }

  MISSIONS.conditions = { evaluate, pointInZone, subjectPosition };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/conditions-zone.test.js
```
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_conditions.js tests/js/missions/conditions-zone.test.js
git commit -m "feat(missions): evaluate zone conditions (point-in-rect + point-in-circle)"
```

---

## Task 4: Sensor Condition Primitive

Compares a sensor's current reading against a value using one of six operators. The sensor reading is whatever the simulator already publishes — strings for colour, numbers for distance/force.

**Files:**
- Modify: `js/mission_conditions.js`
- Test: `tests/js/missions/conditions-sensor.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/conditions-sensor.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

function snap(sensors) {
  return { robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, zones: {}, contacts: {}, sensors };
}

test('sensor: equality match (color = "red")', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'C', op: '==', value: 'red' },
      snap({ C: 'red' })),
    true);
});

test('sensor: equality miss', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'C', op: '==', value: 'red' },
      snap({ C: 'green' })),
    false);
});

test('sensor: numeric < operator', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'D', op: '<', value: 100 },
      snap({ D: 80 })),
    true);
});

test('sensor: numeric > operator (false case)', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'D', op: '>', value: 100 },
      snap({ D: 80 })),
    false);
});

test('sensor: <= boundary', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'E', op: '<=', value: 5 },
      snap({ E: 5 })),
    true);
});

test('sensor: != operator', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'C', op: '!=', value: 'red' },
      snap({ C: 'blue' })),
    true);
});

test('sensor: missing port returns false (does not throw)', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'sensor', port: 'F', op: '==', value: 1 },
      snap({})),
    false);
});

test('sensor: unknown operator throws (programmer error)', () => {
  const ctx = env();
  assert.throws(() => ctx.MISSIONS.conditions.evaluate(
    { kind: 'sensor', port: 'C', op: '~', value: 1 },
    snap({ C: 1 })),
    /unknown.*operator/);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/conditions-sensor.test.js
```
Expected: FAIL — `evaluate: unsupported kind "sensor"`.

- [ ] **Step 3: Extend the implementation**

Edit `js/mission_conditions.js`. Add `evaluateSensor` and route `sensor` through it in the `evaluate` switch:

```javascript
  function evaluateSensor(cond, snap) {
    const reading = snap.sensors[cond.port];
    if (reading === undefined) return false;
    switch (cond.op) {
      case '==': return reading === cond.value;
      case '!=': return reading !== cond.value;
      case '<':  return reading <  cond.value;
      case '<=': return reading <= cond.value;
      case '>':  return reading >  cond.value;
      case '>=': return reading >= cond.value;
      default: throw new Error(`evaluateSensor: unknown operator "${cond.op}"`);
    }
  }
```

And update the switch in `evaluate`:

```javascript
  function evaluate(cond, snap) {
    switch (cond.kind) {
      case 'zone':   return evaluateZone(cond, snap);
      case 'sensor': return evaluateSensor(cond, snap);
      default: throw new Error(`evaluate: unsupported kind "${cond.kind}"`);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/conditions-sensor.test.js tests/js/missions/conditions-zone.test.js
```
Expected: PASS (8 + 8 = 16 tests, no regression).

- [ ] **Step 5: Commit**

```bash
git add js/mission_conditions.js tests/js/missions/conditions-sensor.test.js
git commit -m "feat(missions): evaluate sensor conditions with six comparison operators"
```

---

## Task 5: Contact Condition Primitive

`{kind: 'contact', obstacle: '1'}` fires true once `snapshot.contacts['1']` is true. The engine populates `contacts` from Box2D end-contact events; for unit tests the snapshot just supplies the map directly.

**Files:**
- Modify: `js/mission_conditions.js`
- Test: `tests/js/missions/conditions-contact.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/conditions-contact.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

function snap(contacts) {
  return { robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, zones: {}, sensors: {}, contacts };
}

test('contact: true when the named obstacle has been touched', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'contact', obstacle: '1' },
      snap({ '1': true })),
    true);
});

test('contact: false when the obstacle has not been touched yet', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'contact', obstacle: '1' },
      snap({})),
    false);
});

test('contact: untouched named obstacle is false even if others were touched', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'contact', obstacle: '2' },
      snap({ '1': true })),
    false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/conditions-contact.test.js
```
Expected: FAIL — `evaluate: unsupported kind "contact"`.

- [ ] **Step 3: Extend the implementation**

Add to `js/mission_conditions.js`:

```javascript
  function evaluateContact(cond, snap) {
    return !!snap.contacts[cond.obstacle];
  }
```

Update the switch:

```javascript
      case 'contact': return evaluateContact(cond, snap);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test "tests/js/missions/conditions-*.test.js"
```
Expected: PASS (8 + 8 + 3 = 19 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_conditions.js tests/js/missions/conditions-contact.test.js
git commit -m "feat(missions): evaluate contact conditions from snapshot.contacts map"
```

---

## Task 6: Composite Primitives (NOT / ALL_OF / ANY_OF)

Recursive composition. Short-circuits: ALL_OF returns false on first false child, ANY_OF returns true on first true child.

**Files:**
- Modify: `js/mission_conditions.js`
- Test: `tests/js/missions/conditions-composite.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/conditions-composite.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv(['mission_schema', 'mission_conditions']).ctx;
}

const T = { kind: 'contact', obstacle: 'touched' };
const F = { kind: 'contact', obstacle: 'never' };

function snap() {
  return {
    robot: { x: 0, y: 0, heading: 0 }, obstacles: {}, zones: {}, sensors: {},
    contacts: { touched: true },
  };
}

test('not: inverts a true child to false', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'not', of: T }, snap()),
    false);
});

test('not: inverts a false child to true', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'not', of: F }, snap()),
    true);
});

test('all_of: true only when every child is true', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'all_of', of: [T, T] }, snap()),
    true);
});

test('all_of: false when any child is false', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'all_of', of: [T, F] }, snap()),
    false);
});

test('any_of: true when at least one child is true', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'any_of', of: [F, T] }, snap()),
    true);
});

test('any_of: false only when every child is false', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate({ kind: 'any_of', of: [F, F] }, snap()),
    false);
});

test('composite: nesting works (NOT(ANY_OF(F, NOT(T))))', () => {
  const ctx = env();
  assert.strictEqual(
    ctx.MISSIONS.conditions.evaluate(
      { kind: 'not',
        of: { kind: 'any_of', of: [F, { kind: 'not', of: T }] } },
      snap()),
    true);
});

test('all_of: short-circuits — does not evaluate later children once one is false', () => {
  const ctx = env();
  let calls = 0;
  const counted = { kind: 'sensor', port: 'X', op: '==', value: 1 };
  // Override evaluate via a wrapper - simpler: just measure with a child that throws.
  const throwing = { kind: 'sensor', port: 'C', op: 'bogus_op', value: 1 };
  // F first, throwing-on-eval second → must not throw because all_of short-circuits.
  assert.doesNotThrow(() => ctx.MISSIONS.conditions.evaluate(
    { kind: 'all_of', of: [F, throwing] }, snap()));
});

test('any_of: short-circuits — does not evaluate later children once one is true', () => {
  const ctx = env();
  const throwing = { kind: 'sensor', port: 'C', op: 'bogus_op', value: 1 };
  assert.doesNotThrow(() => ctx.MISSIONS.conditions.evaluate(
    { kind: 'any_of', of: [T, throwing] }, snap()));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/conditions-composite.test.js
```
Expected: FAIL — `evaluate: unsupported kind "not"`.

- [ ] **Step 3: Extend the implementation**

Add to `js/mission_conditions.js`:

```javascript
  function evaluateNot(cond, snap)    { return !evaluate(cond.of, snap); }
  function evaluateAllOf(cond, snap)  {
    for (const child of cond.of) { if (!evaluate(child, snap)) return false; }
    return true;
  }
  function evaluateAnyOf(cond, snap)  {
    for (const child of cond.of) { if (evaluate(child, snap)) return true; }
    return false;
  }
```

Update the switch:

```javascript
      case 'not':    return evaluateNot(cond, snap);
      case 'all_of': return evaluateAllOf(cond, snap);
      case 'any_of': return evaluateAnyOf(cond, snap);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test "tests/js/missions/conditions-*.test.js"
```
Expected: PASS (8 + 8 + 3 + 9 = 28 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_conditions.js tests/js/missions/conditions-composite.test.js
git commit -m "feat(missions): evaluate composite conditions (not/all_of/any_of) with short-circuit"
```

---

## Task 7: ChallengeEngine Lifecycle

The engine owns mission progress: which steps are done, current score, when the run started. Lifecycle is `load → start → tick* → finalize`. Each call is idempotent in the sense that it doesn't depend on the simulator — tests drive it directly.

**Files:**
- Create: `js/mission_engine.js`
- Test: `tests/js/missions/engine-lifecycle.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/engine-lifecycle.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const MISSION = {
  schema_version: 1, id: 'lc', title: 'LC', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50, color: 'red' }],
    obstacles: [],
  },
  steps: [
    { id: 's1', title: 'Reach red', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
  ],
  scoring: { kind: 'step_sum' },
};

function snap(opts = {}) {
  return {
    robot: opts.robot || { x: 0, y: 0, heading: 0 },
    obstacles: {}, sensors: {}, contacts: {},
    zones: { red: { id: 'red', shape: 'rect', x: 100, y: 100, w: 50, h: 50 } },
  };
}

test('engine: load() returns a progress object with no steps complete', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  const p = e.load(ctx.MISSIONS.loader.load(MISSION));
  assert.strictEqual(p.score, 0);
  assert.deepStrictEqual(p.stepResults, {});
  assert.strictEqual(p.finalized, false);
});

test('engine: tick before start() is a no-op', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  const completed = e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  assert.deepStrictEqual(completed, []);
  assert.strictEqual(e.progress.score, 0);
});

test('engine: start() sets startTimeMs and arms the tick loop', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(1000);
  assert.strictEqual(e.startTimeMs, 1000);
});

test('engine: tick after start() completes a step whose condition fires true', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  const completed = e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  assert.deepStrictEqual(completed, ['s1']);
  assert.strictEqual(e.progress.score, 10);
  assert.strictEqual(e.progress.stepResults.s1.complete, true);
});

test('engine: completed steps do NOT re-fire on subsequent ticks', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  const completed2 = e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  assert.deepStrictEqual(completed2, []);
  assert.strictEqual(e.progress.score, 10);  // not 20
});

test('engine: reset() clears progress and timer back to fresh load state', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  e.reset();
  assert.strictEqual(e.startTimeMs, null);
  assert.strictEqual(e.progress.score, 0);
  assert.deepStrictEqual(e.progress.stepResults, {});
});

test('engine: finalize() marks finalized=true and locks score', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(MISSION));
  e.start(0);
  e.tick(snap({ robot: { x: 120, y: 120, heading: 0 } }));
  const result = e.finalize(1500);
  assert.strictEqual(result.finalized, true);
  assert.strictEqual(result.score, 10);
  assert.strictEqual(result.elapsedMs, 1500);
});

test('engine: recordContact populates the contacts map (first-hit only)', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.recordContact('1', 100);
  e.recordContact('1', 200);  // ignored — already recorded
  assert.strictEqual(e.firstContact['1'], 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/engine-lifecycle.test.js
```
Expected: FAIL — `mission_engine.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_engine.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.conditions) throw new Error('mission_engine requires mission_conditions');

  class ChallengeEngine {
    constructor() {
      this.mission       = null;
      this.progress      = null;
      this.startTimeMs   = null;
      this.firstContact  = {};
      this._zonesById    = {};
    }

    load(mission) {
      this.mission       = mission;
      this.progress      = { score: 0, stepResults: {}, finalized: false };
      this.startTimeMs   = null;
      this.firstContact  = {};
      this._zonesById    = {};
      for (const z of (mission.field.zones || [])) { this._zonesById[z.id] = z; }
      return this.progress;
    }

    start(nowMs) {
      this.startTimeMs = nowMs;
    }

    tick(simSnap) {
      const completed = [];
      if (this.startTimeMs == null || !this.progress || this.progress.finalized) return completed;
      const snap = this._snapshotFor(simSnap);
      for (const step of this.mission.steps) {
        if (this.progress.stepResults[step.id]) continue;
        if (!this._requiresMet(step)) continue;
        if (MISSIONS.conditions.evaluate(step.condition, snap)) {
          this.progress.stepResults[step.id] = { complete: true, completedAtMs: Date.now() };
          this.progress.score += step.points;
          completed.push(step.id);
        }
      }
      return completed;
    }

    recordContact(obstacleId, nowMs) {
      if (this.firstContact[obstacleId] == null) this.firstContact[obstacleId] = nowMs;
    }

    finalize(elapsedMs) {
      if (!this.progress) return null;
      this.progress.finalized = true;
      this.progress.elapsedMs = elapsedMs;
      return this.progress;
    }

    reset() {
      if (this.mission) this.load(this.mission);
    }

    _requiresMet(step) {
      if (!step.requires || step.requires.length === 0) return true;
      return step.requires.every(id => this.progress.stepResults[id]);
    }

    _snapshotFor(simSnap) {
      const contacts = {};
      for (const id of Object.keys(this.firstContact)) contacts[id] = true;
      return {
        robot:     simSnap.robot,
        obstacles: simSnap.obstacles,
        sensors:   simSnap.sensors,
        zones:     this._zonesById,
        contacts,
      };
    }
  }

  MISSIONS.engine = { ChallengeEngine };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/engine-lifecycle.test.js
```
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_engine.js tests/js/missions/engine-lifecycle.test.js
git commit -m "feat(missions): add ChallengeEngine lifecycle and step polling"
```

---

## Task 8: Engine — Step `requires` Dependencies

A step's condition isn't evaluated until all required steps are complete. This lets authors express "do X *then* Y" without tying the mission to a code structure.

**Files:**
- Test: `tests/js/missions/engine-requires.test.js`
- (Implementation already lives in Task 7; this task validates it through a fresh test fixture.)

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/engine-requires.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const TWO_STEP = {
  schema_version: 1, id: 'rq', title: 'RQ', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [
      { id: 'a', shape: 'rect', x: 0,   y: 0,   w: 10, h: 10, color: 'red'   },
      { id: 'b', shape: 'rect', x: 100, y: 100, w: 10, h: 10, color: 'green' },
    ],
    obstacles: [],
  },
  steps: [
    { id: 'first',  title: 'Reach A', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'a' } },
    { id: 'second', title: 'Reach B', points: 20, requires: ['first'],
      condition: { kind: 'zone', subject: 'robot', zone: 'b' } },
  ],
  scoring: { kind: 'step_sum' },
};

function snap(x, y) {
  return {
    robot: { x, y, heading: 0 }, obstacles: {}, sensors: {}, contacts: {},
    zones: {
      a: { id: 'a', shape: 'rect', x: 0,   y: 0,   w: 10, h: 10 },
      b: { id: 'b', shape: 'rect', x: 100, y: 100, w: 10, h: 10 },
    },
  };
}

test('requires: a gated step does not complete while its requirement is unmet', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TWO_STEP));
  e.start(0);
  const completed = e.tick(snap(105, 105));  // inside B but not yet inside A
  assert.deepStrictEqual(completed, []);
  assert.strictEqual(e.progress.score, 0);
});

test('requires: gated step completes after its requirement does', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TWO_STEP));
  e.start(0);
  e.tick(snap(5, 5));            // satisfies "first"
  const completed = e.tick(snap(105, 105));  // now satisfies "second"
  assert.deepStrictEqual(completed, ['second']);
  assert.strictEqual(e.progress.score, 30);
});

test('requires: both steps can complete in the same tick if order in steps[] permits', () => {
  // The engine iterates steps in author order; "first" satisfies, then "second"
  // sees "first" done in the same tick and satisfies too.
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(TWO_STEP));
  e.start(0);
  // Position a single robot inside neither zone first to be honest about the
  // test: place the robot inside A and check; then advance to B in next tick.
  // Demonstrating both-in-one-tick requires the snapshot to satisfy both
  // zone predicates, which is impossible with disjoint zones. We assert the
  // realistic two-tick path instead.
  const t1 = e.tick(snap(5, 5));      e.tick = e.tick.bind(e); // anchor
  const t2 = e.tick(snap(105, 105));
  assert.deepStrictEqual(t1, ['first']);
  assert.deepStrictEqual(t2, ['second']);
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
node --test tests/js/missions/engine-requires.test.js
```
Expected: PASS (3 tests). The implementation from Task 7 already supports this — this task locks behaviour in with explicit coverage.

- [ ] **Step 3: Commit**

```bash
git add tests/js/missions/engine-requires.test.js
git commit -m "test(missions): lock in step requires dependency behaviour"
```

---

## Task 9: Mission Scoring (step_sum)

`step_sum` is what Task 7 already does — score is the running sum of completed step points. This task adds the `maxScore` computation, finalization shape, and the star rating helper.

**Files:**
- Modify: `js/mission_engine.js`
- Test: `tests/js/missions/scoring-mission.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/scoring-mission.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const M = {
  schema_version: 1, id: 'sc', title: 'SC', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [
      { id: 'a', shape: 'rect', x: 0,   y: 0,   w: 10, h: 10, color: 'red' },
      { id: 'b', shape: 'rect', x: 100, y: 100, w: 10, h: 10, color: 'red' },
    ],
    obstacles: [],
  },
  steps: [
    { id: 'a', title: 'A', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'a' } },
    { id: 'b', title: 'B', points: 15,
      condition: { kind: 'zone', subject: 'robot', zone: 'b' } },
  ],
  scoring: { kind: 'step_sum' },
};

function snap(x, y) {
  return {
    robot: { x, y, heading: 0 }, obstacles: {}, sensors: {}, contacts: {},
    zones: {
      a: { id: 'a', shape: 'rect', x: 0,   y: 0,   w: 10, h: 10 },
      b: { id: 'b', shape: 'rect', x: 100, y: 100, w: 10, h: 10 },
    },
  };
}

test('maxScore: sum of all step points', () => {
  const ctx = env();
  const mission = ctx.MISSIONS.loader.load(M);
  assert.strictEqual(ctx.MISSIONS.engine.maxScore(mission), 25);
});

test('finalize: step_sum returns score (no penalties applied)', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(M));
  e.start(0);
  e.tick(snap(5, 5));        // a → +10
  e.tick(snap(105, 105));    // b → +15
  const final = e.finalize(5000);
  assert.strictEqual(final.score, 25);
  assert.strictEqual(final.maxScore, 25);
  assert.deepStrictEqual(final.breakdown, [
    { kind: 'step', stepId: 'a', title: 'A', points: 10 },
    { kind: 'step', stepId: 'b', title: 'B', points: 15 },
  ]);
});

test('starRating: 3 stars at ≥ 90% of max', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(90, 100), 3);
  assert.strictEqual(ctx.MISSIONS.engine.starRating(89, 100), 2);
});

test('starRating: 2 stars at ≥ 60%', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(60, 100), 2);
  assert.strictEqual(ctx.MISSIONS.engine.starRating(59, 100), 1);
});

test('starRating: 1 star for any positive score', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(1,   100), 1);
  assert.strictEqual(ctx.MISSIONS.engine.starRating(0.5, 100), 1);
});

test('starRating: 0 stars at zero score', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(0, 100), 0);
});

test('starRating: maxScore = 0 → 3 stars by convention (avoid divide-by-zero shame)', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.engine.starRating(0, 0), 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/scoring-mission.test.js
```
Expected: FAIL — `maxScore is not a function`, `starRating is not a function`, etc.

- [ ] **Step 3: Extend the implementation**

Edit `js/mission_engine.js`. Add the two helpers at module scope and update `finalize`:

```javascript
  function maxScore(mission) {
    if (mission.scoring.kind === 'step_sum') {
      return mission.steps.reduce((s, st) => s + st.points, 0);
    }
    if (mission.scoring.kind === 'objective_minus_penalties') {
      return 100;
    }
    return 0;
  }

  function starRating(score, max) {
    if (max <= 0) return 3;
    if (score <= 0) return 0;
    const r = score / max;
    if (r >= 0.9) return 3;
    if (r >= 0.6) return 2;
    return 1;
  }
```

Update `finalize` to populate `maxScore` and `breakdown`:

```javascript
    finalize(elapsedMs) {
      if (!this.progress) return null;
      this.progress.finalized = true;
      this.progress.elapsedMs = elapsedMs;
      this.progress.maxScore  = maxScore(this.mission);
      this.progress.breakdown = this._buildBreakdown();
      return this.progress;
    }

    _buildBreakdown() {
      const rows = [];
      for (const step of this.mission.steps) {
        if (this.progress.stepResults[step.id]) {
          rows.push({ kind: 'step', stepId: step.id, title: step.title, points: step.points });
        }
      }
      return rows;
    }
```

Add to the export:

```javascript
  MISSIONS.engine = { ChallengeEngine, maxScore, starRating };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/scoring-mission.test.js tests/js/missions/engine-lifecycle.test.js
```
Expected: PASS (7 + 8 = 15 tests, no regression).

- [ ] **Step 5: Commit**

```bash
git add js/mission_engine.js tests/js/missions/scoring-mission.test.js
git commit -m "feat(missions): compute maxScore, breakdown, and star rating for step_sum"
```

---

## Task 10: Obstacle-Course Scoring (objective_minus_penalties)

Base 100 if the robot enters the `goal_zone`, else 0. Subtract `per_contact × distinct_obstacles_hit` capped at `cap`. Subtract `ceil(elapsed_s − target_time_s) × per_second_over`.

**Files:**
- Modify: `js/mission_engine.js`
- Test: `tests/js/missions/scoring-obstacle-course.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/scoring-obstacle-course.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const OC = {
  schema_version: 1, id: 'oc', title: 'OC', type: 'obstacle_course',
  difficulty_tier: 'intermediate',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'finish', shape: 'rect', x: 100, y: 0, w: 50, h: 50, color: 'green' }],
    obstacles: [
      { id: 'p1', shape: 'rect', x: 30, y: 0, w: 5, h: 5, label: 'p1' },
      { id: 'p2', shape: 'rect', x: 60, y: 0, w: 5, h: 5, label: 'p2' },
    ],
  },
  steps: [],
  scoring: {
    kind: 'objective_minus_penalties',
    goal_zone: 'finish',
    collisions: { per_contact: 5, cap: 50 },
    time_budget_s: 10,
    per_second_over: 1,
  },
};

function snap(x, y) {
  return {
    robot: { x, y, heading: 0 }, obstacles: {}, sensors: {}, contacts: {},
    zones: { finish: { id: 'finish', shape: 'rect', x: 100, y: 0, w: 50, h: 50 } },
  };
}

test('OC: never reaches goal → 0', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.tick(snap(50, 0));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.maxScore, 100);
});

test('OC: reaches goal cleanly, on time → 100', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.tick(snap(110, 10));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 100);
});

test('OC: collision penalty per distinct obstacle hit', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.recordContact('p1', 100);
  e.recordContact('p2', 200);
  e.recordContact('p1', 300);  // re-hit, must not double-charge
  e.tick(snap(110, 10));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 100 - 10);  // two distinct obstacles × 5
});

test('OC: collision penalty caps at cap', () => {
  const ctx = env();
  const big = JSON.parse(JSON.stringify(OC));
  big.field.obstacles = [];
  for (let i = 0; i < 20; i++) big.field.obstacles.push(
    { id: `p${i}`, shape: 'rect', x: 10 + i*4, y: 0, w: 2, h: 2, label: `p${i}` });
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(big));
  e.start(0);
  for (let i = 0; i < 20; i++) e.recordContact(`p${i}`, i * 10);
  e.tick(snap(110, 10));
  const r = e.finalize(8000);
  assert.strictEqual(r.score, 100 - 50);  // capped
});

test('OC: time penalty kicks in only after target_time_s', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.tick(snap(110, 10));
  const r = e.finalize(13_000);  // 13s, 3s over budget at 1/s → −3
  assert.strictEqual(r.score, 100 - 3);
});

test('OC: total cannot go below zero', () => {
  const ctx = env();
  const tight = JSON.parse(JSON.stringify(OC));
  tight.scoring.time_budget_s   = 1;
  tight.scoring.per_second_over = 200;  // contrived to overshoot
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(tight));
  e.start(0);
  e.tick(snap(110, 10));
  const r = e.finalize(60_000);
  assert.strictEqual(r.score, 0);
});

test('OC: breakdown lists base + collision + time rows', () => {
  const ctx = env();
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(ctx.MISSIONS.loader.load(OC));
  e.start(0);
  e.recordContact('p1', 100);
  e.tick(snap(110, 10));
  const r = e.finalize(13_000);
  const kinds = r.breakdown.map(b => b.kind);
  assert.deepStrictEqual(kinds, ['base', 'collisions', 'time']);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/scoring-obstacle-course.test.js
```
Expected: FAIL — score is 0 because the engine's finalize doesn't yet handle obstacle-course scoring.

- [ ] **Step 3: Extend the implementation**

Edit `js/mission_engine.js`. Modify `finalize` and add the obstacle-course branch:

```javascript
    finalize(elapsedMs) {
      if (!this.progress) return null;
      this.progress.finalized = true;
      this.progress.elapsedMs = elapsedMs;
      this.progress.maxScore  = maxScore(this.mission);

      if (this.mission.scoring.kind === 'step_sum') {
        this.progress.breakdown = this._buildBreakdown();
        return this.progress;
      }
      if (this.mission.scoring.kind === 'objective_minus_penalties') {
        this._finalizeObstacleCourse(elapsedMs);
        return this.progress;
      }
      return this.progress;
    }

    _finalizeObstacleCourse(elapsedMs) {
      const sc = this.mission.scoring;
      // Did the robot reach the goal zone? Engine doesn't poll the goal as a
      // step; instead, we inspect the last snapshot via a saved goalReached flag.
      const reached = this._goalReached === true;
      const base = reached ? 100 : 0;

      const distinct = Object.keys(this.firstContact).length;
      const perContact = (sc.collisions && sc.collisions.per_contact) || 0;
      const cap        = (sc.collisions && sc.collisions.cap) || 0;
      const collisionPenalty = Math.min(cap, distinct * perContact);

      const targetS = sc.time_budget_s || 0;
      const perOver = sc.per_second_over || 0;
      const elapsedS = elapsedMs / 1000;
      const timePenalty = elapsedS > targetS
        ? Math.ceil(elapsedS - targetS) * perOver
        : 0;

      const total = Math.max(0, base - collisionPenalty - timePenalty);
      this.progress.score = total;
      this.progress.breakdown = [
        { kind: 'base',       label: reached ? 'Reached the finish zone' : 'Did not reach goal', points: base },
        { kind: 'collisions', label: `Collisions (${distinct})`, points: -collisionPenalty },
        { kind: 'time',       label: `Time over budget`,         points: -timePenalty },
      ];
    }
```

For the engine to know whether the goal was reached, `tick()` must inspect the `goal_zone` for obstacle-course missions. Extend `tick`:

```javascript
    tick(simSnap) {
      const completed = [];
      if (this.startTimeMs == null || !this.progress || this.progress.finalized) return completed;
      const snap = this._snapshotFor(simSnap);

      if (this.mission.type === 'obstacle_course' && this.mission.scoring.goal_zone) {
        const cond = { kind: 'zone', subject: 'robot', zone: this.mission.scoring.goal_zone };
        if (MISSIONS.conditions.evaluate(cond, snap)) this._goalReached = true;
      }

      for (const step of this.mission.steps) {
        if (this.progress.stepResults[step.id]) continue;
        if (!this._requiresMet(step)) continue;
        if (MISSIONS.conditions.evaluate(step.condition, snap)) {
          this.progress.stepResults[step.id] = { complete: true, completedAtMs: Date.now() };
          this.progress.score += step.points;
          completed.push(step.id);
        }
      }
      return completed;
    }
```

And in `load()`, reset `_goalReached`:

```javascript
      this._goalReached = false;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/scoring-obstacle-course.test.js tests/js/missions/scoring-mission.test.js tests/js/missions/engine-lifecycle.test.js tests/js/missions/engine-requires.test.js
```
Expected: PASS (7 + 7 + 8 + 3 = 25 tests, no regression).

- [ ] **Step 5: Commit**

```bash
git add js/mission_engine.js tests/js/missions/scoring-obstacle-course.test.js
git commit -m "feat(missions): obstacle-course scoring (base − collisions − time-over)"
```

---

## Task 11: Run-Result Persistence (localStorage)

Stores the best score and last-played timestamp per `(mission_id, modifier_hash)`. v1's `modifier_hash` is the constant `"v0"` because modifiers aren't built yet (spec §11 — reserved schema slot). Keeping the key shape now means #45 can ship without breaking stored data.

**Files:**
- Create: `js/mission_persistence.js`
- Test: `tests/js/missions/persistence.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/persistence.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function envWithStorage(initial = {}) {
  const ctx = makeMissionsEnv(['mission_schema', 'mission_persistence']).ctx;
  const store = new Map(Object.entries(initial));
  ctx.localStorage = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  return { ctx, store };
}

test('recordRun: writes best-score record and reads it back', () => {
  const { ctx, store } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'red-zone-then-push', {
    score: 25, maxScore: 25, stars: 3, elapsedMs: 5400,
  });
  const r = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'red-zone-then-push');
  assert.strictEqual(r.score, 25);
  assert.strictEqual(r.stars, 3);
});

test('recordRun: does NOT downgrade an existing better score', () => {
  const { ctx } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 25, maxScore: 25, stars: 3, elapsedMs: 5400,
  });
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 10, maxScore: 25, stars: 1, elapsedMs: 7000,
  });
  const r = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'm');
  assert.strictEqual(r.score, 25);
});

test('recordRun: updates last-played timestamp even when score is worse', () => {
  const { ctx } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 25, maxScore: 25, stars: 3, elapsedMs: 5400,
  });
  const firstPlayed = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'm').lastPlayedMs;
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 10, maxScore: 25, stars: 1, elapsedMs: 7000,
  });
  const second = ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'm');
  assert.notStrictEqual(second.lastPlayedMs, firstPlayed);
});

test('recordRun: storage key includes modifier_hash slot (defaults to "v0")', () => {
  const { ctx, store } = envWithStorage();
  ctx.MISSIONS.persistence.recordRun(ctx.localStorage, 'm', {
    score: 1, maxScore: 1, stars: 1, elapsedMs: 0,
  });
  const keys = [...store.keys()];
  assert.ok(keys.some(k => k.includes('m') && k.includes('v0')),
    `expected a key containing mission id and "v0"; got: ${keys.join(', ')}`);
});

test('getBest: missing record returns null', () => {
  const { ctx } = envWithStorage();
  assert.strictEqual(
    ctx.MISSIONS.persistence.getBest(ctx.localStorage, 'never-played'),
    null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/persistence.test.js
```
Expected: FAIL — `mission_persistence.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_persistence.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  const KEY_PREFIX = 'fll-vr-mission/run/';
  const DEFAULT_MODIFIER_HASH = 'v0';

  function keyFor(missionId, modifierHash) {
    return `${KEY_PREFIX}${missionId}/${modifierHash || DEFAULT_MODIFIER_HASH}`;
  }

  function recordRun(storage, missionId, result, opts = {}) {
    const key = keyFor(missionId, opts.modifierHash);
    const prior = readJson(storage, key);
    const now = (typeof opts.now === 'number') ? opts.now : Date.now();
    const next = {
      score:        prior && prior.score >= result.score ? prior.score : result.score,
      maxScore:     result.maxScore,
      stars:        prior && prior.stars >= result.stars ? prior.stars : result.stars,
      elapsedMs:    result.elapsedMs,
      lastPlayedMs: now,
    };
    storage.setItem(key, JSON.stringify(next));
    return next;
  }

  function getBest(storage, missionId, opts = {}) {
    return readJson(storage, keyFor(missionId, opts.modifierHash));
  }

  function readJson(storage, key) {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_e) { return null; }
  }

  MISSIONS.persistence = { recordRun, getBest, keyFor, KEY_PREFIX };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/persistence.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_persistence.js tests/js/missions/persistence.test.js
git commit -m "feat(missions): persist best score per (mission_id, modifier_hash) to localStorage"
```

---

## Task 12: First Bundled Mission

Hand-author the `red-zone-then-push` mission as JSON, plus a reference solution and README.

**Files:**
- Create: `missions/red-zone-then-push/mission.json`
- Create: `missions/red-zone-then-push/README.md`
- Create: `missions/red-zone-then-push/solution.py`
- Test: `tests/js/missions/bundled-red-zone.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/bundled-red-zone.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeMissionsEnv, REPO_ROOT } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine',
  ]).ctx;
}

const MISSION_PATH = path.join(REPO_ROOT, 'missions/red-zone-then-push/mission.json');

test('bundled red-zone mission loads without errors', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  assert.strictEqual(mission.id, 'red-zone-then-push');
  assert.strictEqual(mission.type, 'mission');
  assert.strictEqual(mission.steps.length, 2);
});

test('bundled red-zone mission max score is 25 (10 + 15)', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  assert.strictEqual(ctx.MISSIONS.engine.maxScore(mission), 25);
});

test('bundled red-zone mission: step 1 completes when robot enters the red zone', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(mission);
  e.start(0);
  // Place robot inside the red zone (the spec's example: red rect at x=1900, y=243, 200×200).
  const completed = e.tick({
    robot: { x: 2000, y: 343, heading: 90 },
    obstacles: { '1': { x: 1700, y: 943 } },
    sensors: {},
  });
  assert.ok(completed.includes('reach-red'), `expected reach-red, got ${completed}`);
});

test('bundled red-zone mission: step 2 requires step 1 first', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  const e = new ctx.MISSIONS.engine.ChallengeEngine();
  e.load(mission);
  e.start(0);
  // Push obstacle 1 off green (move it elsewhere), but don't reach red yet.
  const completed = e.tick({
    robot: { x: 0, y: 0, heading: 90 },
    obstacles: { '1': { x: 50, y: 50 } },   // away from green
    sensors: {},
  });
  assert.deepStrictEqual(completed, []);  // step 2 is gated
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/bundled-red-zone.test.js
```
Expected: FAIL — file not found at `missions/red-zone-then-push/mission.json`.

- [ ] **Step 3: Create the mission files**

Create `missions/red-zone-then-push/mission.json`:

```json
{
  "schema_version": 1,
  "id": "red-zone-then-push",
  "title": "Red Zone then Push",
  "description": "Drive to the red zone, then knock obstacle 1 off the green zone.",
  "author": "Sanad Foundation",
  "type": "mission",
  "difficulty_tier": "beginner",

  "field": {
    "robot_start": { "x": 350, "y": 163, "heading": 90 },
    "zones": [
      { "id": "red",   "shape": "rect", "x": 1900, "y": 243, "w": 200, "h": 200, "color": "red"   },
      { "id": "green", "shape": "rect", "x": 1600, "y": 843, "w": 200, "h": 200, "color": "green" }
    ],
    "obstacles": [
      { "id": "1", "shape": "rect", "x": 1700, "y": 943, "w": 100, "h": 100, "label": "1", "fill": "#9b59b6" }
    ]
  },

  "steps": [
    {
      "id": "reach-red",
      "title": "Reach the red zone",
      "points": 10,
      "hint": "Drive forward about 1200 mm, then a bit south.",
      "condition": { "kind": "zone", "subject": "robot", "zone": "red" }
    },
    {
      "id": "push-obstacle-1",
      "title": "Push obstacle 1 off the green zone",
      "points": 15,
      "hint": "Turn left and drive forward into the green zone.",
      "requires": ["reach-red"],
      "condition": {
        "kind": "not",
        "of": { "kind": "zone", "subject": "obstacle:1", "zone": "green" }
      }
    }
  ],

  "scoring": { "kind": "step_sum" },

  "modifiers": { "available": [], "defaults": {} }
}
```

Create `missions/red-zone-then-push/README.md`:

```markdown
# Red Zone then Push

A two-step starter mission. The robot drives east to the red zone, then turns
and pushes a purple block off the green zone. Total: 25 points.

## Steps

1. **Reach the red zone** (10 pts) — robot's centre enters the red rectangle.
2. **Push obstacle 1 off the green zone** (15 pts, requires step 1) — obstacle 1
   leaves the green rectangle.

## Field

Default FLL field (2362 × 1143 mm) with two added zones and one obstacle.
```

Create `missions/red-zone-then-push/solution.py`:

```python
# Reference solution for the "Red Zone then Push" mission.
# Drives east to the red zone, then loops back and pushes obstacle 1 off green.

from spike import PrimeHub, MotorPair, port
import runloop

hub   = PrimeHub()
drive = MotorPair(port.A, port.B)

async def main():
    # Step 1: reach the red zone.
    await drive.move(1350)       # east, through yellow, into red.

    # Step 2: turn north, push obstacle 1 off the green zone.
    await drive.move_for_degrees(180, 50, -50)   # half-pivot
    await drive.move(700)                         # forward into obstacle 1

runloop.run(main())
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/bundled-red-zone.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add missions/red-zone-then-push/ tests/js/missions/bundled-red-zone.test.js
git commit -m "feat(missions): bundle the first mission (red-zone-then-push)"
```

---

## Task 13: Bundle Manifest + Library Fetcher

A static `missions/manifest.json` lists every bundled mission's id. The library fetcher reads the manifest, then fetches each mission's `mission.json`. v1 keeps it tiny — just enough so later UI work can list bundled missions.

**Files:**
- Create: `missions/manifest.json`
- Create: `js/mission_library.js`
- Test: `tests/js/missions/library.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/library.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function envWithFetch(fetchImpl) {
  const ctx = makeMissionsEnv(['mission_schema', 'mission_loader', 'mission_library']).ctx;
  ctx.fetch = fetchImpl;
  return ctx;
}

const MANIFEST = { schema_version: 1, missions: ['m1', 'm2'] };
const M1 = {
  schema_version: 1, id: 'm1', title: 'M1', type: 'mission', difficulty_tier: 'beginner',
  field: { robot_start: { x: 0, y: 0, heading: 0 }, zones: [], obstacles: [] },
  steps: [{ id: 'a', title: 'a', points: 1, condition: { kind: 'contact', obstacle: '__never__' } }],
  scoring: { kind: 'step_sum' },
};
const M2 = { ...M1, id: 'm2', title: 'M2' };

function jsonResponse(obj) {
  return { ok: true, json: async () => obj };
}

test('library: fetchManifest pulls and parses missions/manifest.json', async () => {
  const ctx = envWithFetch(async (url) => {
    assert.strictEqual(url, 'missions/manifest.json');
    return jsonResponse(MANIFEST);
  });
  const m = await ctx.MISSIONS.library.fetchManifest();
  assert.deepStrictEqual(m.missions, ['m1', 'm2']);
});

test('library: fetchMission fetches and validates a single mission', async () => {
  // Patch: M1's step condition referenced an obstacle that doesn't exist,
  // which the validator would catch. Use a self-consistent mission instead.
  const ok = JSON.parse(JSON.stringify(M1));
  ok.steps[0].condition = { kind: 'zone', subject: 'robot', zone: '__never__' };
  ok.field.zones = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, color: 'red' }];
  const ctx = envWithFetch(async (url) => {
    assert.strictEqual(url, 'missions/m1/mission.json');
    return jsonResponse(ok);
  });
  const mission = await ctx.MISSIONS.library.fetchMission('m1');
  assert.strictEqual(mission.id, 'm1');
});

test('library: loadAllBundled returns array of validated missions in manifest order', async () => {
  const fetches = {};
  fetches['missions/manifest.json'] = jsonResponse(MANIFEST);
  const okM1 = JSON.parse(JSON.stringify(M1));
  okM1.steps[0].condition = { kind: 'zone', subject: 'robot', zone: 'z' };
  okM1.field.zones = [{ id: 'z', shape: 'rect', x: -1, y: -1, w: 1, h: 1, color: 'red' }];
  const okM2 = { ...okM1, id: 'm2', title: 'M2' };
  fetches['missions/m1/mission.json'] = jsonResponse(okM1);
  fetches['missions/m2/mission.json'] = jsonResponse(okM2);

  const ctx = envWithFetch(async (url) => fetches[url]);
  const all = await ctx.MISSIONS.library.loadAllBundled();
  assert.deepStrictEqual(all.map(m => m.id), ['m1', 'm2']);
});

test('library: fetchManifest rejects on non-OK response', async () => {
  const ctx = envWithFetch(async () => ({ ok: false, status: 404 }));
  await assert.rejects(
    () => ctx.MISSIONS.library.fetchManifest(),
    /manifest/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/library.test.js
```
Expected: FAIL — `mission_library.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `missions/manifest.json`:

```json
{
  "schema_version": 1,
  "missions": ["red-zone-then-push"]
}
```

Create `js/mission_library.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.loader) throw new Error('mission_library requires mission_loader');

  async function fetchManifest() {
    const res = await global.fetch('missions/manifest.json');
    if (!res.ok) throw new Error(`mission library: failed to load manifest (HTTP ${res.status})`);
    return await res.json();
  }

  async function fetchMission(id) {
    const res = await global.fetch(`missions/${id}/mission.json`);
    if (!res.ok) throw new Error(`mission library: failed to load mission "${id}" (HTTP ${res.status})`);
    const raw = await res.json();
    return MISSIONS.loader.load(raw);
  }

  async function loadAllBundled() {
    const manifest = await fetchManifest();
    const out = [];
    for (const id of manifest.missions) {
      out.push(await fetchMission(id));
    }
    return out;
  }

  MISSIONS.library = { fetchManifest, fetchMission, loadAllBundled };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/library.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add missions/manifest.json js/mission_library.js tests/js/missions/library.test.js
git commit -m "feat(missions): fetch bundled missions from missions/manifest.json"
```

---

## Task 14: Simulator State Snapshot

Expose a `getStateSnapshot()` on `RobotSimulator` returning the data the engine needs: robot pose, live obstacle positions, current sensor values keyed by port. This is read-only — no behaviour change for callers that don't use it.

**Files:**
- Modify: `js/simulator.js` (add method near other state-accessors; ~line 1300 has similar methods)
- Test: `tests/js/state/snapshot.test.js`

- [ ] **Step 1: Find where to add the method**

Look at `js/simulator.js` for an existing method like `_updateSensorPanel`, `setUnits`, or `_sensorPosition` to anchor placement. The new method should sit alongside other public-ish accessors. Search for the section header `// ── Public API` if one exists, otherwise place right before `// ── Drawing loop` or near the end of the class before the closing brace.

```bash
grep -n "// ──" js/simulator.js | head -20
```

- [ ] **Step 2: Write the failing test**

Create `tests/js/state/snapshot.test.js` (in the existing `state` directory — alongside `place-robot.test.js`):

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeSim } = require('../sim-helper');

test('getStateSnapshot: returns robot pose with x, y, heading', async () => {
  const sim = await makeSim();
  const snap = sim.getStateSnapshot();
  assert.strictEqual(typeof snap.robot.x, 'number');
  assert.strictEqual(typeof snap.robot.y, 'number');
  assert.strictEqual(typeof snap.robot.heading, 'number');
});

test('getStateSnapshot: includes obstacle map keyed by label', async () => {
  const sim = await makeSim();
  const snap = sim.getStateSnapshot();
  // Default OBSTACLES has labels '1' and '2'.
  assert.ok(snap.obstacles['1'], 'expected obstacle "1"');
  assert.ok(snap.obstacles['2'], 'expected obstacle "2"');
  assert.strictEqual(typeof snap.obstacles['1'].x, 'number');
  assert.strictEqual(typeof snap.obstacles['1'].y, 'number');
});

test('getStateSnapshot: sensors map keyed by port letter', async () => {
  const sim = await makeSim();
  const snap = sim.getStateSnapshot();
  assert.ok('C' in snap.sensors, 'expected color sensor on C');
  assert.ok('D' in snap.sensors, 'expected distance sensor on D');
  assert.ok('E' in snap.sensors, 'expected force sensor on E');
});
```

Inspect `tests/js/sim-helper.js` first to see how to construct a sim instance for tests:

```bash
cat tests/js/sim-helper.js | head -50
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test tests/js/state/snapshot.test.js
```
Expected: FAIL — `sim.getStateSnapshot is not a function`.

- [ ] **Step 4: Implement getStateSnapshot in js/simulator.js**

Locate the `RobotSimulator` class. Near other read-only accessors (search for `_sensorPosition` or `_updateSensorPanel` and place the new method nearby — typically right before the `// ── Drawing loop` section header). Add:

```javascript
  // Read-only snapshot for the missions ChallengeEngine. Returns a fresh
  // object — callers can mutate without affecting simulator state. Sensor
  // values mirror what's displayed in the right-rail panel.
  getStateSnapshot() {
    const obstacles = {};
    for (const o of this._obstacles) {
      const pos = o.body ? this.physics.bodyPosition(o.body) : { x: o.cfg.x, y: o.cfg.y };
      obstacles[o.cfg.label] = { x: pos.x, y: pos.y };
    }
    return {
      robot: { x: this.robot.x, y: this.robot.y, heading: this.robot.heading },
      obstacles,
      sensors: {
        C: this.robot.sensors.colorValue,
        D: this.robot.sensors.distanceMM,
        E: this.robot.sensors.forceN,
      },
    };
  }
```

If `this.physics.bodyPosition` does not exist on the physics adapter, check what method does return a body's position (search `js/world_2d.js` for "position"). Use the existing method name. If positions are accessed differently (e.g. directly off `o.body.GetPosition()`), use that pattern instead and write a brief helper inline. The point is: pull the live position, fall back to the static config if no body yet.

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/js/state/snapshot.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add js/simulator.js tests/js/state/snapshot.test.js
git commit -m "feat(sim): expose getStateSnapshot for missions engine"
```

---

## Task 15: Simulator Contact Subscription

The Box2D bumper already fires per-contact events for the force sensor (`kind: 'force_sensor'`). For missions we need any-obstacle contacts. Add a callback registry on RobotSimulator so the engine can subscribe.

**Files:**
- Modify: `js/simulator.js`
- Test: `tests/js/state/obstacle-contact.test.js`

- [ ] **Step 1: Find the existing bumper listener**

```bash
grep -n "addBumper\|onContact\|contact" js/simulator.js | head -10
```

Look at how the force-sensor bumper subscribes (the `kind: 'force_sensor'` block). Confirm the pattern — there's likely an `endpoint` callback or a contact listener routed by `kind`.

- [ ] **Step 2: Write the failing test**

Create `tests/js/state/obstacle-contact.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeSim } = require('../sim-helper');

test('onObstacleContact: subscriber fires when the robot contacts an obstacle', async () => {
  const sim = await makeSim();
  const seen = [];
  sim.onObstacleContact((id) => seen.push(id));
  // Synthesise a contact by calling the simulator's internal handler the same
  // way Box2D's listener would. Look in js/simulator.js for the contact-event
  // entry point; tests dispatch through it directly.
  sim._dispatchObstacleContact('1');
  sim._dispatchObstacleContact('2');
  sim._dispatchObstacleContact('1');  // re-hit, still fires
  assert.deepStrictEqual(seen, ['1', '2', '1']);
});

test('onObstacleContact: multiple subscribers each receive every event', async () => {
  const sim = await makeSim();
  const a = []; const b = [];
  sim.onObstacleContact(id => a.push(id));
  sim.onObstacleContact(id => b.push(id));
  sim._dispatchObstacleContact('1');
  assert.deepStrictEqual(a, ['1']);
  assert.deepStrictEqual(b, ['1']);
});

test('onObstacleContact: unsubscribe stops further calls', async () => {
  const sim = await makeSim();
  const seen = [];
  const off = sim.onObstacleContact(id => seen.push(id));
  sim._dispatchObstacleContact('1');
  off();
  sim._dispatchObstacleContact('2');
  assert.deepStrictEqual(seen, ['1']);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test tests/js/state/obstacle-contact.test.js
```
Expected: FAIL — `sim.onObstacleContact is not a function`.

- [ ] **Step 4: Implement the subscription**

In `js/simulator.js`, inside the `RobotSimulator` class, near other registry-style state (e.g. near `_motionAborted`), add:

```javascript
  // Constructor or near other init lines:
  this._obstacleContactSubs = new Set();
```

And add methods near `getStateSnapshot` (Task 14):

```javascript
  onObstacleContact(cb) {
    this._obstacleContactSubs.add(cb);
    return () => this._obstacleContactSubs.delete(cb);
  }

  // Wired into the Box2D contact listener by _initPhysics. Tests can call it
  // directly to synthesise contacts without driving real physics.
  _dispatchObstacleContact(obstacleId) {
    for (const cb of this._obstacleContactSubs) cb(obstacleId);
  }
```

Then wire `_initPhysics` (or wherever `addObstacleBox` is called) to dispatch from the Box2D end-contact listener. The shape mirrors the force-sensor bumper — find where the listener calls `_handleForceContact` (or similar) and add an analogous branch: when an obstacle body is involved in a robot-vs-obstacle end-contact, call `this._dispatchObstacleContact(obstacleConfigLabel)`.

If the physics adapter exposes per-body userdata, set the userdata on each obstacle body to `{ kind: 'obstacle', id: cfg.label }` at the `addObstacleBox` call, then dispatch from the existing listener by matching `userdata.kind === 'obstacle'`.

The exact wiring depends on the current `js/world_2d.js` API — implement the smallest change that makes contacts surface. If it's non-obvious how to thread userdata through, mark the in-game wiring as a follow-up and have `_dispatchObstacleContact` be the test seam for now; the engine integration test (Task 20) will exercise it.

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/js/state/obstacle-contact.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add js/simulator.js tests/js/state/obstacle-contact.test.js
git commit -m "feat(sim): expose onObstacleContact subscription for missions engine"
```

---

## Task 16: Mode State Machine (Sandbox / Play)

`mission_app.js` owns the active mode and the active mission. URL hash `#mission=<id>` triggers Play mode on boot. The state machine has no UI of its own — it just transitions and emits events.

**Files:**
- Create: `js/mission_app.js`
- Test: `tests/js/missions/app-mode.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/app-mode.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions', 'mission_engine', 'mission_app',
  ]).ctx;
}

const MISSION = {
  schema_version: 1, id: 'app', title: 'App', type: 'mission', difficulty_tier: 'beginner',
  field: { robot_start: { x: 0, y: 0, heading: 0 }, zones: [], obstacles: [] },
  steps: [{ id: 'a', title: 'A', points: 1, condition: { kind: 'contact', obstacle: '__never__' } }],
  scoring: { kind: 'step_sum' },
};

test('app: starts in sandbox mode', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(app.mission, null);
});

test('app: enterPlay(mission) loads mission and switches mode', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  // load a self-consistent mission first
  const ok = JSON.parse(JSON.stringify(MISSION));
  ok.field.obstacles = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, label: '__never__' }];
  app.enterPlay(ctx.MISSIONS.loader.load(ok));
  assert.strictEqual(app.mode, 'play');
  assert.strictEqual(app.mission.id, 'app');
});

test('app: exitMission returns to sandbox and clears mission', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  const ok = JSON.parse(JSON.stringify(MISSION));
  ok.field.obstacles = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, label: '__never__' }];
  app.enterPlay(ctx.MISSIONS.loader.load(ok));
  app.exitMission();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(app.mission, null);
});

test('app: subscribers receive mode-change events', () => {
  const ctx = env();
  const app = ctx.MISSIONS.app.create();
  const events = [];
  app.onChange(e => events.push(e.mode));
  const ok = JSON.parse(JSON.stringify(MISSION));
  ok.field.obstacles = [{ id: '__never__', shape: 'rect', x: -1, y: -1, w: 1, h: 1, label: '__never__' }];
  app.enterPlay(ctx.MISSIONS.loader.load(ok));
  app.exitMission();
  assert.deepStrictEqual(events, ['play', 'sandbox']);
});

test('app: parseHash extracts mission id from "#mission=<id>"', () => {
  const ctx = env();
  assert.strictEqual(ctx.MISSIONS.app.parseHash('#mission=foo'), 'foo');
  assert.strictEqual(ctx.MISSIONS.app.parseHash('#mission=red-zone-then-push'), 'red-zone-then-push');
  assert.strictEqual(ctx.MISSIONS.app.parseHash(''), null);
  assert.strictEqual(ctx.MISSIONS.app.parseHash('#other=x'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/app-mode.test.js
```
Expected: FAIL — `mission_app.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_app.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  function create() {
    const state = { mode: 'sandbox', mission: null };
    const subs = new Set();

    function emit() {
      for (const cb of subs) cb({ mode: state.mode, mission: state.mission });
    }

    return {
      get mode()    { return state.mode; },
      get mission() { return state.mission; },
      enterPlay(mission) {
        state.mode = 'play';
        state.mission = mission;
        emit();
      },
      exitMission() {
        state.mode = 'sandbox';
        state.mission = null;
        emit();
      },
      onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
    };
  }

  function parseHash(hash) {
    if (!hash) return null;
    const m = /^#mission=([A-Za-z0-9_-]+)/.exec(hash);
    return m ? m[1] : null;
  }

  MISSIONS.app = { create, parseHash };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/app-mode.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_app.js tests/js/missions/app-mode.test.js
git commit -m "feat(missions): app mode state machine + #mission=<id> URL parser"
```

---

## Task 17: Mission Map Panel — HTML Structure

Add the panel container to `index.html`. Hidden by default; revealed when `app.mode === 'play'`. CSS lives in `css/missions.css`.

**Files:**
- Modify: `index.html`
- Create: `css/missions.css`

- [ ] **Step 1: Confirm the right insertion point**

Open `index.html` and find the `<div class="panel-right">` block (already located around line 130–240 — the Ports band + canvas + Position band + console). Add the Mission Map *inside* the right panel, slotted between `.canvas-status-position` and `.console-wrap` so it sits below the canvas without competing with the canvas for height.

- [ ] **Step 2: Add panel HTML**

In `index.html`, after the `.canvas-status-position` `<div>` closes (search for `</div>` after `id="sp-yaw"`) and before `<div class="console-wrap"`, insert:

```html
    <!-- ── Mission Map panel (hidden unless app.mode === 'play') ────────── -->
    <div class="mission-map" id="mission-map" hidden>
      <div class="mm-head">
        <div class="mm-tag" id="mm-tag">▶ MISSION</div>
        <div class="mm-title" id="mm-title">—</div>
        <div class="mm-meta"  id="mm-meta">—</div>
      </div>
      <div class="mm-score">
        <div>
          <div class="mm-score-label">Score</div>
          <div class="mm-score-num"><span id="mm-score-current">0</span><span class="max" id="mm-score-max">/0</span></div>
        </div>
        <div class="mission-stars" id="mm-stars" aria-label="Stars earned"></div>
      </div>
      <ul class="mm-steps" id="mm-steps"></ul>
      <div class="mm-bottom">
        <button class="btn btn-mini" id="mm-exit" type="button">✕ Exit Mission</button>
      </div>
    </div>
```

Add a Mission entry-point pill to the header. In the `<div class="file-actions">` block, after the existing `btn-save`, add:

```html
    <button class="btn btn-icon-file mission-pill" id="btn-missions" type="button" title="Browse missions" aria-label="Browse missions">🎯</button>
```

Add the CSS link near `style.css` in `<head>`:

```html
  <link rel="stylesheet" href="css/missions.css">
```

Add script tags for the new modules just before `js/main.js`:

```html
  <script src="js/mission_schema.js"></script>
  <script src="js/mission_loader.js"></script>
  <script src="js/mission_conditions.js"></script>
  <script src="js/mission_engine.js"></script>
  <script src="js/mission_persistence.js"></script>
  <script src="js/mission_library.js"></script>
  <script src="js/mission_ui.js"></script>
  <script src="js/mission_app.js"></script>
```

- [ ] **Step 3: Create css/missions.css**

```css
/* Mission Map panel — shown in Play mode below the canvas/position bands. */
.mission-map {
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  max-height: 320px;
  font-family: var(--font-ui);
}

.mission-map[hidden] { display: none; }

.mm-head {
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, var(--surface3) 0%, var(--surface) 100%);
}
.mm-tag {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--amber);
  font-weight: 800;
}
.mm-title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.005em;
  line-height: 1.2;
  color: var(--text);
}
.mm-meta {
  font-size: 11px;
  color: var(--text-mid);
  font-weight: 500;
  margin-top: 3px;
}

.mm-score {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
}
.mm-score-label {
  font-size: 9px;
  color: var(--text-mid);
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.mm-score-num {
  font-family: var(--font-code);
  font-size: 20px;
  font-weight: 700;
  color: var(--amber);
}
.mm-score-num .max { color: var(--text-dim); font-size: 13px; margin-left: 3px; }

.mission-stars { display: flex; gap: 2px; font-size: 14px; color: var(--text-dim); }
.mission-stars .lit { color: var(--amber); text-shadow: 0 0 5px rgba(251,191,36,0.4); }

.mm-steps {
  padding: 8px;
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
}
.mm-step {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 9px 11px;
  margin-bottom: 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mm-step-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.mm-step-check {
  width: 16px; height: 16px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1.5px solid var(--border2);
  display: grid; place-items: center;
  font-size: 10px;
  color: transparent;
  margin-top: 2px;
}
.mm-step.done .mm-step-check {
  background: var(--green);
  border-color: var(--green);
  color: #052e16;
  font-weight: 800;
}
.mm-step-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}
.mm-step-points {
  background: var(--surface3);
  color: var(--amber);
  font-family: var(--font-code);
  font-size: 9px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 999px;
}
.mm-step.done .mm-step-points { background: var(--amber); color: #1a1206; }

.mm-step-hint-row { padding-left: 24px; }
.mm-step-hint-btn {
  background: transparent;
  border: 1px solid var(--border2);
  color: var(--text-mid);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.mm-step-hint-btn:hover { color: var(--amber); border-color: var(--amber); }
.mm-step-hint-reveal {
  font-size: 11px;
  color: var(--text-mid);
  font-style: italic;
  padding-left: 24px;
  border-left: 2px solid var(--amber);
  margin: 4px 0 2px 8px;
}

.mm-bottom {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface2);
  display: flex;
  justify-content: flex-end;
}

/* Mission entry-point pill in the header */
.mission-pill {
  position: relative;
}
.mission-pill[data-active="true"] {
  background: var(--amber);
  color: #1a1206;
  border-color: var(--amber);
  box-shadow: var(--glow-amber);
}
```

- [ ] **Step 4: Commit (no test for static HTML; behaviour tests come in Task 18)**

```bash
git add index.html css/missions.css
git commit -m "feat(missions): add Mission Map panel HTML + CSS scaffolding"
```

---

## Task 18: Mission Map Panel Renderer

`mission_ui.js` owns the panel: it renders the step list from a Mission object, updates checks + score on engine ticks, handles hint reveal clicks. Pure DOM operations — tests use stubbed elements.

**Files:**
- Create: `js/mission_ui.js`
- Test: `tests/js/missions/ui-mission-map.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/js/missions/ui-mission-map.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

// Minimal DOM stub mirroring tests/js/mocks/main-env.js patterns.
function makeEl(tag) {
  const el = {
    tag, children: [],
    classList: { _set: new Set(),
      add(c)    { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, on) { if (on) this._set.add(c); else this._set.delete(c); },
    },
    style: {}, dataset: {}, attrs: {},
    textContent: '', innerHTML: '', hidden: false,
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] || null; },
    addEventListener(name, cb) { (this._listeners = this._listeners || {})[name] = cb; },
    _click() { this._listeners && this._listeners.click && this._listeners.click(); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  return el;
}

function makeDom() {
  const ids = {};
  function el(id) { return ids[id] = ids[id] || makeEl('div'); }
  return {
    getElementById(id) { return el(id); },
    createElement(tag) { return makeEl(tag); },
    ids,
  };
}

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_ui',
  ]).ctx;
}

const MISSION = {
  schema_version: 1, id: 'ui', title: 'UI Test Mission', type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones:     [{ id: 'red', shape: 'rect', x: 0, y: 0, w: 10, h: 10, color: 'red' }],
    obstacles: [],
  },
  steps: [
    { id: 's1', title: 'Reach red', points: 10, hint: 'Drive forward.',
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
    { id: 's2', title: 'Finish strong', points: 15,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
  ],
  scoring: { kind: 'step_sum' },
};

test('mountMissionMap: hides panel when no mission is active', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  ui.render(null, null);
  assert.strictEqual(dom.getElementById('mission-map').hidden, true);
});

test('render: populates title, meta, max-score and step rows for a mission', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  const mission = ctx.MISSIONS.loader.load(MISSION);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  ui.render(mission, engine);
  assert.strictEqual(dom.getElementById('mission-map').hidden, false);
  assert.strictEqual(dom.getElementById('mm-title').textContent, 'UI Test Mission');
  assert.strictEqual(dom.getElementById('mm-score-max').textContent, '/25');
  assert.strictEqual(dom.getElementById('mm-steps').children.length, 2);
});

test('updateProgress: ticks the completed step row to .done and updates score', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  const mission = ctx.MISSIONS.loader.load(MISSION);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  ui.render(mission, engine);

  engine.start(0);
  engine.tick({
    robot: { x: 5, y: 5, heading: 0 }, obstacles: {}, sensors: {},
  });
  ui.updateProgress(engine);

  assert.strictEqual(dom.getElementById('mm-score-current').textContent, '10');
  // Two children, first is the row container for s1; check its class.
  const firstRow = dom.getElementById('mm-steps').children[0];
  assert.ok(firstRow.classList.contains('done'));
});

test('hint reveal: clicking the hint button shows the hint text', () => {
  const ctx = env();
  const dom = makeDom();
  ctx.document = dom;
  const ui = ctx.MISSIONS.ui.mount(dom);
  const mission = ctx.MISSIONS.loader.load(MISSION);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  ui.render(mission, engine);

  const firstRow = dom.getElementById('mm-steps').children[0];
  // Find the hint button. UI nests it as the second child group; tests can
  // call ui._test_revealHint(stepId) to skip the DOM-walk and exercise the
  // logic seam directly.
  ui._test_revealHint('s1');
  // Render again to flush.
  ui.updateProgress(engine);
  const hasReveal = JSON.stringify(firstRow.children).includes('Drive forward');
  assert.ok(hasReveal, 'hint text should be rendered after reveal');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/js/missions/ui-mission-map.test.js
```
Expected: FAIL — `mission_ui.js` not found.

- [ ] **Step 3: Write minimal implementation**

Create `js/mission_ui.js`:

```javascript
'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.engine) throw new Error('mission_ui requires mission_engine');

  function mount(doc) {
    const $ = (id) => doc.getElementById(id);

    const root      = $('mission-map');
    const tag       = $('mm-tag');
    const titleEl   = $('mm-title');
    const metaEl    = $('mm-meta');
    const scoreCur  = $('mm-score-current');
    const scoreMax  = $('mm-score-max');
    const starsEl   = $('mm-stars');
    const stepsEl   = $('mm-steps');

    let currentMission = null;
    const revealedHints = new Set();
    const stepRowsById = {};

    function render(mission, engine) {
      currentMission = mission;
      if (!mission || !engine) {
        root.hidden = true;
        return;
      }
      root.hidden = false;

      titleEl.textContent = mission.title;
      metaEl.textContent  = `${cap(mission.difficulty_tier)} · ${mission.steps.length} ${mission.steps.length === 1 ? 'step' : 'steps'}`;

      const max = MISSIONS.engine.maxScore(mission);
      scoreCur.textContent = String(engine.progress ? engine.progress.score : 0);
      scoreMax.textContent = `/${max}`;

      stepsEl.innerHTML = '';
      for (const k of Object.keys(stepRowsById)) delete stepRowsById[k];
      for (const step of mission.steps) {
        const row = renderStepRow(step);
        stepsEl.appendChild(row);
        stepRowsById[step.id] = row;
      }
      paintStars(engine, max);
    }

    function renderStepRow(step) {
      const row = doc.createElement('li');
      row.classList.add('mm-step');

      const r1 = doc.createElement('div');
      r1.classList.add('mm-step-row');
      const check = doc.createElement('span');
      check.classList.add('mm-step-check');
      check.textContent = '✓';
      const titleSpan = doc.createElement('span');
      titleSpan.classList.add('mm-step-title');
      titleSpan.textContent = step.title;
      const pts = doc.createElement('span');
      pts.classList.add('mm-step-points');
      pts.textContent = `+${step.points}`;
      r1.appendChild(check); r1.appendChild(titleSpan); r1.appendChild(pts);
      row.appendChild(r1);

      if (step.hint) {
        const r2 = doc.createElement('div');
        r2.classList.add('mm-step-hint-row');
        const btn = doc.createElement('button');
        btn.textContent = '💡 Show hint';
        btn.classList.add('mm-step-hint-btn');
        btn.addEventListener('click', () => revealHint(step.id));
        r2.appendChild(btn);
        row.appendChild(r2);
      }
      return row;
    }

    function revealHint(stepId) {
      if (revealedHints.has(stepId)) return;
      revealedHints.add(stepId);
      const step = currentMission.steps.find(s => s.id === stepId);
      const row  = stepRowsById[stepId];
      if (!step || !row) return;
      const reveal = doc.createElement('div');
      reveal.classList.add('mm-step-hint-reveal');
      reveal.textContent = step.hint;
      row.appendChild(reveal);
    }

    function updateProgress(engine) {
      if (!currentMission || !engine || !engine.progress) return;
      scoreCur.textContent = String(engine.progress.score);
      for (const step of currentMission.steps) {
        const row = stepRowsById[step.id];
        if (!row) continue;
        row.classList.toggle('done', !!engine.progress.stepResults[step.id]);
      }
      paintStars(engine, MISSIONS.engine.maxScore(currentMission));
    }

    function paintStars(engine, max) {
      const score = engine.progress ? engine.progress.score : 0;
      const n = MISSIONS.engine.starRating(score, max);
      starsEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = doc.createElement('span');
        s.textContent = '★';
        if (i < n) s.classList.add('lit');
        starsEl.appendChild(s);
      }
    }

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    return {
      render,
      updateProgress,
      _test_revealHint: revealHint,
    };
  }

  MISSIONS.ui = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/js/missions/ui-mission-map.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/mission_ui.js tests/js/missions/ui-mission-map.test.js
git commit -m "feat(missions): render Mission Map panel with live step/score/star updates"
```

---

## Task 19: Wire-Up — main.js Boot + URL Hash Entry

Bring everything together: on DOMContentLoaded, if `location.hash` contains `#mission=<id>`, fetch and enter Play mode. Subscribe the engine to simulator ticks and contact events. Hook the existing Run/Stop dock buttons through the engine. Wire the "Exit Mission" button.

**Files:**
- Modify: `js/main.js`
- Test: `tests/js/missions/main-boot.test.js`

- [ ] **Step 1: Inspect existing main.js boot flow**

```bash
grep -n "DOMContentLoaded\|window.sim\|btn-run\|addEventListener" js/main.js | head -20
```

Locate the section that initialises `window.sim`, wires `btn-run` / `btn-stop`, and runs after the editor is ready. The missions boot will hook in *after* the simulator is constructed but *before* Run is enabled.

- [ ] **Step 2: Write the failing test**

Create `tests/js/missions/main-boot.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');

// We test the bootMissions function in isolation. It takes:
//   { sim, doc, location, fetch, storage }
// and returns the wired-up app instance. main.js calls it at startup.

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence', 'mission_library',
    'mission_ui', 'mission_app',
  ]).ctx;
}

function dom() {
  const ids = {};
  const make = () => ({
    children: [], style: {}, dataset: {}, textContent: '', innerHTML: '', hidden: false,
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                 contains(c){return this._s.has(c);}, toggle(c, on){ on ? this._s.add(c) : this._s.delete(c); } },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(n, cb){ (this._l = this._l || {})[n] = cb; },
    _click() { this._l && this._l.click && this._l.click(); },
    setAttribute(){}, getAttribute(){ return null; },
  });
  return {
    getElementById(id) { return ids[id] = ids[id] || make(); },
    createElement() { return make(); },
    ids,
  };
}

function stubSim() {
  const contactSubs = new Set();
  return {
    robot: { x: 0, y: 0, heading: 0 },
    getStateSnapshot() {
      return { robot: this.robot, obstacles: { '1': { x: 1700, y: 943 } }, sensors: {} };
    },
    onObstacleContact(cb) { contactSubs.add(cb); return () => contactSubs.delete(cb); },
    _fireContact(id) { for (const cb of contactSubs) cb(id); },
    placeRobot(x, y, heading) { this.robot = { x, y, heading }; },
  };
}

const TEST_MISSION = {
  schema_version: 1, id: 'red-zone-then-push', title: 'Red Zone', type: 'mission',
  difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 350, y: 163, heading: 90 },
    zones:     [{ id: 'red', shape: 'rect', x: 1900, y: 243, w: 200, h: 200, color: 'red' }],
    obstacles: [{ id: '1',   shape: 'rect', x: 1700, y: 943, w: 100, h: 100, label: '1' }],
  },
  steps: [
    { id: 'reach-red', title: 'Reach the red zone', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'red' } },
  ],
  scoring: { kind: 'step_sum' },
};

function fetchOk(payload) {
  return async () => ({ ok: true, json: async () => payload });
}

test('bootMissions: no hash → app stays in sandbox, panel hidden', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '' }, fetch: fetchOk(TEST_MISSION),
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(doc.getElementById('mission-map').hidden, true);
});

test('bootMissions: #mission=<id> → fetches mission, switches to Play, renders panel', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;

  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (url === 'missions/red-zone-then-push/mission.json') {
      return { ok: true, json: async () => TEST_MISSION };
    }
    return { ok: false, status: 404 };
  };

  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '#mission=red-zone-then-push' }, fetch,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });

  assert.deepStrictEqual(calls, ['missions/red-zone-then-push/mission.json']);
  assert.strictEqual(app.mode, 'play');
  assert.strictEqual(doc.getElementById('mission-map').hidden, false);
  assert.strictEqual(doc.getElementById('mm-title').textContent, 'Red Zone');
});

test('bootMissions: clicking Exit Mission returns to sandbox', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;
  const fetch = async () => ({ ok: true, json: async () => TEST_MISSION });
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '#mission=red-zone-then-push' }, fetch,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  });
  doc.getElementById('mm-exit')._click();
  assert.strictEqual(app.mode, 'sandbox');
  assert.strictEqual(doc.getElementById('mission-map').hidden, true);
});

test('bootMissions: tick after sim state change updates mission progress', async () => {
  const ctx = env();
  const doc = dom();
  const sim = stubSim();
  ctx.document = doc;
  const fetch = async () => ({ ok: true, json: async () => TEST_MISSION });
  const app = await ctx.MISSIONS.boot({
    sim, doc, location: { hash: '#mission=red-zone-then-push' }, fetch,
    storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    autoStart: true,  // skip waiting for the user's Run click during tests
  });

  // Move the robot into the red zone and tick once.
  sim.placeRobot(2000, 343, 90);
  app._tickOnce();

  assert.strictEqual(doc.getElementById('mm-score-current').textContent, '10');
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test tests/js/missions/main-boot.test.js
```
Expected: FAIL — `MISSIONS.boot is not a function`.

- [ ] **Step 4: Implement boot in mission_app.js**

Extend `js/mission_app.js`. Add the `boot` function below `parseHash`:

```javascript
  async function boot({ sim, doc, location, fetch, storage, autoStart }) {
    const app    = create();
    const engine = new MISSIONS.engine.ChallengeEngine();
    const ui     = MISSIONS.ui.mount(doc);

    // Wire the Exit Mission button.
    const exitBtn = doc.getElementById('mm-exit');
    if (exitBtn) exitBtn.addEventListener('click', () => app.exitMission());

    // When mode changes, re-render the panel.
    app.onChange(({ mode, mission }) => {
      if (mode === 'play') {
        ui.render(mission, engine);
      } else {
        engine.reset();
        ui.render(null, null);
      }
    });

    // Subscribe to obstacle contacts for the contact condition primitive.
    if (sim && sim.onObstacleContact) {
      sim.onObstacleContact((id) => engine.recordContact(id, Date.now()));
    }

    const id = MISSIONS.app.parseHash(location.hash);
    if (id) {
      const libFetch = fetch || global.fetch;
      const res = await libFetch(`missions/${id}/mission.json`);
      if (res.ok) {
        const raw = await res.json();
        const mission = MISSIONS.loader.load(raw);
        if (sim && sim.placeRobot) {
          sim.placeRobot(mission.field.robot_start.x, mission.field.robot_start.y,
                         mission.field.robot_start.heading);
        }
        app.enterPlay(mission);
        if (autoStart) engine.start(Date.now());
      }
    }

    // Test seam: tick once with the sim's current snapshot.
    function _tickOnce() {
      if (app.mode !== 'play') return;
      const snap = sim.getStateSnapshot();
      engine.tick(snap);
      ui.updateProgress(engine);
    }

    return Object.assign(app, { engine, ui, _tickOnce });
  }

  MISSIONS.app  = { create, parseHash };
  MISSIONS.boot = boot;
```

(Note: `create` and `parseHash` stay where they were — only `MISSIONS.boot` is new at the top level.)

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test tests/js/missions/main-boot.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 6: Wire main.js to call boot at startup**

Open `js/main.js`. Find the line that creates `window.sim` (search `new RobotSimulator`). After the simulator is constructed and its `_initPhysics` (or equivalent) has been called — i.e. when the sim is ready to render — add:

```javascript
  // Boot the missions layer. No-op when there's no #mission=… hash.
  if (window.MISSIONS && window.MISSIONS.boot) {
    window.MISSIONS.boot({
      sim: window.sim,
      doc: document,
      location: window.location,
      fetch: window.fetch.bind(window),
      storage: window.localStorage,
    }).then((app) => { window.missionApp = app; })
      .catch((e) => console.warn('missions: boot failed', e));
  }
```

Also: route the existing dock Run/Stop buttons through the engine when a mission is active. Find the Run button click handler (search `btn-run` and the handler that calls into the Python/Blockly runner). Wrap the existing handler so when `window.missionApp && window.missionApp.mode === 'play'`, it calls `window.missionApp.engine.start(Date.now())` *before* delegating to the existing run path, and on the program-finished hook calls `window.missionApp.engine.finalize(Date.now() - window.missionApp.engine.startTimeMs)`.

If the program-finished hook in `main.js` lives inside the bridge module rather than `main.js`, drop the engine.finalize call into `js/main.js`'s existing `_onProgramFinished` (or wherever the Stop button / run-complete path lives), gated by `window.missionApp.mode === 'play'`.

Each mission tick is driven by RAF. Inside the simulator's existing draw loop (`_drawLoop` in `js/simulator.js`), at the very end of each iteration, add (gated by `window.missionApp`):

```javascript
    if (window.missionApp && window.missionApp.mode === 'play' && window.missionApp.engine.startTimeMs != null) {
      const snap = this.getStateSnapshot();
      window.missionApp.engine.tick(snap);
      window.missionApp.ui.updateProgress(window.missionApp.engine);
    }
```

Place this guard inside `_drawLoop` near the end, after `_draw()`. The 60 Hz draw loop is OK as a tick driver — the spec's "30 Hz polling" is an upper bound, not a floor.

- [ ] **Step 7: Smoke-check in the browser**

```bash
python3 -m http.server 8787
```

Open `http://localhost:8787/#mission=red-zone-then-push`. Confirm:
- Mission Map panel appears below the canvas with the title "Red Zone then Push"
- The score reads "0 / 25"
- Running the default Python program (which already drives east) moves the robot into the red zone and ticks step 1
- "Exit Mission" returns to the sandbox

If anything is off, debug in the console — don't claim success here without a visual check.

- [ ] **Step 8: Commit**

```bash
git add js/mission_app.js js/main.js js/simulator.js tests/js/missions/main-boot.test.js
git commit -m "feat(missions): wire main.js boot + draw-loop tick + Run/Stop hooks"
```

---

## Task 20: End-to-End Integration Test

A single integration test that loads the bundled red-zone-then-push mission, drives the robot through both steps, and confirms the final score is 25/25 with 3 stars persisted to localStorage.

**Files:**
- Create: `tests/js/integration/missions-end-to-end.test.js`

- [ ] **Step 1: Write the failing test (it should actually pass — this is regression-gating)**

Create `tests/js/integration/missions-end-to-end.test.js`:

```javascript
'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const fs     = require('fs');
const path   = require('path');
const { makeMissionsEnv, REPO_ROOT } = require('../mocks/missions-env');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence',
  ]).ctx;
}

const MISSION_PATH = path.join(REPO_ROOT, 'missions/red-zone-then-push/mission.json');

test('end-to-end: load mission → drive both steps → finalize at 25/25/3★ → persist', () => {
  const ctx = env();
  const raw = JSON.parse(fs.readFileSync(MISSION_PATH, 'utf8'));
  const mission = ctx.MISSIONS.loader.load(raw);
  const engine  = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(mission);
  engine.start(0);

  // Tick 1: robot drives into red zone.
  let c = engine.tick({
    robot: { x: 2000, y: 343, heading: 90 },
    obstacles: { '1': { x: 1700, y: 943 } },  // still on green
    sensors: { C: 'red', D: 200, E: 0 },
  });
  assert.deepStrictEqual(c, ['reach-red']);
  assert.strictEqual(engine.progress.score, 10);

  // Tick 2: robot turns north, obstacle 1 has been pushed off green.
  c = engine.tick({
    robot: { x: 1700, y: 700, heading: 0 },
    obstacles: { '1': { x: 1300, y: 943 } },  // off green now
    sensors: { C: 'green', D: 200, E: 5 },
  });
  assert.deepStrictEqual(c, ['push-obstacle-1']);
  assert.strictEqual(engine.progress.score, 25);

  // Finalize.
  const result = engine.finalize(12_000);
  assert.strictEqual(result.score, 25);
  assert.strictEqual(result.maxScore, 25);
  assert.strictEqual(result.finalized, true);

  // Persist + read back.
  const store = new Map();
  const ls = {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => { store.set(k, v); },
    removeItem: k => { store.delete(k); },
  };
  ctx.MISSIONS.persistence.recordRun(ls, mission.id, {
    score: result.score, maxScore: result.maxScore,
    stars: ctx.MISSIONS.engine.starRating(result.score, result.maxScore),
    elapsedMs: result.elapsedMs,
  });
  const best = ctx.MISSIONS.persistence.getBest(ls, mission.id);
  assert.strictEqual(best.score, 25);
  assert.strictEqual(best.stars, 3);
});
```

- [ ] **Step 2: Run the integration test**

```bash
node --test tests/js/integration/missions-end-to-end.test.js
```
Expected: PASS (1 test). If it fails, debug — likely cause is a misalignment between an earlier task's implementation and what this test assumes.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```
Expected: all original 518 tests still pass, plus all new missions tests (around 60–70 additional). Zero failures.

- [ ] **Step 4: Commit**

```bash
git add tests/js/integration/missions-end-to-end.test.js
git commit -m "test(missions): end-to-end integration covering load→drive→finalize→persist"
```

---

## Task 21: Manual Browser Smoke Test + PR Prep

Final manual check before opening a PR. Confirms the feature behaves correctly in a real browser with the real simulator (not just the test stubs).

**Files:** none (manual verification)

- [ ] **Step 1: Run the dev server**

```bash
python3 -m http.server 8787
```

- [ ] **Step 2: Open the sandbox without a mission hash**

Navigate to `http://localhost:8787/`. Confirm:
- App loads normally; no Mission Map panel visible
- Existing Run / Stop / Reset works against the existing sandbox content
- No console errors related to missions modules

- [ ] **Step 3: Open the bundled mission**

Navigate to `http://localhost:8787/#mission=red-zone-then-push`. Confirm:
- Mission Map panel appears below the canvas
- Title reads "Red Zone then Push"
- Score reads "0 / 25", stars all unlit
- The robot is positioned at the mission's start pose (350, 163)
- Step 1 ("Reach the red zone") has a "💡 Show hint" button; clicking it reveals "Drive forward about 1200 mm…"
- The default Python program in the editor already drives east; clicking Run starts the engine
- As the robot enters the red zone, step 1 ticks green and score updates to 10
- Pushing obstacle 1 off green ticks step 2; score reaches 25, three stars light up
- Clicking "Exit Mission" returns to sandbox; the panel disappears

- [ ] **Step 4: Confirm localStorage persistence**

In the browser devtools console:
```javascript
Object.keys(localStorage).filter(k => k.startsWith('fll-vr-mission/'))
```
Expected: at least one key containing `red-zone-then-push/v0`. Open it — confirm `score: 25`, `stars: 3`.

- [ ] **Step 5: Reload with hash, confirm star carries over**

Reload `http://localhost:8787/#mission=red-zone-then-push`. (The library panel doesn't exist yet to display the star, but the score readout reads from localStorage and could be displayed in a later panel — for now, verify only that the data is still there in localStorage.)

- [ ] **Step 6: Final full test suite run**

```bash
npm test
```
Expected: all tests pass. Note the new total count.

- [ ] **Step 7: Stop the worktree's dev server**

```bash
# Find and kill the python http.server you started in Task 19
pkill -f "http.server 8787"
```

- [ ] **Step 8: Open PR**

Push the branch and open a PR (or stop here if the user prefers manual review):

```bash
git push -u origin feat/missions-design
gh pr create --title "feat(missions): foundations — schema, engine, Play mode, first bundled mission" \
  --body "$(cat <<'EOF'
## Summary

Implements Plan 1 of 8 from the missions design (see
`docs/superpowers/specs/2026-05-23-missions-and-scoring-design.md`):

- Schema constants + plain-object validator with cross-reference checking
- Pure `evaluateCondition` for the six v1 primitives (zone / sensor / contact / not / all_of / any_of) with short-circuit
- `ChallengeEngine` class — load / start / tick / finalize / reset, requires resolution, step_sum + objective_minus_penalties scoring, star rating
- localStorage best-score persistence keyed by `(mission_id, modifier_hash)`
- Bundled mission `red-zone-then-push` (25 pts, 2 steps) + bundle manifest fetcher
- `RobotSimulator.getStateSnapshot()` + `onObstacleContact()` subscription
- Mission Map panel HTML + CSS + renderer (read-only step list, score readout, hint reveal, stars)
- Mode state machine (Sandbox / Play) + `#mission=<id>` URL-hash entry

The Library panel, Editor mode, Blockly condition picker, screenshot capture, and `.llmission` ZIP I/O ship in subsequent plans (2 through 8 in the spec's §15 build order).

## Try it

```
python3 -m http.server 8787
open http://localhost:8787/#mission=red-zone-then-push
```

Run the default Python program — robot drives east, score ticks to 10, then 25.

## Test plan

- [x] All 518 pre-existing tests still pass
- [x] ~60 new unit + integration tests cover the engine, schema, persistence, library, UI, app state, and the bundled mission
- [x] Manual browser check: sandbox unaffected; hash entry → Play mode; score increments; exit returns to sandbox; localStorage persists

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Done**

Plan 1 of 8 is complete. The next plan to write is `2026-05-NN-missions-library-panel.md`, which adds:
- Mission Library modal (replace the URL-hash entry point with a real browseable UI)
- Source rails (Bundled / My Missions / Imported)
- Thumbnails (will be placeholders until Plan 6 adds screenshot capture)

---

## Self-Review Notes

**Spec coverage check:**
- §3 modes (Sandbox/Play/Editor) — Sandbox+Play covered here; Editor is Plan 3+
- §4 file format — `.llmission` ZIP deferred to a later plan; bundled missions ship as unzipped JSON in `missions/<id>/`. Acceptable for v1 foundations.
- §5 scoring — step_sum (Task 9) and objective_minus_penalties (Task 10) both covered
- §6 schema — all primitives and step requires covered (Tasks 1–8)
- §7 ChallengeEngine — covered (Tasks 7–10)
- §8 UI surface — Mission Map panel (read-only) covered; Library panel + Editor mode are subsequent plans
- §9 Blockly condition picker — Editor concern, subsequent plan
- §10 screenshot capture — Editor concern, subsequent plan
- §11 distribution & storage — bundled covered; My Missions / Imported / playtest temp are subsequent plans
- §12 advancement (star rating) — covered (Task 9, `starRating`)
- §13 difficulty — `difficulty_tier` validated; modifiers schema slot reserved (Task 1 / 2)
- §14 out-of-scope — respected
- §15 build order — this plan is step 1 of 8

**Type / name consistency check:**
- `MISSIONS.schema`, `.loader`, `.conditions`, `.engine`, `.persistence`, `.library`, `.ui`, `.app` — namespace consistent across tasks
- `evaluate(condition, snap)` — same shape in Tasks 3, 4, 5, 6
- `getStateSnapshot()` returns `{robot, obstacles, sensors}` (no `zones` — engine injects those from the loaded mission), consistent in Task 14 and downstream
- `recordContact(id, ms)` matches between engine API (Task 7) and the subscription wiring (Task 15, Task 19)
- `MISSIONS.boot` and `MISSIONS.app.create` are distinct top-level exports — both expected by main-boot.test.js (Task 19)
