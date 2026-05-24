'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  function pointInZone(point, zone) {
    if (!zone) return false;
    if (zone.shape === 'rect') {
      return point.x >= zone.x && point.x <= zone.x + zone.w
          && point.y >= zone.y && point.y <= zone.y + zone.h;
    }
    if (zone.shape === 'circle') {
      const dx = point.x - zone.x;
      const dy = point.y - zone.y;
      return Math.sqrt(dx * dx + dy * dy) <= zone.r;
    }
    return false;
  }

  function subjectPosition(subject, snap) {
    if (subject === 'robot') return { x: snap.robot.x, y: snap.robot.y };
    if (subject && subject.startsWith('obstacle:')) {
      const id = subject.slice('obstacle:'.length);
      const o = snap.obstacles[id];
      return o ? { x: o.x, y: o.y } : null;
    }
    return null;
  }

  function evaluateZone(cond, snap) {
    const pos = subjectPosition(cond.subject, snap);
    if (!pos) return false;
    return pointInZone(pos, snap.zones[cond.zone]);
  }

  function evaluate(cond, snap) {
    switch (cond.kind) {
      case 'zone': return evaluateZone(cond, snap);
      default: throw new Error(`evaluate: unsupported kind "${cond.kind}"`);
    }
  }

  MISSIONS.conditions = { evaluate, pointInZone, subjectPosition };
})(typeof window !== 'undefined' ? window : globalThis);
