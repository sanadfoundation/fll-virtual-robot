'use strict';

// Pure-function force-sensor pipeline: EMA smoothing of physics impulses,
// time-based manual ramp, max-of combination, and Spike-API unit conversion.
// No DOM, no Box2D, no canvas — every function is referentially transparent
// and unit-testable. Loadable as a browser <script> (window.forceSensorLogic)
// and as a Node CommonJS module.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.forceSensorLogic = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function emaStep(prevEma, instantN, hadContact, alpha, decay) {
    if (!hadContact) return prevEma * decay;
    return alpha * instantN + (1 - alpha) * prevEma;
  }

  function manualRamp(startMs, nowMs, rampMs, maxN) {
    if (startMs == null) return 0;
    const t = nowMs - startMs;
    if (t <= 0) return 0;
    if (t >= rampMs) return maxN;
    return (t / rampMs) * maxN;
  }

  function combine(emaN, manualN) {
    return Math.max(emaN, manualN);
  }

  function forceToReadings(forceN) {
    const clamped = Math.max(0, Math.min(10, forceN));
    return {
      dn:      Math.round(clamped * 10),
      pressed: forceN >= 0.5,
      hard:    forceN >= 7,
      raw:     Math.min(4095, Math.round(clamped * 409.5)),
    };
  }

  return { emaStep, manualRamp, combine, forceToReadings };
});
