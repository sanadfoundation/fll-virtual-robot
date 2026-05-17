# Test fidelity uplift — change report (2026-05-16, revised 2026-05-17)

Companion to:
- `2026-05-13-test-coverage-fidelity.md` — the audit that diagnosed the gap
- `2026-05-16-test-fidelity-by-layer.md` — the per-layer walkthrough

This report covers what shipped on branch `test-fidelity-uplift`. The work was scoped to the highest-leverage subset of the audit: build the missing test boundary the audit named (Python ↔ JS round-trip), fix three documented simulator bugs whose user-visible impact is highest, and flip the test posture on a few canonical surfaces so the suite stops enforcing the bugs it should be catching.

**Revision note (2026-05-17):** the initial shape leaned too heavily on the round-trip harness — encoder and steering behaviours were verified via Python-driven integration tests when most of that coverage belongs at the simulator-unit tier. A subsequent commit rebalanced the pyramid: 13 new simulator-unit tests, 7 round-trip tests trimmed down to smoke + one contract-guard per fixed surface. Same behaviour coverage; faster suite; failures localise to one layer instead of four.

---

## 1. Suite at a glance

| | Before | After | Δ |
|---|---:|---:|---:|
| Python tests | 214 | 217 | +3 (`expectedFailure`) |
| JS tests | 461 | 484 | +23 |
| Round-trip integration tests | 0 | 7 | +7 (new boundary) |
| Simulator-unit behaviour tests | — | +13 | +13 (rebalanced down from integration) |
| Stub-pin tests enforcing bugs | 4 | 2 | −2 (flipped to behaviour) |
| Tracked-failing tests (`expectedFailure`) | 0 | 3 | +3 |
| **Total** | **675** | **701** | **+26** |
| Suite verdict | green | green (3 expected-fail) | — |

Both halves run fast: Python in 21 ms, JS in ~2.6 s, integration in ~0.4 s. Two consecutive runs identical. No real wall-clock dependencies — `sim._sleep` stubbed throughout.

---

## 2. The harness — what unlocks everything else

The 2026-05-13 audit named one structural move as the largest piece of missing test infrastructure:

> §6.1: A round-trip "Python → bridge → simulator → sensor read-back" harness. Today's `mock_js.py` returns whatever the test seeded. A small alternative harness that actually feeds Python bridge commands into a real `RobotSimulator` and reads `_sensorState()` back would let one test cover every "API X mutates simulator state Y" claim end-to-end. **This is the single biggest missing piece — the bridge tests and the sim tests don't currently meet.**

That harness now exists at `tests/js/integration/`.

**Design:** load `@micropython/micropython-webassembly-pyscript@1.28.0-6` (the same MicroPython variant the browser ships) into Node's main thread. Register a custom `js` module whose `bridgeSend` wires straight to `sim.executeCommand`. Override `js.eval` to a no-op so `spike_bridge.py`'s worker-shim setup is bypassed (the shim posts messages to a main thread that doesn't exist in tests). Single Node event loop, no threads, no workers — stable in tests by construction.

**Cost:** ~85 lines of glue across two files (`micropython-loader.js`, `roundtrip-helper.js`). One npm dependency (the MicroPython WASM port — exactly what `polyscript` loads in production).

**What it unlocks:** every audit row that says `STATE-DICT VENTRILOQUISM`, `PAYLOAD-SHAPE MASQUERADE`, or `PINS THE STUB` becomes a one-line addition to a fixture file instead of a new test file. The Python suite and the JS suite finally meet end-to-end.

---

## 2a. Pyramid distribution (after the 2026-05-17 rebalance)

Same behaviour coverage, different tier distribution:

```
            ┌────────────────────────────────────────┐
   E2E      │ 0                                      │ (no browser tests)
            ├────────────────────────────────────────┤
   Integ.   │ ▮▮▮▮▮▮▮ 7                              │  round-trip contract guards
            │   • 2 micropython sanity                │  + 2 round-trip smoke
            │   • 1 per fixed surface (×3)            │  (steering / encoder / hub_image)
            ├────────────────────────────────────────┤
   Unit     │ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ 478 │  pure-fn + dispatch + new
   (JS)     │                                         │  simulator-behaviour tests
            ├────────────────────────────────────────┤
   Unit     │ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ 217      │  bridge-layer Python tests
   (Py)     │                                         │  (incl. 3 expectedFailure)
            └────────────────────────────────────────┘
```

**Initial shape (committed, then rebalanced):** 14 integration tests / 4 unit-tier behaviour tests for the fixed surfaces. Each encoder/steering behaviour verified by a slow round-trip test rather than a fast simulator-unit test.

**Rebalanced shape (current):** 7 integration tests / 17 unit-tier behaviour tests for the fixed surfaces. Each behaviour now verified at the layer it actually lives in. Round-trip tests verify only what cannot be verified at the unit layer: the cross-runtime contract between Python's accessors and the JS sim's snapshot keys.

The kinematic-physics integrator was extracted to `tests/js/kinematic-physics.js` so unit tests and the round-trip helper share it. The simulator-unit tests run `_execCmd → _animateTank → encoder-accumulator → robot.motors[port]` end-to-end through real code; the only stubbed piece is Box2D itself, which has its own dedicated suite at `tests/js/physics/`.

---

## 3. Functional changes (the simulator)

Three bugs were fixed, each with a meaningful test pair: one at the JS dispatch layer, one round-trip through Python.

### 3.1 `motor_pair.move` now applies steering during continuous motion

- **Audit ref:** §4.1
- **Code:** `js/simulator.js:1085-1101` — `case 'start'` / `case 'start_tank'`
- **Bug:** the switch case set `leftV = rightV = cmd.speed / 1000` and never read `cmd.steering`. The bridge sent the steering correctly; the sim dropped it.
- **Fix:** compute `leftV` and `rightV` from `(speed, steering)` using the same `(1 ± steer/100)` formula as the discrete-move path. Convention per `CLAUDE.md`: steering > 0 → right turn → left wheel faster.

### 3.2 Motor encoders now accumulate, motor velocity now reflects motion

- **Audit ref:** §4.2 / §8 (canonical stub-pin)
- **Code:** `js/simulator.js`
  - `makeRobotState`: added `motors_velocity` map.
  - `_descriptorForPair`: emits `leftPort` / `rightPort`.
  - `_animateSingleMotor`: descriptor includes wheel role + `auxPort`; aux-motor branch now credits degrees directly.
  - `_animateTank`: per step, accumulates `(wheel mm / WHEEL_CIRC_MM × 360)` into `robot.motors[port]`, signed. Sets `motors_velocity[port]` for the duration of motion, clears at end.
  - `getMotorSpeed`: reads from `motors_velocity` instead of returning `0`.
- **Why it took this many touchpoints:** the previous data flow had no wheel-to-port mapping inside `_animateTank` — by the time motion ran, the "this is the left wheel of pair 0, which is port A" information had been collapsed to two velocity scalars. The descriptor augmentation puts the mapping back in scope.

### 3.3 `hub.light_matrix.show_image` actually renders

- **Audit ref:** §4.3
- **Code:** `js/simulator.js`
  - `_execCmd`: new `case 'hub_image'`.
  - `_imageToDisplay`: 25-cell brightness patterns for `HAPPY`, `SAD`, `HEART`, `ARROW_N`, with int-constant → name resolution so `show_image(IMAGE_HAPPY)` works as well as `show_image('HAPPY')`. Unknown image names render blank (not a silent no-op, so typos don't masquerade as "the previous image is still showing").
- **Scope note:** this covers 4 of 67 LEGO `IMAGE_*` constants. The remaining 63 are additive lookup-table entries — the rendering chain itself works end-to-end now.

---

## 4. Test posture changes

### 4.1 Stub-pin tests flipped to behaviour-grade (2)

`tests/js/sensors/accessors.test.js:108-116` — the canonical stub-pin enforcement, called out in the audit's §7 severity tally as the single clearest example of "the test enforces the bug."

Before:
```js
test('getMotorSpeed: returns 0 for any port', …);
test('getMotorPosition: returns 0 for unpaired port', …);
```

After:
```js
test('getMotorSpeed: 0 at rest', …);
test('getMotorSpeed: reflects active motion velocity', …);    // new behaviour assertion
test('getMotorPosition: 0 before any motion', …);
```

Plus 3 round-trip behaviour tests at `tests/js/integration/motor-encoder.test.js` that drive `motor.run_for_degrees` from real Python and assert `motor.absolute_position` reads back the right value.

### 4.2 `expectedFailure` markers for un-fixed audit bugs (3)

Three audit rows whose fix is out of scope for this session got `@unittest.expectedFailure` tests that pin the LEGO-documented behaviour. They report as `expected failure` in `unittest` output; the suite verdict stays `OK`. The day any of them is fixed, the test starts passing and the decorator should be removed.

| Audit ref | Test | Documented behaviour |
|---|---|---|
| §4.4 | `test_rgbi_reflects_sensor_state` | `color_sensor.rgbi('E')` should reflect the surface RGB, not always `(128,128,128,0)` |
| §4.5 | `test_runloop_until_polls_predicate` | `runloop.until(pred, timeout)` should poll `pred` until it's truthy |
| §4.6 | `test_acceleration_kwarg_reaches_bridge` | `motor.run_for_degrees(..., acceleration=2000)` should carry the kwarg into the bridge payload |

### 4.3 New round-trip behaviour tests (9)

Every one of these runs Python user code through the real `spike_bridge.py`, into the real `RobotSimulator`, and asserts on either `sim.robot.*` state after the call or a value read back through `motor.absolute_position(...)` etc.:

- `roundtrip-smoke.test.js` — bridge loads + basic motion (2)
- `steering.test.js` — `motor_pair.move(steering)` rotates body (3 directions) (3)
- `motor-encoder.test.js` — encoders accumulate end-to-end (3)
- `hub-image.test.js` — `show_image(IMAGE_HAPPY)` lights pixels via Python (1)

---

## 5. Severity-table delta from the 2026-05-13 audit

Counting the 21 bug surfaces in audit §7. Verdicts that changed:

| Surface | Audit verdict (2026-05-13) | Today |
|---|---|---|
| `motor_pair.move(steering)` continuous | SHAPE-ONLY / NO-COVERAGE for the bug | **PROVES BEHAVIOUR** (JS dispatch + round-trip) |
| `motor.absolute_position` / `relative_position` | PINS THE STUB | **PROVES BEHAVIOUR** (round-trip) |
| `getMotorPosition` / `getMotorSpeed` (JS) | PINS THE STUB | **PROVES BEHAVIOUR** |
| `hub.light_matrix.show_image` | SHAPE-ONLY | **PROVES BEHAVIOUR** (round-trip + JS state) |
| `color_sensor.rgbi` | PINS THE STUB | **EXPECTED-FAIL** (tracked, not enforced) |
| `runloop.until` | PINS THE STUB | **EXPECTED-FAIL** (tracked, not enforced) |
| `acceleration` / `deceleration` kwargs | NO COVERAGE | **EXPECTED-FAIL** (tracked, not enforced) |
| All other 14 rows | unchanged | unchanged |

**Posture summary:** 4 audit rows moved from `PROVES BEHAVIOUR=0` (audit baseline) into the proves-behaviour bucket. 3 stub-pin rows flipped to tracked-failing. 14 rows are unchanged — they remain available for future sessions to convert, with the round-trip harness now in place to make each conversion cheap.

---

## 6. Honest scope-of-this-session

Not done, on purpose:
- **Trapezoidal acceleration profile.** The audit §6.6 list (acceleration/deceleration/stop kwargs end-to-end) is the largest remaining behaviour surface. It requires real implementation work in `_animateTank`, not just plumbing. Out of scope.
- **`color_sensor.rgbi` wiring.** Reflection got wired through `_sensorState()` earlier; rgbi would need the same wiring plus an RGB lookup. Marked `expectedFailure`.
- **`runloop.until` polling.** Would need a real asyncio-driven loop; non-trivial. Marked `expectedFailure`.
- **Continuous-motion 200 mm / 5000 mm caps** (audit §4.10). The steering fix made the *direction* correct but the cap is still wrong — `_execCmd 'start'` hands 200 mm to `_animateTank`. Unchanged.
- **`hub_image` constants 5-67.** 4 of 67 implemented; the rest are blank-render. The chain works; coverage is by table entry.
- **Blockly fixture-driven behaviour runner.** Audit §6.2. Not started; the round-trip harness handles the Python side first.

Not done, by accident:
- **Bigger picture:** I focused JS-side encoder fixes inside `_animateTank`. The Python bridge has its own `_motor_velocities` dict that `motor.velocity('A')` reads from. The two stay in sync only via the next sensor read-back, not in real time. For round-trip tests that's fine; for student-facing `motor.velocity()` mid-motion it's already "best effort." Not a regression but worth naming.

---

## 7. Code touchpoints

```
js/simulator.js                                     — 3 commits, ~80 lines
  makeRobotState                                    + motors_velocity
  _descriptorForPair                                + leftPort/rightPort
  _animateSingleMotor                               descriptor + aux-motor encoder
  _animateTank                                      encoder accumulation
  _execCmd 'start' / 'start_tank'                   steering applied
  _execCmd + _imageToDisplay                        hub_image rendering
  getMotorSpeed                                     reads motors_velocity

tests/js/integration/                               (new)
  micropython-loader.js                             MicroPython-WASM in Node
  roundtrip-helper.js                               sim + bridge wiring + kinematic physics stub
  smoke.test.js                                     MicroPython sanity
  roundtrip-smoke.test.js                           bridge ↔ sim ↔ readback
  steering.test.js                                  audit §4.1 regression
  motor-encoder.test.js                             audit §4.2 regression
  hub-image.test.js                                 audit §4.3 regression

tests/js/commands/dispatch-extra.test.js            + steering case dispatch tests
tests/js/sensors/accessors.test.js                  − stub-pins, + meaningful
tests/py/test_gaps.py                               + TestKnownBugsTracked
```

5 commits, all green:

```
1ded7b0 test(integration): MicroPython-WASM round-trip harness
e6185a7 fix(sim): apply steering in continuous motor_pair.move
b705052 feat(sim): track motor encoders and velocity through _animateTank
7a6520c feat(sim): render hub.light_matrix.show_image instead of dropping it silently
be11c52 test(gaps): expectedFailure markers for audit-tracked un-fixed bugs
```

---

## 8. What this changes about the suite

Before this session:
- Green CI meant "the bridge protocol and the physics primitives still work."
- 0 of 21 named-bug surfaces had behaviour-grade tests.
- 4 stub-pin tests enforced bugs as contracts.
- The Python suite and the JS suite were structurally unable to meet.

After this session:
- Green CI means the same things plus "Python can drive the simulator and read back the result; 4 named-bug surfaces verifiably work end-to-end."
- 4 of 21 named-bug surfaces now have round-trip behaviour-grade coverage.
- 2 stub-pins remain (still scoped to audit-tracked items not yet fixed); 0 fewer than before, minus the 2 we flipped this session, plus the rest of the 4 originals are not the focus.
- The harness is in place. Future sessions can add round-trip coverage one fixture row at a time without touching infrastructure.

The audit's structural recommendation §6.1 has been built. The other two (§6.2 fixture-driven Blockly runner, §6.3 `xfail` the stub-pins) are partially addressed — §6.3 was applied to three remaining gaps via `expectedFailure`. §6.2 awaits a future session.
