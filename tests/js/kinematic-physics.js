'use strict';

// Shared physics stub for tests that need _animateTank to actually move the
// robot. sim-helper.js builds a RobotSimulator in a vm context that doesn't
// load Box2D, so this.physics is null and `if (!this.physics) return` skips
// the whole motion loop. This installer replaces this.physics with a
// kinematic integrator that:
//   - records the (vx, vy, angVel) handed to setKinematicVelocity each step
//   - integrates them into a pose with step(dt_s)
//   - returns the updated pose from readPose
//
// The motion the simulator runs is real — same _execCmd, same _animateTank,
// same encoder-accumulation code — just driven by a simple Euler integrator
// instead of Box2D. Adequate for testing command dispatch, encoder
// accumulation, and sensor read-back semantics; insufficient for testing
// collision response, friction-driven drift, or anything Box2D-specific
// (those live in tests/js/physics/).

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
    setKinematicPose: (_body, x, y, angle) => {
      pose.x = x; pose.y = y; pose.angle = angle;
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

module.exports = { installKinematicPhysics };
