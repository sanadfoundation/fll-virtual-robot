# Execution Model Redesign — Design Spec

**Date:** 2026-05-02  
**Status:** Approved for implementation planning  
**Motivation:** Enable real-time physics and reactive sensor programs by making Python and the simulation run concurrently, matching the behaviour of code running on a physical Spike Prime hub.

---

## Background

The current model executes Python synchronously on the main browser thread. Every API call appends a command to `_cmds[]`. When Python finishes, the full command list is handed to `sim.playQueue()` for animation. A shadow robot pre-projects sensor state so sensor reads during Python execution return approximately correct values.

This approach has a hard ceiling: the robot cannot react to physics mid-program (collision with a mission model, a move that ends early), `time.sleep()` does not interleave with the simulation, and infinite or unbounded loops hang the browser.

The 3D LDraw feature (captured in BACKLOG.md) is blocked on this redesign — real physics requires Python and the simulation to be concurrent.

---

## Goal

Python programs run identically to code on the physical Spike Prime hub:

- `motor_pair.move(...)` blocks until the move completes (or is stopped by collision)
- `time.sleep(2)` elapses as 2 real seconds during animation
- `while color_sensor.color() != 'black': motor_pair.move(...)` loops correctly, reading the real current sensor state after each step
- A program that drives into a mission model stops at the model boundary; subsequent sensor reads reflect the actual stopped position
- Infinite loops are safe (the simulation terminates them via Stop)

Student program syntax is **unchanged** — no `async`, no `yield`, no wrappers beyond what Spike Prime v3 already uses (`async def main()` / `runloop.run(main())`).

---

## Approach: Web Worker + SharedArrayBuffer + Atomics

MicroPython (via PyScript) moves into a Web Worker. The main thread owns physics and animation. A 5 KB `SharedArrayBuffer` is the communication channel. `Atomics.wait()` in the worker truly blocks Python between commands without freezing the main thread.

Cross-Origin Isolation (required for `SharedArrayBuffer`) is enabled via `coi-serviceworker.js` — a ~2 KB script that registers a browser-side service worker injecting `COOP` and `COEP` headers. No server changes required; `python3 -m http.server` continues to work.

---

## Architecture

```
┌──────────────────────────────┐   SharedArrayBuffer (5 KB)   ┌──────────────────────────────┐
│  Web Worker                  │                               │  Main Thread                 │
│                              │  [flag | cmd_len | result_len]│                              │
│  spike_bridge.py             │                               │  simulator.js                │
│                              │                               │                              │
│  motor_pair.move(...)        │  1. write cmd JSON ─────────► │  commandLoop()               │
│    _bridge_call(cmd)         │                               │    reads cmd                 │
│      Atomics.wait() ●────────┼── blocks ──────────────────  │    _animateTank() via rAF    │
│                              │                               │    AABB collision check      │
│      wakes up   ◄────────────┼── write result + notify ───  │    writes sensor state       │
│      reads result            │                               │                              │
│      call returns            │                               │                              │
└──────────────────────────────┘                               └──────────────────────────────┘
```

---

## SharedArrayBuffer Protocol

**Buffer layout (5132 bytes total)**

| Byte offset | Type        | Name           | Purpose                              |
|-------------|-------------|----------------|--------------------------------------|
| 0           | Int32       | `flag`         | `0` = idle, `1` = command pending    |
| 4           | Int32       | `cmd_len`      | byte length of command JSON          |
| 8           | Int32       | `result_len`   | byte length of result JSON           |
| 12          | Uint8[4096] | `cmd_payload`  | command JSON (UTF-8)                 |
| 4108        | Uint8[1024] | `result_payload` | result JSON (UTF-8)                |

**Command lifecycle**

```
Worker (Python)                        Main thread (JS)
───────────────────────────────────────────────────────
write cmd JSON into cmd_payload
store cmd_len
store flag = 1
Atomics.notify(flag)          ──────►  Atomics.waitAsync wakes
                                        read cmd_payload
Atomics.wait(flag, 1)         ◄──────  run animation + physics
  (blocks worker thread)               write result JSON
                                        store result_len
                                        store flag = 0
                                        Atomics.notify(flag)
wakes ("not-equal" or "ok")
read result_payload
API call returns
```

`Atomics.wait(flag, 1)` returns immediately ("not-equal") if flag is already 0 when called — no race condition.

**Command JSON shapes (Python → JS)**

```json
{ "type": "move",         "speed": 500, "unit": "degrees", "amount": 360, "steering": 0 }
{ "type": "move_tank",    "left_speed": 500, "right_speed": -500, "unit": "degrees", "amount": 180 }
{ "type": "start",        "speed": 500, "steering": 0 }
{ "type": "start_tank",   "left_speed": 500, "right_speed": 500 }
{ "type": "stop" }
{ "type": "motor_degrees","port": "A", "degrees": 360, "velocity": 500 }
{ "type": "motor_time",   "port": "A", "time_ms": 1000, "velocity": 500 }
{ "type": "motor_run",    "port": "A", "velocity": 500 }
{ "type": "motor_stop",   "port": "A" }
{ "type": "pair",         "pair_id": 1, "left": "A", "right": "B" }
{ "type": "wait",         "ms": 2000 }
{ "type": "hub_display",  "text": "Hi" }
{ "type": "hub_display_off" }
{ "type": "hub_pixel",    "x": 2, "y": 2, "brightness": 100 }
{ "type": "beep",         "note": 60, "duration": 0.5 }
{ "type": "print",        "text": "hello" }
{ "type": "read_sensors" }
```

**Result JSON shape (JS → Python, after every command)**

```json
{
  "x": 351.2,
  "y": 940.5,
  "heading": -90.0,
  "color": "black",
  "distance_mm": 148.0,
  "motors": { "A": 0, "B": 720, "C": 0, "D": 0, "E": 0, "F": 0 },
  "stopped": false
}
```

`"stopped": true` is written when the user clicks Stop. Python reads it and raises `SystemExit`.

---

## `spike_bridge.py` Changes

**Removed**
- `_cmds = []` and `_push()` 
- All `js.window.sim.shadowCmd()` calls
- `js.window.receiveCommands(js.JSON.stringify(_cmds))` at end of execution
- All direct `js.window.sim.getXxx()` sensor accessor calls

**New core: `_bridge_call(cmd)`**

```python
_flag_view  = None   # Int32Array  over SAB bytes 0–11
_cmd_buf    = None   # Uint8Array  over SAB bytes 12–4107
_result_buf = None   # Uint8Array  over SAB bytes 4108–5131
_state      = {}     # cache of last result from any command

def _bridge_call(cmd):
    from js import Atomics
    import json

    cmd_bytes = json.dumps(cmd).encode('utf-8')
    for i, b in enumerate(cmd_bytes):
        _cmd_buf[i] = b

    Atomics.store(_flag_view, 1, len(cmd_bytes))   # cmd_len
    Atomics.store(_flag_view, 0, 1)                # flag = command pending
    Atomics.notify(_flag_view, 0, 1)               # wake main thread
    Atomics.wait(_flag_view, 0, 1)                 # block until flag != 1

    result_len = Atomics.load(_flag_view, 2)
    result_bytes = bytes(_result_buf[i] for i in range(result_len))
    _state.update(json.loads(result_bytes.decode('utf-8')))

    if _state.get('stopped'):
        raise SystemExit
```

**API methods** change from `_push({...})` to `_bridge_call({...})`. Call signatures visible to student programs are unchanged.

**Sensor accessors** read from `_state` cache — no round-trip needed:

```python
def color(self):
    return _state.get('color', 'none')

def get_distance_cm(self):
    return _state.get('distance_mm', 300) / 10
```

`_state` is pre-populated via an automatic `read_sensors` call in `_init_bridge()` so sensor reads before any move command return the robot's starting state.

**`_init_bridge(sab)`**

```python
def _init_bridge(sab):
    global _flag_view, _cmd_buf, _result_buf, _state
    from js import Int32Array, Uint8Array
    _flag_view  = Int32Array.new(sab)            # indices 0,1,2 = flag, cmd_len, result_len
    _cmd_buf    = Uint8Array.new(sab, 12, 4096)
    _result_buf = Uint8Array.new(sab, 4108, 1024)
    _state      = {}
    _bridge_call({'type': 'read_sensors'})       # pre-populate _state
```

**Worker message handler** (bottom of `spike_bridge.py`):

```python
import js

def _on_message(event):
    data = event.data.to_py()
    if data['type'] == 'sab':
        _init_bridge(data['sab'])
        js.postMessage({'type': 'ready_ack'})
    elif data['type'] == 'run':
        try:
            exec(data['code'], {})
            js.postMessage({'type': 'done'})
        except SystemExit:
            js.postMessage({'type': 'done'})
        except Exception as e:
            js.postMessage({'type': 'error', 'message': str(e)})

js.addEventListener('message', _on_message)
js.postMessage({'type': 'ready'})
```

---

## `simulator.js` Changes

**Removed**
- `receiveCommands()`, `cmdQueue`
- `playQueue()`
- Entire shadow robot subsystem: `resetShadow()`, `shadowCmd()`, `_shadowExecCmd()`, `_shadowApplyTank()`, `_shadowApplyMotor()`, `_shadowFindPairForPort()`, `_shadowUpdateSensors()`, `this.shadowRobot`, `this.shadowPairMap`
- All `window.shadowCmd`, `window.resetShadow`, `window.getXxx` sensor bridges in `main.js`

**Added: `setupSAB(sab)`**

```javascript
setupSAB(sab) {
  this._sab            = sab;
  this._stopRequested  = false;
  this._missionBoxes   = [];   // populated later when 3D mission models are added
  this._commandLoop();
}
```

**Added: `_commandLoop()`**

```javascript
async _commandLoop() {
  const flagView  = new Int32Array(this._sab);
  const resultBuf = new Uint8Array(this._sab, 4108, 1024);
  const enc       = new TextEncoder();
  const dec       = new TextDecoder();

  while (true) {
    await Atomics.waitAsync(flagView, 0, 0).value;
    if (Atomics.load(flagView, 0) !== 1) continue;

    const cmdLen   = Atomics.load(flagView, 1);
    const cmd      = JSON.parse(dec.decode(new Uint8Array(this._sab, 12, cmdLen)));
    const result   = this._stopRequested
      ? { ...this._sensorState(), stopped: true }
      : await this._execCmd(cmd).then(() => this._sensorState());

    const bytes = enc.encode(JSON.stringify(result));
    resultBuf.set(bytes);
    Atomics.store(flagView, 2, bytes.length);
    Atomics.store(flagView, 0, 0);
    Atomics.notify(flagView, 0, 1);
  }
}
```

**Added: `_sensorState()`**

```javascript
_sensorState() {
  const r = this.robot;
  return {
    x: r.x, y: r.y, heading: r.heading,
    color: r.sensors.colorValue,
    distance_mm: r.sensors.distanceMM,
    motors: { ...r.motors },
    stopped: false,
  };
}
```

**Modified: `_animateTank()`** — AABB collision check added inside the per-step loop:

```javascript
// after computing new x/y from heading + avg:
const prev = { x: this.robot.x, y: this.robot.y };
this.robot.x += Math.cos(headRad) * avg;
this.robot.y += Math.sin(headRad) * avg;

for (const box of this._missionBoxes) {
  if (this._robotOverlapsAABB(this.robot, box)) {
    this.robot.x = prev.x;
    this.robot.y = prev.y;
    return;   // stop move early; result will reflect actual stopped position
  }
}
```

`_robotOverlapsAABB` treats the robot as a circle with radius 90 mm for simplicity. `_missionBoxes` is empty by default — no effect until the 3D feature populates it.

---

## `index.html` Changes

```html
<head>
  <!-- MUST be first script — registers service worker, reloads once,
       then injects COOP + COEP headers on every subsequent load -->
  <script src="https://cdn.jsdelivr.net/gh/gzuidhof/coi-serviceworker@v0.1.7/coi-serviceworker.min.js"></script>

  <!-- existing CDN scripts unchanged -->

  <!-- worker attribute moves MicroPython off the main thread -->
  <script type="mpy" worker src="py/spike_bridge.py"></script>
</head>
```

---

## `main.js` Changes

**Bootstrap sequence:**

```
DOMContentLoaded
  │
  ├─ create SharedArrayBuffer(5132)
  ├─ sim.setupSAB(sab)              → commandLoop starts, waiting
  ├─ PyScript loads worker, runs spike_bridge.py
  │     spike_bridge.py posts {type:'ready'}
  ├─ main.js receives 'ready'
  │     posts {type:'sab', sab} to worker
  │     worker: _init_bridge(sab), fires read_sensors, posts {type:'ready_ack'}
  └─ main.js receives 'ready_ack'   → window.onPyReady() → Run button unlocked
```

**`runPython()` simplified:**

```javascript
async function runPython() {
  if (!pyReady) { /* warn */ return; }
  clearOutput();
  setButtons(true);
  sim._stopRequested = false;
  pyWorker.postMessage({ type: 'run', code: editor.getValue() });
  // done/error arrive via worker message listener (see below)
}
```

**Worker message listener added to `main.js`:**

PyScript 2024.x exposes the worker element's JS handle via `document.querySelector('script[type="mpy"][worker]').xworker` (the `xworker` property is set by PyScript after the worker is initialised). Store this as `pyWorker` and use it for `postMessage` / `addEventListener`.

```javascript
// wired up after PyScript exposes pyWorker handle
pyWorker.addEventListener('message', ({ data }) => {
  if (data.type === 'done') {
    appendOutput('[Done] Simulation complete.', 'info');
    setButtons(false);
  } else if (data.type === 'error') {
    appendOutput('[Error] ' + data.message, 'error');
    setButtons(false);
  }
});
```

**`handleStop()` updated:**

```javascript
function handleStop() {
  sim._stopRequested = true;
  sim.isRunning = false;   // _animateTank breaks at its next per-step check
  // commandLoop finishes the in-progress _execCmd naturally, then writes
  // {stopped:true} as the result — Python wakes and raises SystemExit cleanly
  setButtons(false);
  appendOutput('[Stopped]', 'warn');
}
```

No direct SAB writes in `handleStop` — the commandLoop owns the write side of the protocol.

**Removed from `main.js`:** `window.receiveCommands`, `window.shadowCmd`, `window.resetShadow`, all `window.getXxx` sensor bridges.

---

## Blockly — No Changes

Blockly already runs step-by-step via `AsyncFunction` on the main thread, calling `sim._animateTank()` directly. The AABB collision detection added to `_animateTank()` will benefit Blockly automatically. No changes to `blockly_config.js`.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Python raises unhandled exception | Worker posts `{type:'error', message}`; main thread shows in console; SAB flag auto-resets to 0 when commandLoop gets next waitAsync cycle |
| User clicks Stop mid-move | `sim._stopRequested = true`; SAB notified; Python wakes, sees `stopped:true`, raises `SystemExit`; worker posts `done` |
| User clicks Reset | `sim.reset()` resets robot state; worker re-posted `{type:'sab', sab}` to reinitialise `_state` and refill it via `read_sensors` |
| coi-serviceworker not yet active (first ever load) | Page reloads once automatically; user sees a flash then normal load |

---

## Testing

Existing JS tests (`tests/js/`) cover physics math and command dispatch — these remain valid. The shadow robot tests (`shadow-*.test.js`) are deleted as the shadow subsystem is removed.

New tests needed:
- SAB protocol round-trip: write cmd → read result, correct flag transitions
- `_animateTank` collision stop: robot stops at AABB boundary, returns early
- `_sensorState()` returns correct values after a move
- Python integration: `while color != 'black': move(small step)` terminates at the correct position

---

## Files Changed Summary

| File | Action |
|---|---|
| `index.html` | Add `coi-serviceworker.js`; add `worker` to PyScript tag |
| `py/spike_bridge.py` | Replace `_cmds`/shadow with `_bridge_call()`; add worker message handler |
| `js/simulator.js` | Remove shadow subsystem + playQueue; add `setupSAB`, `_commandLoop`, `_sensorState`, AABB collision |
| `js/main.js` | Simplify `runPython`; add worker message listener; update `handleStop`/`handleReset`; remove sensor bridges |
| `tests/js/shadow/*.test.js` | Delete (shadow subsystem removed) |

No new files. No changes to `blockly_config.js` or `autocomplete.js`.
