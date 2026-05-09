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

  function emaStep(/* prevEma, instantN, hadContact, alpha, decay */) {
    throw new Error('not implemented');
  }

  function manualRamp(/* startMs, nowMs, rampMs, maxN */) {
    throw new Error('not implemented');
  }

  function combine(/* emaN, manualN */) {
    throw new Error('not implemented');
  }

  function forceToReadings(/* forceN */) {
    throw new Error('not implemented');
  }

  return { emaStep, manualRamp, combine, forceToReadings };
});
