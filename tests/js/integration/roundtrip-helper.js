'use strict';

// Python ↔ JS round-trip test harness.
//
// Builds a real RobotSimulator (via the existing tests/js/sim-helper.js vm
// context) and a MicroPython interpreter (via the same WASM build the browser
// uses), then wires Python's `js.bridgeSend(...)` straight to
// `sim.executeCommand(...)`. Single Node event loop, no threads, no workers.
//
// Why bypass the worker shim:
//   spike_bridge.py:11 runs `js.eval("<worker shim>")` at import time. That
//   shim posts messages to a main thread that doesn't exist in tests. We
//   override `js.eval` to a no-op so the shim never installs, and provide our
//   own wired `bridgeSend` on the `js` module the bridge actually calls.
//
// User-code shape expected by runUserCode():
//   async def main():
//       motor_pair.pair(0, port.A, port.B)
//       await motor_pair.move_for_degrees(0, 360, 0, velocity=500)
//   runloop.run(main())
//
// The harness awaits the resulting `_user_coro` so the JS Promises that
// `_bridge_call` returns get a chance to resolve against the simulator.

const fs   = require('node:fs');
const path = require('node:path');
const { createSim } = require('../sim-helper');
const { loadPythonRuntime } = require('./micropython-loader');

const BRIDGE_PATH = path.resolve(__dirname, '..', '..', '..', 'py', 'spike_bridge.py');
const BRIDGE_SRC  = fs.readFileSync(BRIDGE_PATH, 'utf8');

// Kinematic-integrating physics stub for round-trip tests. Real Box2D isn't
// loaded in the vm context that sim-helper builds, so `_animateTank`'s
// `if (!this.physics) return` short-circuits all motion. We provide a stub
// that integrates the velocities `_animateTank` writes via setKinematicVelocity,
// returning an updated pose from readPose each step. The motion is real, just
// not driven by Box2D — adequate for testing dispatch + sensor read-back
// correctness, which is what the audit flagged.
function installKinematicPhysics(sim) {
  let pose = {
    x:     sim.robot.x,
    y:     sim.robot.y,
    angle: sim.robot.heading * Math.PI / 180,
  };
  let lastV = { vx: 0, vy: 0, angVel: 0 };

  sim.physics = {
    setKinematicVelocity: (_body, vx, vy, angVel) => {
      lastV = { vx, vy, angVel };
    },
    step: (dt_s) => {
      pose.x     += lastV.vx     * dt_s;
      pose.y     += lastV.vy     * dt_s;
      pose.angle += lastV.angVel * dt_s;
      return { force_impulses: {} };
    },
    readPose: () => ({ x: pose.x, y: pose.y, angle: pose.angle }),
    castRay:  () => ({ hit: false }),
  };
  sim.robotBody     = { GetAngle: () => pose.angle };
  sim._physicsReady = Promise.resolve();
}

async function makeRoundtrip() {
  const sim = createSim();
  installKinematicPhysics(sim);
  sim.isRunning = true;

  const jsModule = {
    // Skip the worker shim — we wire bridgeSend directly below.
    eval: () => {},

    // The hot path: every Python motion / sensor call lands here.
    // Returns a JSON string the bridge parses into _state.
    bridgeSend: async (cmdJson) => {
      if (process.env.RT_DEBUG) {
        console.log('[bridgeSend]', cmdJson);
      }
      sim.isRunning = true;
      const cmd    = JSON.parse(cmdJson);
      const result = await sim.executeCommand(cmd);
      if (process.env.RT_DEBUG) {
        console.log('[bridgeReply]', JSON.stringify(result));
      }
      return JSON.stringify(result);
    },

    // Worker-protocol no-ops.
    signalDone:       () => {},
    signalError:      (msg) => { throw new Error('[py-error] ' + msg); },
    addEventListener: () => {},
  };

  const mp = await loadPythonRuntime({ jsModule });

  // Load the bridge as a top-level script. Its class definitions land in the
  // global namespace, so user code can reference `motor_pair`, `motor`,
  // `runloop`, `port` etc. without imports — same surface as in the browser.
  await mp.runPythonAsync(BRIDGE_SRC);

  /**
   * Execute Python source that defines `main()` and calls `runloop.run(main())`.
   * The helper awaits the resulting coroutine on the asyncio loop so JS
   * Promises returned from `_bridge_call` actually resolve.
   */
  async function runUserCode(src) {
    mp.runPython('_user_coro = None');
    await mp.runPythonAsync(src);
    await mp.runPythonAsync(
      'if _user_coro is not None:\n' +
      '    await _user_coro\n',
    );
  }

  function getGlobal(name) {
    return mp.globals.get(name);
  }

  return { sim, mp, runUserCode, getGlobal };
}

module.exports = { makeRoundtrip };
