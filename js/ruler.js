'use strict';

// Pure helpers for the canvas ruler & hover position readout. Loadable both
// as a browser <script> (assigns to window.ruler) and as a Node CommonJS
// module (module.exports). Same source, no build step. Mirrors the pattern
// in js/kinematics.js — keep them in sync if that pattern evolves.

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.ruler = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  // Tick positions in mm along one axis. A position that falls on both pitches
  // appears in `major` only (no duplicate in `minor`).
  function tickPositions(fieldMM, majorPitch, minorPitch) {
    const major = [];
    for (let p = 0; p <= fieldMM; p += majorPitch) {
      major.push(p);
    }
    const minor = [];
    if (minorPitch > 0 && minorPitch < majorPitch) {
      for (let p = minorPitch; p <= fieldMM; p += minorPitch) {
        if (p % majorPitch === 0) continue;
        minor.push(p);
      }
    }
    return { major, minor };
  }

  // Cursor pixel coordinates → field mm coordinates. `rect` is the canvas's
  // getBoundingClientRect() (we read only `left` and `top`); `scale` is the
  // simulator's mm→px factor.
  function clientToMM(clientX, clientY, rect, scale) {
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top)  / scale,
    };
  }

  return { tickPositions, clientToMM };
});
