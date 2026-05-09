'use strict';

// Pure-function kinematics layer. Lives between the Spike command bridge and
// the physics engine. Nothing in this file touches Box2D, the DOM, or the
// canvas — every function is referentially transparent and unit-testable.
//
// Loadable both as a browser <script> (assigns to window.kinematics) and as a
// Node CommonJS module (module.exports). The same source is used in both
// environments — no build step.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.kinematics = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Spike `move` command splits a normalised speed (-1..1) and steering
  // (-1..1) into per-wheel speeds. Steering > 0 is a right turn = left wheel
  // faster (CLAUDE.md). Negative speeds run wheels in reverse.
  function steeringToWheels(speedNorm, steerNorm) {
    return {
      leftV:  speedNorm * (1 + steerNorm),
      rightV: speedNorm * (1 - steerNorm),
    };
  }

  // Per-frame command shape sent to the kinematic robot body. Returns the
  // world-frame linear velocity (mm/s) and angular velocity (rad/s) given
  // current normalised wheel speeds and the body's current heading.
  //
  // Math y-up convention: right turn = left wheel faster ⇒ rightSpd-leftSpd < 0
  // ⇒ angVel < 0 ⇒ heading decreases (CW = math-negative). vx/vy use cos/sin
  // of heading directly; the trig works in either y convention as long as
  // heading sign agrees with y direction (it does, in both conventions).
  function wheelsToBodyVelocity(leftV, rightV, headingRad, speedMmPerS, trackWidthMm) {
    const leftSpd  = leftV  * speedMmPerS;
    const rightSpd = rightV * speedMmPerS;
    const linSpd   = (leftSpd + rightSpd) / 2;
    return {
      vx:     Math.cos(headingRad) * linSpd,
      vy:     Math.sin(headingRad) * linSpd,
      angVel: (rightSpd - leftSpd) / trackWidthMm,
    };
  }

  // Wall-clock duration for a tank move. refDistMM is the distance the
  // *faster* wheel should travel; the slower wheel lags proportionally. The
  // legacy integrator and the Box2D-driven loop both follow this contract.
  // speedMult scales wall clock (faster simulation, same simulated motion).
  function computeMoveDuration(refDistMM, maxV, speedMult, mmPerMs100) {
    return Math.abs(refDistMM) / (maxV * mmPerMs100) / speedMult;
  }

  // Box2D becomes unstable above ~16 ms per step. When the caller hands the
  // engine a larger dt (e.g. via speedMult > 1), break it into sub-steps.
  function computeSubSteps(dtSeconds, maxStepSeconds) {
    return Math.max(1, Math.ceil(dtSeconds / maxStepSeconds));
  }

  return {
    steeringToWheels,
    wheelsToBodyVelocity,
    computeMoveDuration,
    computeSubSteps,
  };
});
