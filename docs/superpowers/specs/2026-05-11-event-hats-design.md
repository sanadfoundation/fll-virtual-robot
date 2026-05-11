# Blockly Event Hats — Design

**Date:** 2026-05-11
**Backlog item:** `BACKLOG.md` → Programming Experience → Blockly → Event hats → "`flipperevents_*` blocks are decorative"

## Problem

Ten `flipperevents_*` block types ship with the simulator (`whenProgramStarts`, `whenPressed`, `whenColor`, `whenDistance`, `whenTilted`, `whenOrientation`, `whenGesture`, `whenButton`, `whenTimer`, `whenCondition`), plus one Scratch-style `event_whenbroadcastreceived`. All have block definitions, toolbox entries, and shadow defaults. **All also have a generator registered — but each generator emits an empty string** (`js/blockly_config.js:1397-1404`, the loop `for (const t of [...]) { js[t] = () => ''; }`). Blockly's `blockToCode` then appends the next-chain's code after that empty string, so the hat header is silently dropped and only the body emits. Net effect: every top-level hat's children get inlined sequentially into the single `AsyncFunction` body that `runBlockly` runs.

The user-visible consequence: multiple top-level hats execute as one stack after another, not as concurrent listeners. The "screenshot program" from 2026-05-10 was a `when program starts → forever → move 50 cm` stack next to a `when force sensor on C is pressed → stop moving` stack. `generateBlocklyJS` emitted a `while (sim.isRunning) await _animateTank(...)` loop followed by `window.sim.stop()` — the stop is dead code, never reached while the loop is awaiting. Pressing the force-sensor button did nothing.

This spec wires the missing runtime: each top-level hat becomes its own async polling task, all tasks run concurrently inside the existing `AsyncFunction` wrapper, and `whenProgramStarts` plays the role of "main driver" whose completion ends the program.

## Goals

- **Multiple hats run concurrently.** Two `when pressed` hats, plus a `when distance < 10 cm` hat, plus `when program starts → forever → move`, all run side by side and fire on their own triggers.
- **Edge-triggered semantics.** Hats fire on the moment a condition transitions from false to true. Holding the press doesn't re-fire. Releasing and pressing again fires it again. Matches Scratch / FLL convention.
- **Drop-while-busy.** A hat's body runs to completion before that hat can re-fire. Triggers that happen while the body is running are dropped (no queue, no preempt).
- **`whenProgramStarts` is the program driver.** When its body finishes, all other hats stop polling and the program ends. If no `whenProgramStarts` block exists, the program runs until the Stop button.
- **Stop button cleans up.** `window.sim.stop()` (called by the Stop button or by a `stop moving` block inside a hat body) flips `isRunning = false`; every hat's polling loop exits at its next `requestAnimationFrame` yield (~16 ms).
- **Stub-condition hats warn, not silently fail.** Five hats (`whenButton`, `whenTilted`, `whenGesture`, `whenOrientation`, `event_whenbroadcastreceived`) depend on infrastructure that isn't in place: the first four ride on motion-sensor / hub-button APIs that are still stubs in the broader backlog; the broadcast hat needs a separate broadcast registry. Their generators emit a one-line warning at run time so a student building a `when tilted` program doesn't sit and stare. The runtime path itself is hat-kind-agnostic — those hats become functional automatically when their underlying APIs land.
- **Add unit + integration test coverage** for the generator output shape and the runtime's edge-trigger + drop-while-busy + isRunning-cancellation behaviour.

## Non-goals

- **Motor-command contention between concurrent tasks.** If the main stack is mid-`_animateTank(50 cm)` and a hat body calls its own `_animateTank(10 cm)`, both `setKinematicVelocity` calls fight per tick. This is a known sharp edge of the simulator's single shared kinematic body; flagged under the existing "Single-motor blue blocks: stop scope" backlog item. v1 documents the caveat and moves on.
- **Hat body queuing / preemption.** Drop-while-busy is the only re-fire policy. A queue or interrupt model is out of scope.
- **Wall-clock-precise hat firing.** Polling runs at `requestAnimationFrame` cadence (~60 Hz on most setups). A condition that goes true and false again within one frame can be missed. This is the standard cooperative-concurrency tradeoff and matches Scratch's `forever` loop semantics.
- **A new execution thread / Worker.** All hats share the main thread; the runtime relies on JavaScript's event loop and `await` yields. No `Worker` plumbing.
- **Re-architecting `runBlockly` or the AsyncFunction harness.** The new code lives entirely inside the generator's output.
- **The other backlog items the force-sensor branch surfaced.** The wall-escape clamp and the motor / button / motion APIs are separate work.

## Background: how Blockly code generation runs today

`js/main.js:runBlockly` calls `window.generateBlocklyJS(ws)`, which invokes Blockly's `workspaceToCode`. That walks every top-level block, generates per-block code via the registered JS generators, and concatenates the result. `runBlockly` wraps it as `new AsyncFunction(generatedSource)` and `await fn()`s it. The simulator's `isRunning` flag is the cancellation signal: `_animateTank`'s per-step loop checks it, `sim.stop()` flips it.

Today, each `flipperevents_*` (plus `event_whenbroadcastreceived`) has a generator registered (via the loop at `js/blockly_config.js:1397-1404`) that returns `''`. Blockly's `blockToCode` evaluates the block's generator and then recurses into the `NEXT` chain via `statementToCode`, appending the next-chain's code after the hat's empty string. So `when program starts → forever → move` becomes `while (sim.isRunning) await sim._animateTank(...)` — the hat header contributes nothing, but the loop and move come through. `when pressed → stop` becomes `window.sim.stop()` — same shape. Two top-level stacks produce two sequential statement sequences, concatenated in workspace-position order.

The fix is to replace each empty-string generator with one that wraps the body in an async polling closure (or, for `whenProgramStarts`, assigns it to `_mainBody`), so the body becomes a task instead of inline code.

## Architecture

Three pieces inside the generator's output.

### 1. Preamble (`generateBlocklyJS`)

The existing preamble in `js/blockly_config.js:2265-2278` already seeds `_moveSpeed`, `_movePairL`, etc. Add six new top-level vars:

```javascript
var _hats     = [];
var _mainBody = null;
var _hatBusy  = {};
var _hatPrev  = {};
var _hatFired = {};
var _t0       = performance.now();
```

| Name | Purpose |
|---|---|
| `_hats` | Array of `async () => void` polling tasks, one per non-`whenProgramStarts` hat. |
| `_mainBody` | `async () => void` for the `whenProgramStarts` body. `null` if no such block exists. |
| `_hatBusy` | Per-hat-id boolean, true while the body is executing. Drives drop-while-busy. |
| `_hatPrev` | Per-hat-id previous condition value. Boolean for most hats; numeric scalar for `whenPressed` with `pressure changed` (compared via `!==`, not `&& !prev`). |
| `_hatFired` | Per-hat-id boolean, set permanently true after the first fire of a one-shot hat (`whenTimer`). Other hats never touch it. Keeps busy-vs-one-shot orthogonal. |
| `_t0` | Shared program start timestamp, used by `whenTimer` and as a safe-to-read reference for any future relative-time hat. |

Hat IDs are stable strings the generator chooses — Blockly's `block.id` is sufficient (e.g. `_hatBusy['Yh.+]Y_!_-7'] = true`). Strings work as JS object keys regardless of content.

### 2. Per-hat generator (one entry per hat type in `registerGenerators`)

Each `flipperevents_*` generator (except `whenProgramStarts`, which is special — see below) emits a `_hats.push(...)` statement of the form:

```javascript
_hats.push(async () => {
  while (window.sim.isRunning) {
    const cur = <condition expression>;
    if (cur && !_hatPrev['<id>'] && !_hatBusy['<id>']) {
      _hatBusy['<id>'] = true;
      try {
        <body statements>
      } catch (e) {
        window.appendOutput && window.appendOutput('[Error] when <kind>: ' + e.message, 'error');
      } finally {
        _hatBusy['<id>'] = false;
      }
    }
    _hatPrev['<id>'] = cur;
    await new Promise(r => requestAnimationFrame(r));
  }
});
```

`<id>` is `block.id`. `<body statements>` is the result of recursing into the block's `NEXT` connection (the existing Blockly pattern for hat bodies). `<condition expression>` is per-hat and listed in the table below.

`whenProgramStarts` is special — its body has no condition. Its generator emits:

```javascript
_mainBody = async () => {
  <body statements>
};
```

If two `whenProgramStarts` blocks exist (rare; Blockly normally enforces a single one), the second overwrites the first. The generator emits the assignment unconditionally; the second wins. Matches Scratch.

### 3. Epilogue (`generateBlocklyJS`)

After `workspaceToCode` returns, append:

```javascript
await (async () => {
  // Start every hat first so it's polling on the event loop, then run
  // _mainBody concurrently. Calling an async fn returns a Promise and
  // begins execution; each hat runs synchronously to its first `await rAF`
  // then yields, leaving the event loop free for _mainBody to start.
  const _hatPromises = _hats.map(h => h());
  if (_mainBody) {
    try { await _mainBody(); } finally { window.sim.isRunning = false; }
  }
  await Promise.all(_hatPromises);
})();
```

**Why the hat-first ordering is load-bearing.** A program like the screenshot's `forever → move` + `when pressed → stop moving` needs the hat to run *while* main is in its forever-loop, so the hat's body (which calls `sim.stop()`) can flip `isRunning` and let main exit. If main were awaited first and only then the hats were started, main would loop forever — nothing would ever call the hat. Calling `_hats.map(h => h())` invokes every hat's async function synchronously up to its first `await new Promise(r => requestAnimationFrame(r))`, then they all yield, leaving the event loop free for `await _mainBody()` to start. From there each animation frame interleaves all polling tasks plus main.

The leading `await` ensures `runBlockly`'s outer `await fn()` blocks until the IIFE settles. The IIFE itself: kick off all hats; if a `_mainBody` exists, run it; when it returns (normally or via throw), flip `isRunning = false` to signal hats to wind down. Then wait for every hat's polling task to exit. The `runBlockly` AsyncFunction body resolves when (a) `_mainBody` finished AND all hats wound down, or (b) every hat has wound down with no `_mainBody` (a pure-event-driven program where the user clicked Stop).

## Condition expressions

The polling-loop template above guards on `cur && !_hatPrev[id] && !_hatBusy[id] && !_hatFired[id]`. Each generator emits the same skeleton, varying only:
- the **condition expression** (what produces `cur`);
- the **prev type** (boolean for most hats; numeric for `whenPressed pressure changed` where the edge is `cur !== _hatPrev[id]` rather than `cur && !_hatPrev[id]`);
- whether to set `_hatFired[id] = true` inside the body wrapper (one-shot hats only).

| Hat | Fields | `cur` expression | Prev type | One-shot |
|---|---|---|---|---|
| `whenProgramStarts` | — | n/a — body becomes `_mainBody`, not a polling task | n/a | n/a |
| `whenPressed` | `PORT`, `OPTION` ∈ {`pressed`, `hard-pressed`, `released`, `pressure changed`} | `pressed` → `window.sim.getForceSensorPressed()`. `hard-pressed` → `window.sim.getForceSensorValue() >= 70`. `released` → `!window.sim.getForceSensorPressed()`. `pressure changed` → `window.sim.getForceSensorValue()` (compared via `!==`, see *Prev type*). | bool, except `pressure changed` → number | no |
| `whenColor` | `PORT`, `OPTION` (colour name) | `window.sim.getColorSensorColor() === '<OPTION>'` | bool | no |
| `whenDistance` | `PORT`, `COMPARATOR` ∈ {`<`, `=`, `>`}, `VALUE` (input), `UNIT` ∈ {`%`, `cm`, `inches`} | Convert `VALUE` to mm at generator time (`cm × 10`, `inches × 25.4`, `% × DIST_SENSOR_MAX_MM / 100`), then emit `window.sim.getDistanceSensorValue() <COMPARATOR> <mmValue>`. `=` uses a tolerance band of ±10 mm to match Scratch's "exactly at" being practically a band. | bool | no |
| `whenTimer` | `VALUE` (input, seconds) | `(performance.now() - _t0) >= <VALUE × 1000>` | bool | **yes** |
| `whenCondition` | `CONDITION` (boolean input expression) | `!!(<generated boolean for the CONDITION input>)`. Works with any boolean reporter — `force is pressed?`, `colour is red?`, comparison operators, etc. | bool | no |
| `whenButton` | `BUTTON` ∈ {`LEFT`, `RIGHT`}, `EVENT` ∈ {`pressed`, `released`} | Stub-warn: `hub.button.pressed()` returns 0 always. | n/a | n/a |
| `whenTilted` | `VALUE` ∈ {`up`, `down`, `left`, `right`, `front`, `back`, `any`} | Stub-warn: motion-sensor `tilt_angles()` returns `(0, 0, 0)`. | n/a | n/a |
| `whenOrientation` | `VALUE` (hub face) | Stub-warn: `up_face()` returns frozen `TOP`. | n/a | n/a |
| `whenGesture` | `EVENT` ∈ {`shaken`, `tapped`, `falling`} | Stub-warn: `gesture()` returns `UNKNOWN`. | n/a | n/a |
| `event_whenbroadcastreceived` | `BROADCAST_OPTION` (text) | **Out of scope.** Scratch's broadcast pattern needs a separate registry (`window._broadcasts = new Map()`). Treated as a stub-warn for v1; the broadcast runtime is a separate piece of work. | n/a | n/a |

**Stub-warn pattern.** The four stub hats and the broadcast hat emit:

```javascript
;(function () {
  const _msg = "[!] when <kind>: <reason> — this hat won't fire";
  if (window.appendOutput) window.appendOutput(_msg, 'warn');
  else if (console && console.warn) console.warn(_msg);
})();
_hats.push(async () => {
  while (window.sim.isRunning) { await new Promise(r => requestAnimationFrame(r)); }
});
```

The empty polling loop ensures the hat respects the same `isRunning` lifecycle as functional hats — `Promise.all([...])` resolves cleanly on Stop. Without it, the warn IIFE runs once and the hat array entry would be a settled promise, which is also fine, but the empty loop keeps the runtime shape uniform.

**Pressure-changed edge logic.** For the only numeric-prev case, the polling closure is:

```javascript
_hats.push(async () => {
  _hatPrev['<id>'] = window.sim.getForceSensorValue();  // seed at hat start
  while (window.sim.isRunning) {
    const cur = window.sim.getForceSensorValue();
    if (cur !== _hatPrev['<id>'] && !_hatBusy['<id>']) {
      _hatBusy['<id>'] = true;
      try { <body> } catch (e) { /* …surface… */ } finally { _hatBusy['<id>'] = false; }
    }
    _hatPrev['<id>'] = cur;
    await new Promise(r => requestAnimationFrame(r));
  }
});
```

Seeding `_hatPrev` at hat start (not preamble) prevents a spurious first-frame fire when the pressure starts at 0 — both `prev` and `cur` are 0 on the first iteration.

## Data flow

```
Blockly workspace
   ├─ whenProgramStarts → forever → move 50 cm    (top block A)
   └─ whenPressed C pressed → stop moving         (top block B)

generateBlocklyJS(ws)
   ├─ preamble:  var _hats = []; var _mainBody = null; var _hatBusy = {}; var _hatPrev = {}; var _hatFired = {}; var _t0 = performance.now();
   ├─ A's generator emits:  _mainBody = async () => { while (sim.isRunning) { await sim._animateTank(...); } };
   ├─ B's generator emits:  _hats.push(async () => { while (sim.isRunning) { ... edge-detect on getForceSensorPressed() ... } });
   └─ epilogue:   await (async () => { const _hatPromises = _hats.map(h => h()); if (_mainBody) { try { await _mainBody(); } finally { sim.isRunning = false; } } await Promise.all(_hatPromises); })();

runBlockly()
   ├─ new AsyncFunction(generatedSource)
   ├─ await fn()
   │     ├─ _hats.map(h => h()) — B's polling task starts, runs synchronously to its first await rAF, yields. (No other hats here.)
   │     ├─ await _mainBody() — A's main task starts, runs to its first await rAF inside the forever loop, yields.
   │     ├─ Event loop ticks. Both tasks resume on each frame.
   │     ├─ User presses the force button.
   │     ├─ B's next iteration: cur=true, prev=false → marks busy, runs body, sets isRunning=false.
   │     ├─ A's _animateTank checks isRunning at its next yield, exits its step loop.
   │     ├─ A's forever's while-condition is false, returns; _mainBody promise resolves.
   │     ├─ epilogue's finally sets isRunning=false (already false; idempotent).
   │     └─ Promise.all(_hatPromises) waits one more frame; B's polling exits because isRunning=false.
   └─ "[Done] Simulation complete." prints, setButtons(false).
```

## Edge cases

| Case | Behaviour |
|---|---|
| No `whenProgramStarts` block, no hats | `_mainBody = null`, `_hats = []`. Epilogue's `if` skips, `Promise.all([])` resolves immediately. Program ends with "[Done]". |
| No `whenProgramStarts`, one hat | `_mainBody = null`, hat polls forever. User must click Stop to end. |
| `whenProgramStarts → beep` (finite main, no hats) | Main runs once, returns. `isRunning = false` set in `finally`. Empty `_hats` array. Program ends. |
| `whenProgramStarts → beep` (finite main, one hat) | Main runs once, returns. `isRunning = false` triggers hat to exit its polling loop at next frame. `Promise.all` waits one frame; hat resolves. Program ends. The hat NEVER fires in this case because the main is too fast — that's intentional. |
| Two hats on the same condition (e.g. two `when pressed C`) | Each has a distinct `block.id` and so distinct `_hatPrev` / `_hatBusy` entries. Both fire on the same press. |
| Hat fires while its body is running | Drop. The polling loop's `if` skips because `_hatBusy[id]` is true. `_hatPrev` does NOT update during busy — see next row. |
| `_hatPrev` update during busy | Updates every frame, including while busy. So if the condition flips true→false→true during the body's execution, the final `_hatPrev = true` keeps the edge from re-firing immediately when the body finishes. A subsequent false→true does fire. |
| Hat body calls `_animateTank` | Runs concurrently with main's `_animateTank` if any. Both write `setKinematicVelocity` per tick; last writer per frame wins. Documented as a known sharp edge — students who write `move` in a hat body get unpredictable behaviour. Mitigation lives under the existing "Single-motor blue blocks" backlog item. |
| Hat body throws | Caught by the `try/catch` inside the polling closure; surfaced via `appendOutput('[Error] when <kind>: <message>', 'error')`. The `finally` resets `_hatBusy`. The hat continues polling. |
| Main body throws | Propagates out of `await _mainBody()`, hits the epilogue's `finally`, flips `isRunning = false`. Hats wind down. `runBlockly`'s own `try/catch` surfaces the error. |
| User clicks Stop mid-run | `handleStop` flips `_stopRequested` and `isRunning`. Main's `_animateTank` and all hat polling loops exit at their next yield. `Promise.all` resolves. Program ends. |
| `whenTimer` after the program has already been running | `_t0` is captured at preamble time (before any hats start), so timers always reference program start, not "first time the timer hat polled". Matches Scratch. |
| Multiple `whenTimer` hats with the same duration | Each fires once on its own `_hatFired` flag. Both fire near the same frame as the duration elapses. |
| `whenTimer` fires before its body finishes | Body completes, `_hatFired` stays true, hat polling continues with the body never re-entering. Polling exits cleanly when `isRunning = false`. |

## Testing

### Unit (`tests/js/blockly/event-hats.test.js` — new)

Pure-function tests on `generateBlocklyJS(ws)`. Build small workspaces, generate code, assert the emitted shape.

- `generates _mainBody assignment for whenProgramStarts`: a workspace with a single `whenProgramStarts → beep` block emits exactly one `_mainBody = async () => {` substring and no `_hats.push`.
- `generates _hats.push for each non-main hat`: a workspace with `whenProgramStarts` + two `whenPressed` blocks emits one `_mainBody` and exactly two `_hats.push(` occurrences.
- `condition snippet matches expected per hat kind`: parametric tests over `{kind → expected substring}`:
  - `whenPressed pressed` → `window.sim.getForceSensorPressed()`
  - `whenPressed hard-pressed` → `window.sim.getForceSensorValue() >= 70`
  - `whenColor red` → `window.sim.getColorSensorColor() === 'red'`
  - `whenDistance < 10 cm` → `window.sim.getDistanceSensorValue() < 100`
  - `whenDistance > 5 inches` → `window.sim.getDistanceSensorValue() > 127` (5 × 25.4)
  - `whenTimer 2 seconds` → `(performance.now() - _t0) >= 2000`
- `whenButton stub emits warn + no-op polling loop`: code contains `appendOutput('[!] when button:` and the polling loop reduces to `while (window.sim.isRunning) { await new Promise(...) }`.
- `epilogue starts hats concurrently then awaits main`: emitted source ends with the `await (async () => { const _hatPromises = _hats.map(h => h()); ... await _mainBody(); ... Promise.all(_hatPromises); })();` pattern. The hat-start MUST precede the main await in source order — otherwise the program deadlocks on `forever`-main programs that depend on a hat to flip `isRunning`.
- `preamble declares all five new vars`: `_hats`, `_mainBody`, `_hatBusy`, `_hatPrev`, `_t0` all present at the top.

### Integration (`tests/js/blockly/event-hats-runtime.test.js` — new)

Run the generated AsyncFunction against a stub `window.sim` and a controllable `requestAnimationFrame`. Verify behaviour, not generator output.

- `edge-trigger fires once per false→true transition`: stub `getForceSensorPressed` returns a scripted sequence `[false, false, true, true, false, true]`. Body increments a counter. After 6 simulated frames, counter is 2.
- `drop-while-busy suppresses re-fires during body execution`: body holds for 3 frames via `await new Promise(r => setTimeout(r, ...))` mocked. Condition stays true throughout. Counter is 1 (not 3).
- `whenProgramStarts ending sets isRunning = false`: workspace has only `whenProgramStarts → beep`. Run. `window.sim.isRunning` is false on completion.
- `Stop button mid-run cancels all hats`: workspace has `whenProgramStarts → forever sleep` and two `when pressed` hats. After 5 frames, set `sim.isRunning = false` externally. Wait one frame. All polling loops have exited; the AsyncFunction promise resolves.
- `no whenProgramStarts, one hat`: workspace has only `when pressed`. Main IIFE skips the `_mainBody` branch. Set `isRunning = false` externally to terminate; runtime resolves.
- `whenTimer fires once after duration`: stub `performance.now` to advance frame-by-frame. Body counter is 1 after duration elapses; remains 1 across many more frames.
- `stub-warn hat logs once`: `whenButton` hat emits warn at run time. Stub `console.warn` and `appendOutput`; assert each called exactly once.

### Manual smoke

1. `python3 -m http.server 8787`; open the app, click Blocks.
2. Build the screenshot program: `when program starts → forever → move 50 cm`, plus `when force sensor on C is pressed → stop moving`.
3. Click Run. Robot starts driving north.
4. Click the Apply button in the Settings section. Robot stops within ~16 ms. Console shows `[Done] Simulation complete.`
5. Click Reset. Click Run again. Robot drives. Click Apply. Robot stops. Repeatable.
6. Build `when program starts → say "hi"` next to `when distance sensor on F is closer than 10 cm`. Run. The closer-than hat polls; the "hi" prints once and the main ends, hats wind down. Run again, drive the robot near a wall — the hat doesn't get a chance to fire because main is too fast. Confirmed expected.
7. Place a `when tilted` hat in a program. Run. Console shows `[!] when tilted: motion sensor isn't implemented yet — this hat won't fire`. Other parts of the program run normally.

## Open questions resolved during brainstorming

- **Trigger semantics**: edge (A) vs level (B) vs one-shot per run (C). Chose **edge** — matches Scratch / FLL, predictable, matches student expectations.
- **Re-fire policy while body is running**: drop (A) vs queue (B) vs restart (C). Chose **drop** — simplest, matches Scratch, no queue management.
- **v1 hat scope**: all hats (A) vs only working ones (B) vs runtime + working hats + warn-on-stub for the rest (C). Chose **C** — runtime is generic so future hats are one-line additions; visible warning prevents silent failure of stub-dependent hats. Functional in v1: `whenProgramStarts`, `whenPressed`, `whenColor`, `whenDistance`, `whenTimer`, `whenCondition`. Stub-warn: `whenButton`, `whenTilted`, `whenOrientation`, `whenGesture`, `event_whenbroadcastreceived`.
- **Program end condition**: main finishes (A) vs all-tasks-finish (B) vs Stop-only (C). Chose **A** — `whenProgramStarts` is the master; its return ends the program. Pure-event-driven programs (no main block) run until Stop.
- **Motor-command contention**: let it happen (A) vs mutex (B) vs preempt (C). Chose **A** — common patterns (kill-switch, set-variable, play-sound) don't contend; rare "concurrent move in hat body" is documented under existing backlog item.

## File touch list

- **Modified:** `js/blockly_config.js` —
  - `registerGenerators` adds 11 new generator entries: 6 functional (`flipperevents_whenProgramStarts`, `flipperevents_whenPressed`, `flipperevents_whenColor`, `flipperevents_whenDistance`, `flipperevents_whenTimer`, `flipperevents_whenCondition`) and 5 stub-warn (`flipperevents_whenButton`, `flipperevents_whenTilted`, `flipperevents_whenOrientation`, `flipperevents_whenGesture`, `event_whenbroadcastreceived`).
  - `generateBlocklyJS` extends the preamble with `_hats`, `_mainBody`, `_hatBusy`, `_hatPrev`, `_hatFired`, `_t0`. Appends the `await (async () => { ... })()` epilogue after the body.
- **New:** `tests/js/blockly/event-hats.test.js` — generator output-shape tests.
- **New:** `tests/js/blockly/event-hats-runtime.test.js` — runtime behaviour tests against a stub `window.sim` and `requestAnimationFrame`.
- **Modified:** `tests/js/blockly/helper.js` (or equivalent existing helper) — extend if needed to set up workspaces and capture `generateBlocklyJS` output. Reuse the existing pattern; don't introduce a new helper module.
- **Modified:** `BACKLOG.md` —
  - Strike the "`flipperevents_*` blocks are decorative" bullet from Programming Experience → Blockly → Event hats.
  - Strike the "Functional hub-button blocks" cross-reference about the event-hat runtime (the API stub still stands; just the runtime gate goes away). The hub-button bullet's text becomes "see *Hub button* above" again, without the "needs event-hat runtime" addendum.
