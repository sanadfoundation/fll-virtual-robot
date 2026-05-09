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
  // appears in `major` only (no duplicate in `minor`). Index-based iteration
  // (`i * pitch`) avoids float drift that would accumulate with `p += pitch`
  // for fractional-mm pitches like inches (25.4 mm). The dedupe Set keys on
  // `Math.round(p * 1000)` (1 µm precision) so values that should be equal
  // but differ by a few ULPs collapse to the same key.
  function tickPositions(fieldMM, majorPitch, minorPitch) {
    const major = [];
    for (let i = 0; i * majorPitch <= fieldMM + 1e-9; i++) {
      major.push(i * majorPitch);
    }
    const minor = [];
    if (minorPitch > 0 && minorPitch < majorPitch) {
      const majorKeys = new Set(major.map(p => Math.round(p * 1000)));
      for (let i = 1; i * minorPitch <= fieldMM + 1e-9; i++) {
        const p = i * minorPitch;
        if (majorKeys.has(Math.round(p * 1000))) continue;
        minor.push(p);
      }
    }
    return { major, minor };
  }

  // Tick pitches (in mm) for a unit, chosen so the rendered tick labels read
  // as round numbers in that unit. cm and mm share physical positions
  // (200 mm pitch — `20 cm` and `200 mm` line up); inches gets its own pitch
  // (254 mm = 10″ major, 25.4 mm = 1″ minor).
  function tickPitchFor(unit) {
    if (unit === 'in') return { major: 254, minor: 25.4 };
    return { major: 200, minor: 100 };
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

  // Pick a non-clipping corner near the cursor. Default placement is
  // bottom-right of the cursor; flips to the opposite side near the right
  // or bottom edge so the overlay never extends past the canvas.
  function placeHoverOverlay(cursorX, cursorY, canvasW, canvasH, overlayW, overlayH, offset) {
    let left = cursorX + offset;
    let top  = cursorY + offset;
    if (left + overlayW > canvasW) left = cursorX - offset - overlayW;
    if (top  + overlayH > canvasH) top  = cursorY - offset - overlayH;
    return { left, top };
  }

  return { tickPositions, tickPitchFor, clientToMM, placeHoverOverlay };
});
