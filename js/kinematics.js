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

  // Clamp the robot's centre so its rotated AABB (chassis + front bumper)
  // stays inside the field rectangle. Box2D v2.4 will not generate contacts
  // between kinematic and static bodies, so the simulator does this outside
  // the engine after each physics step.
  //
  // geom.bodyH is the chassis front-to-back dimension (body-local +X),
  // geom.bodyW is the chassis lateral dimension (body-local +Y); the bumper
  // adds bumperDepth in body-local +X only. Returns the clamped (x, y) and a
  // `clamped` flag so the caller can skip writing back when nothing changed.
  function clampRobotPose(pose, geom) {
    const halfH = geom.bodyH / 2;
    const halfW = geom.bodyW / 2;
    const corners = [
      [-halfH,                   -halfW],
      [-halfH,                   +halfW],
      [+halfH + geom.bumperDepth, -halfW],
      [+halfH + geom.bumperDepth, +halfW],
    ];
    const cos = Math.cos(pose.angle);
    const sin = Math.sin(pose.angle);
    let minDx = Infinity, maxDx = -Infinity;
    let minDy = Infinity, maxDy = -Infinity;
    for (const [lx, ly] of corners) {
      const dx = lx * cos - ly * sin;
      const dy = lx * sin + ly * cos;
      if (dx < minDx) minDx = dx;
      if (dx > maxDx) maxDx = dx;
      if (dy < minDy) minDy = dy;
      if (dy > maxDy) maxDy = dy;
    }
    const xMin = -minDx;
    const xMax = geom.fieldW - maxDx;
    const yMin = -minDy;
    const yMax = geom.fieldH - maxDy;
    let cx = Math.max(xMin, Math.min(xMax, pose.x));
    let cy = Math.max(yMin, Math.min(yMax, pose.y));

    // Wall push-out. Walls are math-y-up AABBs ({x, y, w, h}, x/y = bottom-left).
    // For each wall, compute the AABB-vs-rotated-robot-bounding-AABB overlap;
    // if overlap exists, shift the robot centre along the smaller-overlap axis
    // until just out of the wall. Box2D doesn't generate contacts between
    // kinematic and static bodies (see comment above), so the field walls
    // already use this same outside-engine clamp approach.
    const walls = geom.walls || [];
    for (const w of walls) {
      const robotMinX = cx + minDx;
      const robotMaxX = cx + maxDx;
      const robotMinY = cy + minDy;
      const robotMaxY = cy + maxDy;
      const wallMinX = w.x;
      const wallMaxX = w.x + w.w;
      const wallMinY = w.y;
      const wallMaxY = w.y + w.h;
      const overlapX = Math.min(robotMaxX, wallMaxX) - Math.max(robotMinX, wallMinX);
      const overlapY = Math.min(robotMaxY, wallMaxY) - Math.max(robotMinY, wallMinY);
      if (overlapX > 0 && overlapY > 0) {
        if (overlapX < overlapY) {
          const robotCx = (robotMinX + robotMaxX) / 2;
          const wallCx  = (wallMinX  + wallMaxX)  / 2;
          cx += robotCx < wallCx ? -overlapX : +overlapX;
        } else {
          const robotCy = (robotMinY + robotMaxY) / 2;
          const wallCy  = (wallMinY  + wallMaxY)  / 2;
          cy += robotCy < wallCy ? -overlapY : +overlapY;
        }
      }
    }

    return {
      x: cx,
      y: cy,
      clamped: (cx !== pose.x) || (cy !== pose.y),
    };
  }

  return {
    steeringToWheels,
    wheelsToBodyVelocity,
    computeMoveDuration,
    computeSubSteps,
    clampRobotPose,
  };
});
