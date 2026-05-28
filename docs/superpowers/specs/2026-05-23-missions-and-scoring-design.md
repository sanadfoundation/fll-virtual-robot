# Missions, Challenges & Obstacle Courses — Design

**Status:** Draft for review
**Issue:** [#44](https://github.com/sanadfoundation/fll-virtual-robot/issues/44)
**Cross-links:** [#33](https://github.com/sanadfoundation/fll-virtual-robot/issues/33) (real FLL layout), [#45](https://github.com/sanadfoundation/fll-virtual-robot/issues/45) (random noise events)

## 1. Goal

Add a content layer to the FLL Virtual Robot that turns the existing sandbox into a structured challenge platform. Three challenge types share one schema, one runtime, and one authoring surface:

- **Mission** — multi-step objectives with hints, point values, progress feedback. Scaffolds learning.
- **Obstacle course** — single navigation objective from start to goal. Scored on completion, collisions, and time budget.
- **Sandbox** — current default. No objectives, no scoring. Unchanged.

The system must let an FLL coach, teacher, or curious student **build a mission visually, save it as a file, share it, and have someone else load and play it** — without ever editing JSON by hand.

## 2. Non-goals

- No backend. No accounts. No remote leaderboards.
- No code-line success checks. Coupling missions to a single solution path is pedagogically harmful.
- No parametric / random obstacle-course generation in v1 (issue #44 stretch goal — defer).
- No URL-hash sharing in v1. File download / upload is the only sharing path.
- No `.llmission` extension to `.llsp3`. Missions are a separate file type with their own bundle structure.
- No code-annotated authoring path (`# @step ...`). The visual editor is the sole authoring surface in v1.

## 3. Three modes

Mode is a first-class concept in the app shell, surfaced in the top toolbar and reflected in the layout.

| Mode | Default | Field editable | Scoring active | Mission Map panel | Toolbar |
|---|---|---|---|---|---|
| **Sandbox** | yes | no | no | hidden | Run / Stop / units / save-load `.llsp3` |
| **Play** | when a mission is loaded | no, locked to mission's start state | yes | visible (read-only step list) | Run / Stop / units / Exit Mission |
| **Editor** | when "+ New Mission" or "Edit" is clicked | yes, drag handles on canvas | no | visible (editable step list) | Save / Load / Playtest / Exit Editor |

Entry points to non-default modes:

- A **"Missions"** button in the top toolbar opens the **Library panel**.
- Library panel → click a mission → **Play mode**.
- Library panel → "+ New" or "Edit" → **Editor mode**.
- Editor → "Playtest" → **Play mode** (with mission loaded from a temp save).
- Any mode → "Exit" or close → back to Sandbox.

Mode is an in-memory flag. No URL routing.

## 4. Mission file format

A `.llmission` bundle is a JSZip archive (mirrors `.llsp3`):

```
mission.llmission
├── mission.json       — schema-driven mission definition (see §6)
├── screenshot.png     — auto-captured thumbnail (~600×290, ~30–50 KB)
├── solution.py        — optional reference solution
└── README.md          — optional author notes shown in the library
```

Only `mission.json` is required. The other files are optional metadata.

Mission files are produced exclusively by the editor's Save action. Authors never write or edit JSON by hand. The file is human-readable so it can be peeked at, but the editor is the sole supported authoring path.

## 5. Scoring

### 5.1 Mission scoring

`score = sum of points from completed steps`. Maximum = sum of all step point values.

- A step's points are awarded the first time its condition fires true during a run. Steps don't un-complete.
- Step ordering in the file is for display; **completion order is not constrained**. A mission with steps A, B, C can be solved in any order unless explicit `requires:` dependencies are declared on a step.
- The score is computed and frozen when the program ends — either via `runloop.run()` returning, the user clicking Stop, or the program raising. There is no "submit" button.

### 5.2 Obstacle-course scoring

`score = max(0, base − collision_penalty − time_penalty)` where `base = 100` if the robot enters the goal zone, else `0`.

- `collision_penalty = min(collision_cap, contacts × per_contact)`. Defaults: `per_contact = 5`, `cap = 50`. "Contact" means first impulse with an obstacle in this run; contacts with the same obstacle while still touching it don't re-charge.
- `time_penalty = max(0, ceil(elapsed_s − target_time_s) × per_second_over)`. Default `per_second_over = 1`; `target_time_s` is author-set per challenge (no default — must be configured).

Both penalty mechanisms can be disabled per challenge.

### 5.3 Display

The score readout shows the **components that fed the score**, not just the total:

```
Score: 75 / 100
  Reach red zone     ✓ +10
  Push obstacle 1    ✓ +15
  ...
  Collisions (3)        −15
  Time over (2s)        −2
```

Kids should be able to see *why* their score is what it is. This is a teaching tool first.

## 6. Mission schema

```json
{
  "schema_version": 1,
  "id": "red-zone-then-push",
  "title": "Red Zone then Push",
  "description": "Drive to the red zone, then knock obstacle 1 off the green zone.",
  "author": "Sanad Foundation",
  "type": "mission",                  // "mission" | "obstacle_course"
  "difficulty_tier": "beginner",      // "beginner" | "intermediate" | "advanced"

  "field": {
    "robot_start": { "x": 350, "y": 163, "heading": 90 },
    "zones": [
      { "id": "red",   "shape": "rect", "x": 1900, "y": 243, "w": 200, "h": 200, "color": "red"    },
      { "id": "green", "shape": "rect", "x": 1600, "y": 843, "w": 200, "h": 200, "color": "green"  }
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
      "hint": "Drive forward about 1200 mm.",
      "condition": { "kind": "zone", "subject": "robot", "zone": "red" }
    },
    {
      "id": "push-obstacle-1",
      "title": "Push obstacle 1 off the green zone",
      "points": 15,
      "hint": "Turn right, then drive forward.",
      "requires": ["reach-red"],
      "condition": {
        "kind": "not",
        "of": { "kind": "zone", "subject": "obstacle:1", "zone": "green" }
      }
    }
  ],

  "scoring": {
    "kind": "step_sum"
    // For obstacle_course type:
    // "kind": "objective_minus_penalties",
    // "goal_zone": "finish",
    // "collisions": { "per_contact": 5, "cap": 50 },
    // "time_budget_s": 30, "per_second_over": 1
  },

  "modifiers": {
    // Schema slot reserved for #45. v1 ships with this empty.
    "available": [],
    "defaults": {}
  }
}
```

### 6.1 Condition primitives (v1)

| `kind` | Fields | Fires true when |
|---|---|---|
| `zone` | `subject` (`"robot"` or `"obstacle:<id>"`), `zone` (zone id) | subject's centre is inside the named zone |
| `sensor` | `port`, `op` (`"=="`/`"!="`/`"<"`/`"<="`/`">"`/`">="`), `value` | sensor on `port` returns a value satisfying `op value` |
| `contact` | `obstacle` (obstacle id) | the robot has contacted the named obstacle at least once this run |
| `all_of` | `of[]` | every child condition is true |
| `any_of` | `of[]` | at least one child condition is true |
| `not` | `of` | the child condition is false |

Sensor types and value domains are inferred from the existing `SPIKE_API` table in `js/monaco_config.js` (color names, force in Newtons, distance in mm). The condition picker UI offers the right operator and value control per sensor type.

### 6.2 Step dependencies

`requires: [step_id, ...]` — a step's condition is not evaluated until all required steps have completed. This handles "do X *then* Y" without coupling to code structure.

## 7. Runtime — the ChallengeEngine

A new module `js/challenge_engine.js` owns mission state during Play mode.

**Lifecycle:**

```
load(mission)        → applies field setup, resets robot to mission start pose
start()              → begins evaluating conditions; called when user clicks Run
tick()               → polled at ~30 Hz (decoupled from physics 60 Hz). For each
                       unsatisfied step whose requires are met, evaluate its
                       condition. On true, mark the step complete and emit
                       `onStepComplete(stepId)`.
finalize()           → called when the program ends or user clicks Stop. Computes
                       the final score, writes a result to localStorage, emits
                       `onScored(result)`.
reset()              → clears progress, restores field, robot back to start.
```

**Condition evaluation** is pure: given `{robot, sensors, obstacles, contacts}`, return boolean. The engine subscribes to:
- the existing simulator's per-frame state (`robot.x/y/heading`, `robot.sensors`)
- Box2D contact events (already exposed via the bumper listener in `js/simulator.js:311`)
- a per-run map of `firstContact[obstacleId] → timestamp` for `contact` conditions and obstacle-course collision counting.

**Zone hit-testing** is a point-in-rect / point-in-circle check using the same math y-up convention the simulator uses internally. Already cheap.

**Obstacle position** uses the live Box2D body position, converted to math y-up.

## 8. UI surface

### 8.1 Library panel

Opened from the top-bar "Missions" button. Modal-ish overlay (not a separate route).

- Grid of mission cards. Each card: `screenshot.png` thumbnail, title, difficulty badge, "Play" / "Edit" buttons.
- Left rail: sources — **Bundled**, **My Missions** (localStorage), **Imported** (loaded from file).
- Top-right: "+ New Mission" → Editor mode with an empty mission.
- Top-right: "Load from file…" → file picker → drops mission into Imported list, opens Play mode.

### 8.2 Play mode

- Existing layout, with a **Mission Map panel** on the right side replacing or beside the hub panel (TBD during implementation — current right column already holds the hub; Mission Map likely slots above or below it).
- Mission Map shows: title, description (collapsible), step list with checkmarks, current score readout. Read-only.
- Hint reveal: each step has a "Show hint" button (one-click reveal, no scoring penalty in v1).
- Exit Mission button in toolbar returns to Sandbox.

### 8.3 Editor mode

**Full interface replacement.** No surprises — the user is clearly in a different mode.

- **Toolbar:** Save / Load / Playtest / Exit Editor. No Run button (use Playtest).
- **Main canvas:** field editor. Each obstacle/zone has drag handles for position; corner handles for size; click to select; Delete key removes. A "+" toolbar over the canvas adds new obstacles, zones, or repositions the robot start handle.
- **Right panel:** mission metadata form (title, description, difficulty, type) and step list. Each step row is collapsible; expanded view shows points, hint, requires-multiselect, and a "Condition" subsection.
- **Condition editor (below the step list when a step is selected):** a Blockly workspace pre-loaded with the condition toolbox (see §9). The selected step's condition is rendered as blocks; edits update the step's condition in-memory.

### 8.4 Playtest flow

1. Author clicks **Playtest**.
2. Editor serialises the in-memory mission and writes it to `localStorage["mission_playtest_temp"]` (overwriting any prior temp).
3. App switches to **Play mode** with the temp mission loaded.
4. A persistent "Back to Editor" button replaces "Exit Mission" in this Play session.
5. On click, app switches back to **Editor mode** with the in-memory edit state preserved (the temp save was only used to bootstrap Play mode; the editor never reloaded from it).
6. The temp slot is cleared when the editor exits cleanly or saves to a real slot.

## 9. Condition picker — Blockly reuse

The condition editor is a small Blockly workspace, **separate from the existing code-authoring Blockly** in Sandbox/Play mode. It loads a condition-only toolbox:

```
[robot is in zone (Red ▾)]                 — yields boolean
[obstacle (1 ▾) is in zone (Green ▾)]      — yields boolean
[color sensor on (port C ▾) reads (Red ▾)] — yields boolean
[distance sensor on (port D ▾) (<) (50) mm]
[force sensor on (port E ▾) (>) (5) N]
[NOT 〈boolean〉]
[ALL of 〈boolean〉 〈boolean〉 ...]
[ANY of 〈boolean〉 〈boolean〉 ...]
```

**Dropdowns auto-populate.** Zone dropdowns list zones the author placed in the field editor; obstacle dropdowns list placed obstacles; port dropdowns list sensors actually configured on the robot. This is what makes the picker feel coherent: you can only reference things that exist.

**Persistence.** On Save, the workspace serialises to the `condition` tree in `mission.json` directly (no JS code generation). On Load, the engine builds blocks from the tree. The mapping is 1:1 with §6.1 primitives.

**Why Blockly:**
- Already shipped (3500 LoC of block definitions in `js/blockly_config.js`). Toolbox plumbing exists.
- Composite logic (and/or/not) gets nested-block support for free.
- Familiar idiom for FLL-aged kids who know Scratch.
- A bespoke condition UI for the same expressive power would be a far larger build.

The Blockly used for conditions is a sibling workspace with its own toolbox and its own block definitions. It does not share blocks with the code-authoring Blockly. The shared dependency is the Blockly library itself, already loaded.

## 10. Screenshot capture

- **When:** auto-captured on every Save in Editor mode. Author has no control surface for this — it just happens.
- **What:** the canvas rendered in the mission's *initial* state: robot at start pose, field laid out, no trail, no live overlays. The editor briefly renders this clean state into an offscreen canvas to avoid disturbing the live editor view.
- **How:** `canvas.toBlob('image/png')` on an offscreen canvas sized to ~600×290 (matches field aspect 2362:1143 ≈ 2.07:1). Added to the JSZip as `screenshot.png`.
- **Fallback:** missions loaded from external sources without a screenshot render a generated placeholder ("no preview") card. The library panel does not require a screenshot.

## 11. Distribution & storage

- **Bundled missions** live at `missions/<id>/` in the repo (unzipped, so they're reviewable in PRs and easy to edit in source). A `missions/manifest.json` lists them. The Library panel fetches the manifest on load, lazy-loads each mission's `mission.json` and `screenshot.png` for the card.
- **User missions** are stored in `localStorage` keyed under `missions/user/<id>`. Up to a soft cap (50 missions, ~5 MB) — old missions LRU-evict with a confirmation prompt.
- **Playtest temp** lives at `localStorage["mission_playtest_temp"]`, single slot.
- **Imported missions** loaded from file go to a separate `missions/imported/<id>` namespace, surfaced under an "Imported" rail in the library so the user can tell what came from outside.
- **Run results** (best score, last played) are keyed by `<mission_id> + modifier_hash`. Reserving the modifier hash slot lets #45 land cleanly: a hard-mode run records its own personal best.

## 12. Advancement

Star rating per challenge, no gating:

- 3 stars: ≥ 90% of max score
- 2 stars: ≥ 60%
- 1 star: completed at all (any positive score)
- 0 stars: not yet completed or never scored above 0

Library cards show current star count. No mission is ever locked. This is a practice tool, not a gate.

**Playlists are deferred.** The schema reserves no slot for them; they can be added later as a separate `playlists/manifest.json` if classroom adoption demands sequencing.

## 13. Difficulty

- **Tier badge** (`difficulty_tier` in the schema) is editorial: the author picks one of three. Shown on library cards as a hint, not a rule.
- **Modifiers** — author declares which difficulty knobs (pokes, friction patches, sensor noise) the player can toggle. v1 ships with the schema slot but an empty `available` list, because the underlying noise events (#45) aren't built yet. When #45 lands, modifiers wire up without a schema change.

## 14. Out of scope for v1

- Code-line success checks
- State predicates on raw kinematics beyond what `zone`/`sensor`/`contact`/composite cover
- Visual mission editor's "load my Python solution" import path
- URL-hash mission sharing
- Random / parametric obstacle-course generation
- Playlists
- Hint penalties (reveal-on-click is free in v1)
- Multi-user / cloud sync
- `.llsp3` integration (storing missions inside project files)

## 15. Build order

1. **Schema + ChallengeEngine + Play mode + 1 hand-authored bundled mission.**
   Smallest end-to-end slice. Validates the runtime, the schema, the Mission Map panel, and the score readout. No editor yet — the bundled mission is hand-written JSON for this slice only.
2. **Library panel** with the bundled mission visible.
3. **Editor mode shell** + field editor (drag obstacles, zones, robot start). Save serialises field setup only — steps editable but empty allowed.
4. **Step list editor** + metadata form. Save with steps but trivial / placeholder conditions.
5. **Condition picker (Blockly workspace).** Editor can save fully-functional missions with real conditions.
6. **Screenshot capture + thumbnail rendering in the library.** Editor is feature-complete here.
7. **Polish: Playtest, Imported rail, star ratings, persistence.**
8. **Bundle 2–3 more curated missions, authored entirely in the editor as dogfooding.** The hand-written JSON from step 1 either gets opened/re-saved through the editor to gain a screenshot, or is replaced.

Each step ends in a runnable demo and lets us pause before committing further.

## 16. Open questions

- **Mission Map panel placement.** Right column already holds the hub panel and console. Mission Map slots above or below; final call during implementation when we can see the layout.
- **Multiple robot configurations per mission.** v1 assumes the robot port configuration is fixed (PORT_CONFIG). If a mission needs a specific wiring (e.g., colour sensor on a different port), do we expose that in the mission schema and force a port-config swap on load? Defer until a mission actually needs it.
- **Mission validation on load.** A malformed mission file (bad JSON, missing required fields, references to nonexistent zones in conditions) should fail gracefully. Validation layer is in scope but error UX is deferred to implementation.
