# Test fidelity uplift — implementation plan

> **For agentic workers:** Execute task-by-task. Use TDD for each fix: write the meaningful test first, see it fail, then fix the impl, then watch it pass.

**Goal:** Build a Python↔JS round-trip test harness using MicroPython-WASM in Node, then upgrade the most damaging shape-only / stub-pin tests in the suite to behaviour-grade tests by fixing the underlying simulator bugs that the audit named.

**Architecture:** Load MicroPython WASM into Node's main thread, pre-populate `globalThis.sim` with a real `RobotSimulator`, override `globalThis.bridgeSend` (after `spike_bridge.py` installs its worker shim) so Python `js.bridgeSend(cmdJson)` calls `sim.executeCommand` directly. Single event loop, no threads, async-await throughout. Round-trip tests assert post-call sensor read-back, not seeded `_state`.

**Tech Stack:** `@micropython/wasm` (or fallback `pyodide`), Node `node:test`, existing `tests/js/sim-helper.js`, `tests/js/integration/` (new).

**Scope-honesty:** The audit names ~21 bug surfaces. This plan fixes 3 high-leverage ones (steering-in-`start`, motor encoder tracking, `hub.light_matrix.show_image`) and the test posture across them. Other audit items get `expectedFailure`-style markers documenting the bug rather than enforcing it. Round-trip harness unblocks the rest in future sessions.

---

## Task 1 — MicroPython-in-Node harness, smoke test

**Files:**
- Create: `tests/js/integration/micropython-loader.js`
- Create: `tests/js/integration/smoke.test.js`
- Modify: `package.json` (create if missing — add `@micropython/wasm` or fall back to `pyodide`)

**Strategy:** First attempt: `pyodide` (CPython-in-Node, official npm package, well-documented Node support, auto-exposes `js` module). The user asked for MicroPython for production fidelity; if pyodide-in-node turns out trivial and micropython-in-node turns out to be a rabbit hole >30 minutes, choose pyodide and document the fidelity caveat. Both runtimes can run `spike_bridge.py`; the divergence risk is on MicroPython-specific stdlib gaps (no `traceback` etc.), which the bridge already accommodates.

- [ ] **Step 1: Probe what's available**

```bash
npm view pyodide version 2>/dev/null
npm view @micropython/wasm version 2>/dev/null
```

- [ ] **Step 2: Create `package.json` + install runtime**

If `@micropython/wasm` exists and installs cleanly: use it.
Else: fall back to `pyodide`.

Document the choice and reasoning in `tests/js/integration/README.md`.

- [ ] **Step 3: Write a minimal smoke test**

```js
// tests/js/integration/smoke.test.js
const test = require('node:test');
const assert = require('node:assert');
const { loadPythonRuntime } = require('./micropython-loader');

test('python runtime loads and executes 1+1', async () => {
  const py = await loadPythonRuntime();
  const result = await py.runPython('1 + 1');
  assert.strictEqual(result, 2);
});
```

- [ ] **Step 4: Run, verify it passes, commit**

```bash
node --test tests/js/integration/smoke.test.js
git add tests/js/integration package.json package-lock.json
git commit -m "test(integration): bootstrap python-in-node harness"
```

---

## Task 2 — Round-trip harness wiring

**Files:**
- Modify: `tests/js/integration/micropython-loader.js`
- Create: `tests/js/integration/roundtrip-helper.js`
- Create: `tests/js/integration/roundtrip-smoke.test.js`

**Goal:** A helper that gives every test a fresh sim + a Python module that can call into the bridge.

- [ ] **Step 1: Write the helper API contract**

```js
// tests/js/integration/roundtrip-helper.js
// Returns { sim, py, runUserCode }.
// - sim: real RobotSimulator instance
// - py: python runtime with spike_bridge loaded
// - runUserCode(src): executes Python source; awaits any coroutines via runloop.run
async function makeRoundtrip() { … }
```

- [ ] **Step 2: Implement it**

Pseudo-flow:
1. `createSim()` from `sim-helper.js`
2. `loadPythonRuntime()`
3. Set `globalThis.sim = sim` and `globalThis.bridgeSend = async (json) => JSON.stringify(await sim.executeCommand(JSON.parse(json)))`
4. Set `globalThis.signalDone = () => {}` and `signalError`
5. Load `py/spike_bridge.py` source into runtime (use `runPython` on its contents)
6. Override `globalThis.bridgeSend` AGAIN after bridge load to ensure ours wins over the worker shim

Critical: `spike_bridge.py` line 11-30 calls `js.eval(...)` to install its worker-flavoured `bridgeSend`. We overwrite afterwards. The bridge looks up `js.bridgeSend` at call-time inside `_bridge_call`, so last-write wins.

- [ ] **Step 3: First round-trip behaviour test**

```js
// tests/js/integration/roundtrip-smoke.test.js
test('round-trip: motor.run_for_degrees moves the robot', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  await runUserCode(`
    import spike_bridge as sb
    import runloop
    async def main():
        sb.motor_pair.pair(0, sb.port.A, sb.port.B)
        await sb.motor_pair.move_for_degrees(0, 360, 0, velocity=500)
    runloop.run(main())
  `);
  // The robot should have moved forward by ~one wheel circumference (176 mm)
  const moved = Math.hypot(sim.robot.x - 350, sim.robot.y - 163);
  assert.ok(moved > 100 && moved < 250, `expected ~176 mm forward, got ${moved}`);
});
```

- [ ] **Step 4: Run, commit**

```bash
node --test tests/js/integration/roundtrip-smoke.test.js
git add tests/js/integration
git commit -m "test(integration): round-trip harness — Python→sim→read-back"
```

---

## Task 3 — Fix `'start'` drops steering; add meaningful tests

**Files:**
- Modify: `js/simulator.js:1085-1096` (`case 'start'`)
- Modify: `tests/js/commands/dispatch-extra.test.js` (add steering case)
- Create: `tests/js/integration/steering.test.js` (round-trip)

- [ ] **Step 1: Write the failing JS dispatch test FIRST**

```js
// tests/js/commands/dispatch-extra.test.js (append)
test('start: steering 50 applies to wheel velocities', async () => {
  const sim = createSim();
  const calls = withTankStub(sim);
  await sim._execCmd({ type: 'start', pair_id: 0, speed: 1000, steering: 50 });
  assert.strictEqual(calls.length, 1);
  // steering > 0 means right turn = left wheel faster
  // lv = spd × (1 + steer/100), rv = spd × (1 - steer/100) per CLAUDE.md
  assert.ok(close(calls[0].leftV,  1.5), `leftV=${calls[0].leftV}`);
  assert.ok(close(calls[0].rightV, 0.5), `rightV=${calls[0].rightV}`);
});
```

- [ ] **Step 2: Run, verify fails (current impl ignores steering)**

```bash
node --test tests/js/commands/dispatch-extra.test.js
# expect: leftV=1, rightV=1 (steering dropped)
```

- [ ] **Step 3: Fix `case 'start'`**

```js
// js/simulator.js — replace 1085-1096
case 'start':
case 'start_tank':
  {
    let leftV, rightV;
    if (cmd.type === 'start') {
      const spd   = cmd.speed / 1000;
      const steer = (cmd.steering || 0) / 100;
      leftV  = spd * (1 + steer);
      rightV = spd * (1 - steer);
    } else {
      leftV  = cmd.left_speed  / 1000;
      rightV = cmd.right_speed / 1000;
    }
    await this._runMotion(
      this._descriptorForPair(cmd.pair_id),
      () => this._animateTank(leftV, rightV, 200),
    );
  }
  break;
```

- [ ] **Step 4: Run JS test, verify pass**

- [ ] **Step 5: Add round-trip test**

```js
// tests/js/integration/steering.test.js
test('round-trip: motor_pair.move with right steering turns right', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  const startHeading = sim.robot.heading;
  await runUserCode(`
    import spike_bridge as sb
    import runloop
    async def main():
        sb.motor_pair.pair(0, sb.port.A, sb.port.B)
        await sb.motor_pair.move_for_degrees(0, 360, 50, velocity=500)
    runloop.run(main())
  `);
  // Right turn: heading should decrease (math convention: CW = decreasing)
  assert.ok(sim.robot.heading < startHeading, …);
});
```

- [ ] **Step 6: Run full suite, commit**

```bash
python3 tests/py/run.py && node --test "tests/js/**/*.test.js"
git add js/simulator.js tests/
git commit -m "fix(sim): apply steering in continuous start; meaningful tests"
```

---

## Task 4 — Motor encoder tracking + flip stub-pin tests

**Files:**
- Modify: `js/simulator.js` (`_animateTank`, `_animateSingleMotor`)
- Modify: `tests/js/sensors/accessors.test.js:108-116` (the canonical stub-pins)
- Modify: `tests/py/test_motor.py:60-66` (`isinstance` type-only tests)
- Create: `tests/js/integration/motor-encoder.test.js`

**Background:** Per the audit, `robot.motors[port]` is never updated by motion. The reader at `getMotorPosition(port)` returns whatever was last assigned. We need motion to accumulate degrees into `robot.motors[port]`.

- [ ] **Step 1: Write failing JS test**

```js
// tests/js/sensors/accessors.test.js — replace 108-116
test('getMotorSpeed: reflects active motion velocity', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  // Mid-motion: pump a fake step
  sim.robot.motors_velocity = { A: 500, B: 500 };  // populated by motion loop
  assert.strictEqual(sim.getMotorSpeed('A'), 500);
});

test('getMotorPosition: accumulates after motion', async () => {
  const sim = createSim();
  sim.isRunning = true;
  await sim._execCmd({ type: 'pair', pair_id: 0, left: 'A', right: 'B' });
  await sim._execCmd({ type: 'motor_degrees', port: 'A', degrees: 360, velocity: 500 });
  // Expect ~360° accumulated on port A (within reasonable tolerance for sim step granularity)
  const pos = sim.getMotorPosition('A');
  assert.ok(Math.abs(pos - 360) < 30, `expected ~360, got ${pos}`);
});
```

- [ ] **Step 2: Run, verify fails**

- [ ] **Step 3: Implement encoder tracking in `_animateTank` and `_animateSingleMotor`**

In `_animateTank`: each integration step, for each port in `_activeMotion.ports`, add (wheelVelocity_mm_per_step / WHEEL_CIRC_MM × 360) to `robot.motors[port]`.

In `_animateSingleMotor`: similar but single-port.

For `motors_velocity`: maintain a separate object set at motion start, cleared at motion end. `getMotorSpeed(port)` reads from it.

- [ ] **Step 4: Run JS tests, verify pass**

- [ ] **Step 5: Add round-trip Python test**

```js
// tests/js/integration/motor-encoder.test.js
test('round-trip: motor.absolute_position after run_for_degrees', async () => {
  const { sim, runUserCode } = await makeRoundtrip();
  const result = await runUserCode(`
    import spike_bridge as sb
    import runloop
    async def main():
        await sb.motor.run_for_degrees('A', 180, velocity=500)
        return sb.motor.absolute_position('A')
    return runloop.run(main())
  `);
  assert.ok(Math.abs(result - 180) < 30, `expected ~180, got ${result}`);
});
```

- [ ] **Step 6: Update Python type-only tests to also assert value-ranges**

```python
# tests/py/test_motor.py — replace 60-66
def test_absolute_position_returns_zero_at_rest(self):
    # No motion has happened, _state['motors']['A'] = 0
    result = sb.motor.absolute_position('A')
    self.assertEqual(result, 0)
    self.assertIsInstance(result, int)

def test_absolute_position_reflects_state(self):
    sb._state['motors']['A'] = 90
    try:
        self.assertEqual(sb.motor.absolute_position('A'), 90)
    finally:
        sb._state['motors']['A'] = 0
```

- [ ] **Step 7: Run full suite, commit**

---

## Task 5 — `hub.light_matrix.show_image` actually renders

**Files:**
- Modify: `js/simulator.js` (`_execCmd` — add `case 'hub_image'`)
- Modify: `tests/py/test_hub.py:40-42` (assert robot.display state, not just payload)
- Create: `tests/js/integration/hub-image.test.js`

The fix is a switch case that maps the named image (`'HAPPY'`, `'SAD'`, etc.) to a 25-pixel pattern. Constants come from `py/spike_bridge.py` `IMAGE_*` table.

- [ ] **Step 1: Write failing JS test**

```js
test('hub_image: HAPPY sets a known pixel pattern', async () => {
  const sim = createSim();
  await sim._execCmd({ type: 'hub_image', image: 'HAPPY' });
  assert.strictEqual(sim.robot.display.length, 25);
  // Eyes at positions 6, 8; smile at 16, 17, 18, 20, 24
  assert.ok(sim.robot.display[6] > 0 && sim.robot.display[8] > 0,
    'eyes should be lit');
});
```

- [ ] **Step 2: Implement `case 'hub_image'`**

Define a small map from image name → 25-cell brightness array. Cover at minimum `HAPPY` and `SAD` (smallest evidence of behaviour); leave the rest as TODO comments — meaningful is "at least one image works," not "all 67 work."

- [ ] **Step 3: Round-trip test**

- [ ] **Step 4: Run, commit**

---

## Task 6 — Audit-driven expectedFailure markers for known un-fixed bugs

**Files:**
- Modify: `tests/py/test_gaps.py` (the `runloop.until` stub-pin tests)
- Modify: stub-pin tests we *don't* fix this session

For every stub-pin test that currently enforces a known bug we don't fix in this session, replace the "asserts the buggy behaviour" assertion with an `@unittest.expectedFailure`-decorated assertion of the *correct* behaviour. This flips the contract from "bug must persist" to "bug is tracked-failing."

Concrete candidates from the audit:
- `runloop.until` — predicate never polled
- `color_sensor.rgbi` — always returns `(128,128,128,0)` (reflection got fixed, rgbi did not)

- [ ] **Step 1: Add expectedFailure tests**

```python
# tests/py/test_gaps.py — append
class TestKnownBugsTracked(unittest.TestCase):
    """Tests that pin the LEGO-documented behaviour. These should FAIL today;
    they document the gap and will pass when the bug is fixed."""

    def setUp(self):
        mock_js.bridge_mock.install()

    @unittest.expectedFailure
    def test_runloop_until_polls_predicate(self):
        # Per LEGO docs: runloop.until(pred) awaits until pred() is truthy.
        # Today: returns _NoopAwaitable immediately.
        counter = [0]
        def pred(): counter[0] += 1; return counter[0] >= 3
        import asyncio
        asyncio.run(sb.runloop.until(pred, timeout=1000))
        self.assertGreaterEqual(counter[0], 3)
```

- [ ] **Step 2: Run, verify expected-failures show as `expected failures` in unittest output (suite still OK)**

- [ ] **Step 3: Commit**

---

## Task 7 — Report

**Files:**
- Create: `docs/audits/2026-05-16-test-fidelity-uplift-report.md`
- Create: `docs/audits/2026-05-16-test-fidelity-uplift-report.html`

Contents:
- What changed in functionality (steering applied, encoder tracked, hub_image renders)
- What changed in tests (round-trip harness, N stub-pins flipped, M new behaviour tests)
- Severity-table delta from 2026-05-13 (before / after)
- Honest "what we didn't fix and why"
- Pointer to the round-trip harness as the unlock for future fixes

- [ ] **Step 1: Write md report**
- [ ] **Step 2: Write HTML companion (same structure as 2026-05-16-test-fidelity-by-layer.html — reuse the style block)**
- [ ] **Step 3: Final commit**

---

## Done criteria

- [ ] `python3 tests/py/run.py` passes (+ any `expected failures` reported, suite OK)
- [ ] `node --test "tests/js/**/*.test.js"` passes (461 + new round-trip tests)
- [ ] `node --test "tests/js/integration/**/*.test.js"` passes
- [ ] At least 3 round-trip tests proving Python→sim→read-back
- [ ] At least 3 simulator bugs fixed (steering, encoder, hub_image)
- [ ] At least 2 stub-pin tests converted to behaviour-grade
- [ ] At least 1 expectedFailure marker tracking a known un-fixed bug
- [ ] Report saved to `docs/audits/`

## Risks / fallbacks

- **MicroPython-in-Node hits a setup wall.** Fallback: pyodide (npm install pyodide, official Node support). Lose runtime parity with browser; note in report.
- **Round-trip harness flaky on Node version.** Fallback: pin runtime via README note.
- **Encoder tracking turns out to be more invasive than expected.** Acceptable to ship steering + hub_image fixes and defer encoder; mark encoder gap as expectedFailure.

When done, exit worktree with `action: keep` so the branch survives for review.
