// mission_field_swap.js — Pure field-swap helpers extracted from RobotSimulator.
//
// Exposes MISSIONS.fieldSwap with pure functions that accept a state object,
// physics adapter, and constants, and return the new field state.
// The simulator methods (setMissionField / restoreDefaultField) are thin
// wrappers that delegate here so the pure logic can be tested without a canvas.

'use strict';

(function (global) {
  global.MISSIONS = global.MISSIONS || {};

  // Zone color → canvas fill/stroke
  const ZONE_FILL = {
    red:    'rgba(220,100,100,0.2)',
    green:  'rgba(100,220,150,0.2)',
    blue:   'rgba(100,150,220,0.2)',
    yellow: 'rgba(255,200,100,0.2)',
    orange: 'rgba(231,126,34,0.22)',
    purple: 'rgba(155,89,182,0.2)',
  };
  const ZONE_STROKE = {
    red:    '#cc4444',
    green:  '#30c060',
    blue:   '#3070c0',
    yellow: '#f0a830',
    orange: '#d06010',
    purple: '#8030c0',
  };

  // Line color → canvas stroke (same table as the lineColorToStroke closure in
  // simulator.js — kept in sync here so the module is self-contained).
  const LINE_STROKE = {
    black:  '#222',
    red:    '#cc4444',
    green:  '#30c060',
    blue:   '#3070c0',
    yellow: '#d0a830',
    orange: '#d06010',
  };

  // ── Pure converters ──────────────────────────────────────────────────────────

  function zoneToFieldObject(zone) {
    return {
      type:        'rect',
      x:           zone.x,
      y:           zone.y,
      w:           zone.w,
      h:           zone.h,
      fill:        ZONE_FILL[zone.color]   || 'rgba(200,200,200,0.2)',
      stroke:      ZONE_STROKE[zone.color] || '#888',
      lw:          2,
      sensorColor: zone.color,
    };
  }

  function lineToFieldObject(line) {
    return {
      type:        'line',
      x1:          line.x1,
      y1:          line.y1,
      x2:          line.x2,
      y2:          line.y2,
      stroke:      LINE_STROKE[line.color] || '#222',
      lw:          line.thickness || 4,
      sensorColor: line.color,
    };
  }

  // ── Compound helpers ─────────────────────────────────────────────────────────

  // Dispose an array of { body, cfg } entries via physics.removeBody.
  function disposeBodies(arr, physics) {
    if (!physics) return;
    for (const entry of arr) {
      if (entry.body) physics.removeBody(entry.body);
    }
  }

  // applyMissionField(missionField, prev, physics) → { fieldObjects, obstacles, walls }
  //
  //   missionField — the mission.field object ({zones, obstacles, lines, walls})
  //   prev         — { obstacles, walls } bodies to dispose
  //   physics      — { addObstacleBox, addWallBox, removeBody } or null
  function applyMissionField(missionField, prev, physics) {
    // Build visual field objects from zones and lines.
    const fieldObjects = [];
    for (const z of (missionField.zones || [])) {
      fieldObjects.push(zoneToFieldObject(z));
    }
    for (const line of (missionField.lines || [])) {
      fieldObjects.push(lineToFieldObject(line));
    }

    // Dispose previous physics bodies.
    disposeBodies(prev.obstacles || [], physics);
    disposeBodies(prev.walls     || [], physics);

    // Build new obstacle bodies.
    const obstacles = (missionField.obstacles || []).map(cfg => ({
      cfg: {
        x:      cfg.x,
        y:      cfg.y,
        w:      cfg.w,
        h:      cfg.h,
        fill:   cfg.fill   || '#9b59b6',
        stroke: cfg.stroke || '#5e2c79',
        label:  cfg.label  || cfg.id || '',
      },
      body: physics
        ? physics.addObstacleBox(cfg.w / 2, cfg.h / 2, { x: cfg.x, y: cfg.y })
        : null,
    }));

    // Build new static wall bodies.
    const walls = (missionField.walls || []).map(cfg => ({
      cfg: { x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h },
      body: physics
        ? physics.addWallBox(cfg.w / 2, cfg.h / 2, { x: cfg.x, y: cfg.y })
        : null,
    }));

    return { fieldObjects, obstacles, walls };
  }

  // restoreDefaultObstacles(defaultObstacleConfigs, prev, physics) → { obstacles, walls }
  //
  //   defaultObstacleConfigs — array of sandbox obstacle cfgs
  //   prev                   — { obstacles, walls } to dispose
  //   physics                — { addObstacleBox, removeBody } or null
  function restoreDefaultObstacles(defaultObstacleConfigs, prev, physics) {
    disposeBodies(prev.obstacles || [], physics);
    disposeBodies(prev.walls     || [], physics);

    const obstacles = defaultObstacleConfigs.map(cfg => ({
      cfg,
      body: physics
        ? physics.addObstacleBox(cfg.w / 2, cfg.h / 2, { x: cfg.x, y: cfg.y })
        : null,
    }));

    return { obstacles, walls: [] };
  }

  // colorAtPosition(x, y, fieldObjects) → string
  //
  // Returns the sensorColor of the first field-object covering the point
  // (x, y), or 'none' if none does. Field-objects without a sensorColor are
  // skipped (they're visual-only — the ruler, the mat border, etc.).
  //
  //   rect:   point-in-rect (edge inclusive).
  //   line:   point within max(half-thickness, 20mm) of the line segment.
  //           The 20mm floor matches the real color sensor's effective
  //           detection radius — a thin painted line still triggers a read
  //           when the sensor is "near enough."
  //   circle: point within radius.
  function colorAtPosition(x, y, fieldObjects) {
    for (const obj of fieldObjects) {
      if (!obj.sensorColor) continue;
      if (obj.type === 'line') {
        const dist = _pointToLineDist(x, y, obj.x1, obj.y1, obj.x2, obj.y2);
        if (dist <= Math.max((obj.lw || 1) / 2, 20)) return obj.sensorColor;
      } else if (obj.type === 'rect') {
        if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
          return obj.sensorColor;
        }
      } else if (obj.type === 'circle') {
        const dx = x - obj.x, dy = y - obj.y;
        if (Math.sqrt(dx * dx + dy * dy) <= obj.r) return obj.sensorColor;
      }
    }
    return 'none';
  }

  function _pointToLineDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  global.MISSIONS.fieldSwap = {
    zoneToFieldObject,
    lineToFieldObject,
    applyMissionField,
    restoreDefaultObstacles,
    colorAtPosition,
  };
}(typeof window !== 'undefined' ? window : this));
