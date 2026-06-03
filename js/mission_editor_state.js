'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function newId() {
    // 6-char kebab-case id, lowercase a-z 0-9
    const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return `m-${s}`;
  }

  function createBlank() {
    return {
      id: newId(),
      title: 'Untitled Mission',
      description: '',
      author: '',
      type: 'mission',
      difficulty_tier: 'beginner',
      field: {
        robot_start: { x: 350, y: 163, heading: 90 },
        zones: [],
        obstacles: [],
        lines: [],
        walls: [],
      },
      steps: [],
      scoring: { kind: 'step_sum' },
      modifiers: {
        poke:     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
        friction: { enabled: false, multiplier: 1.0 },
      },
      selection: null,
      dirty: false,
    };
  }

  const ZONE_COLORS = ['red', 'green', 'blue', 'yellow', 'orange', 'purple'];

  function shortId(prefix) {
    const alpha = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
    return `${prefix}-${s}`;
  }

  function clone(state) {
    return {
      ...state,
      field: {
        robot_start: { ...state.field.robot_start },
        zones:     state.field.zones.map(z => ({ ...z })),
        obstacles: state.field.obstacles.map(o => ({ ...o })),
        lines:     (state.field.lines || []).map(l => ({ ...l })),
        walls:     (state.field.walls || []).map(w => ({ ...w })),
      },
      steps:    state.steps.map(s => ({ ...s, condition: deepClone(s.condition), requires: s.requires ? s.requires.slice() : undefined })),
      scoring:  { ...state.scoring },
      modifiers: {
        poke:     { ...state.modifiers.poke },
        friction: { ...state.modifiers.friction },
      },
      selection: state.selection ? { ...state.selection } : null,
    };
  }

  function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    const out = {};
    for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
    return out;
  }

  function dirty(state) {
    const next = clone(state);
    next.dirty = true;
    return next;
  }

  function addObstacle(state, { x, y }) {
    const next = dirty(state);
    const id = shortId('o');
    next.field.obstacles.push({
      id, shape: 'rect', x, y, w: 100, h: 100, label: id,
    });
    return next;
  }

  function moveObstacle(state, id, { x, y }) {
    const next = dirty(state);
    const o = next.field.obstacles.find(o => o.id === id);
    if (o) { o.x = x; o.y = y; }
    return next;
  }

  function resizeObstacle(state, id, { w, h }) {
    const next = dirty(state);
    const o = next.field.obstacles.find(o => o.id === id);
    if (o) { o.w = w; o.h = h; }
    return next;
  }

  function deleteObstacle(state, id) {
    const next = dirty(state);
    next.field.obstacles = next.field.obstacles.filter(o => o.id !== id);
    return next;
  }

  function addZone(state, { x, y }) {
    const next = dirty(state);
    const id = shortId('z');
    const usedColors = new Set(next.field.zones.map(z => z.color));
    const color = ZONE_COLORS.find(c => !usedColors.has(c)) || ZONE_COLORS[next.field.zones.length % ZONE_COLORS.length];
    next.field.zones.push({
      id, shape: 'rect', x, y, w: 200, h: 200, color,
    });
    return next;
  }

  function moveZone(state, id, { x, y }) {
    const next = dirty(state);
    const z = next.field.zones.find(z => z.id === id);
    if (z) { z.x = x; z.y = y; }
    return next;
  }

  function resizeZone(state, id, { w, h }) {
    const next = dirty(state);
    const z = next.field.zones.find(z => z.id === id);
    if (z) { z.w = w; z.h = h; }
    return next;
  }

  function deleteZone(state, id) {
    const next = dirty(state);
    next.field.zones = next.field.zones.filter(z => z.id !== id);
    return next;
  }

  function addLine(state, { x1, y1, x2, y2 }) {
    const next = dirty(state);
    const id = shortId('l');
    next.field.lines = next.field.lines || [];
    next.field.lines.push({ id, x1, y1, x2, y2, color: 'black', thickness: 4 });
    return next;
  }

  function moveLineEndpoint(state, id, endpoint, { x, y }) {
    const next = dirty(state);
    const line = (next.field.lines || []).find(l => l.id === id);
    if (line) {
      if (endpoint === 'a') { line.x1 = x; line.y1 = y; }
      else                  { line.x2 = x; line.y2 = y; }
    }
    return next;
  }

  function setLineProps(state, id, patch) {
    const next = dirty(state);
    const line = (next.field.lines || []).find(l => l.id === id);
    if (line) {
      if (patch.color     !== undefined) line.color     = patch.color;
      if (patch.thickness !== undefined) line.thickness = patch.thickness;
    }
    return next;
  }

  function deleteLine(state, id) {
    const next = dirty(state);
    next.field.lines = (next.field.lines || []).filter(l => l.id !== id);
    return next;
  }

  function addWall(state, { x, y }) {
    const next = dirty(state);
    const id = shortId('w');
    next.field.walls = next.field.walls || [];
    next.field.walls.push({ id, shape: 'rect', x, y, w: 200, h: 80 });
    return next;
  }

  function moveWall(state, id, { x, y }) {
    const next = dirty(state);
    const w = (next.field.walls || []).find(wl => wl.id === id);
    if (w) { w.x = x; w.y = y; }
    return next;
  }

  function resizeWall(state, id, { w, h }) {
    const next = dirty(state);
    const wall = (next.field.walls || []).find(wl => wl.id === id);
    if (wall) { wall.w = w; wall.h = h; }
    return next;
  }

  function deleteWall(state, id) {
    const next = dirty(state);
    next.field.walls = (next.field.walls || []).filter(wl => wl.id !== id);
    return next;
  }

  function setRobotStart(state, { x, y, heading }) {
    const next = dirty(state);
    next.field.robot_start = { x, y, heading };
    return next;
  }

  function setObstacleLabel(state, id, label) {
    const next = dirty(state);
    const o = next.field.obstacles.find(o => o.id === id);
    if (o) o.label = label;
    return next;
  }

  function setZoneLabel(state, id, label) {
    const next = dirty(state);
    const z = next.field.zones.find(z => z.id === id);
    if (z) z.label = label;
    return next;
  }

  function setZoneColor(state, id, color) {
    const next = dirty(state);
    const z = next.field.zones.find(z => z.id === id);
    if (z) z.color = color;
    return next;
  }

  function setObstacleColor(state, id, color) {
    const next = dirty(state);
    const o = next.field.obstacles.find(o => o.id === id);
    if (o) o.color = color;
    return next;
  }

  function setWallColor(state, id, color) {
    const next = dirty(state);
    const w = next.field.walls.find(w => w.id === id);
    if (w) w.color = color;
    return next;
  }

  function addStep(state) {
    const next = dirty(state);
    const id = shortId('s');
    next.steps.push({
      id,
      title: 'New step',
      points: 10,
      // Placeholder condition — loader will reject if zone "" doesn't exist;
      // the author edits this via the condition picker (Phase D).
      condition: { kind: 'zone', subject: 'robot', zone: '' },
    });
    return next;
  }

  function editStep(state, id, patch) {
    const next = dirty(state);
    const step = next.steps.find(s => s.id === id);
    if (!step) return next;
    if (patch.title     !== undefined) step.title     = patch.title;
    if (patch.points    !== undefined) step.points    = patch.points;
    if (patch.hint      !== undefined) step.hint      = patch.hint;
    if (patch.requires  !== undefined) step.requires  = patch.requires.slice();
    if (patch.condition !== undefined) step.condition = deepClone(patch.condition);
    return next;
  }

  function deleteStep(state, id) {
    const next = dirty(state);
    next.steps = next.steps.filter(s => s.id !== id);
    // Scrub references in remaining steps' requires.
    for (const s of next.steps) {
      if (s.requires) s.requires = s.requires.filter(r => r !== id);
    }
    return next;
  }

  function reorderStep(state, id, newIndex) {
    const next = dirty(state);
    const i = next.steps.findIndex(s => s.id === id);
    if (i < 0) return next;
    const [step] = next.steps.splice(i, 1);
    const clampedIndex = Math.max(0, Math.min(newIndex, next.steps.length));
    next.steps.splice(clampedIndex, 0, step);
    return next;
  }

  function setMeta(state, patch) {
    const next = dirty(state);
    if (patch.description     !== undefined) next.description     = patch.description;
    if (patch.title           !== undefined) next.title           = patch.title;
    if (patch.author          !== undefined) next.author          = patch.author;
    if (patch.difficulty_tier !== undefined) next.difficulty_tier = patch.difficulty_tier;
    if (patch.type            !== undefined) {
      // Preserve the optional time limit across type changes so the user
      // doesn't have to re-enter it after picking obstacle_course.
      const carriedLimit = next.scoring && next.scoring.time_limit_s;
      next.type = patch.type;
      if (patch.type === 'obstacle_course') {
        next.scoring = {
          kind: 'objective_minus_penalties',
          goal_zone: '',
          collisions: { per_contact: 10, cap: 80 },
          time_budget_s: 30,
          per_second_over: 1,
        };
      } else {
        next.scoring = { kind: 'step_sum' };
      }
      if (typeof carriedLimit === 'number' && carriedLimit > 0) {
        next.scoring.time_limit_s = carriedLimit;
      }
    }
    if (patch.time_limit_s !== undefined) {
      next.scoring = { ...next.scoring };
      if (patch.time_limit_s === null || patch.time_limit_s === 0 || patch.time_limit_s === '') {
        delete next.scoring.time_limit_s;
      } else {
        next.scoring.time_limit_s = patch.time_limit_s;
      }
    }
    return next;
  }

  function setModifiers(state, patch) {
    const next = dirty(state);
    next.modifiers = {
      poke:     { ...next.modifiers.poke,     ...(patch.poke     || {}) },
      friction: { ...next.modifiers.friction, ...(patch.friction || {}) },
    };
    return next;
  }

  function setSelection(state, sel) {
    const next = clone(state);
    next.selection = sel ? { ...sel } : null;
    return next;
  }

  function serializeToMission(state) {
    const SCHEMA_VERSION = MISSIONS.schema.SCHEMA_VERSION;
    return {
      schema_version: SCHEMA_VERSION,
      id:              state.id,
      title:           state.title,
      description:     state.description,
      author:          state.author,
      type:            state.type,
      difficulty_tier: state.difficulty_tier,
      field: {
        robot_start: { ...state.field.robot_start },
        zones:       state.field.zones.map(z => ({ ...z })),
        obstacles:   state.field.obstacles.map(o => ({ ...o })),
        lines:       (state.field.lines || []).map(l => ({ ...l })),
        walls:       (state.field.walls || []).map(w => ({ ...w })),
      },
      steps: state.steps.map(s => ({
        id: s.id,
        title: s.title,
        points: s.points,
        ...(s.hint ? { hint: s.hint } : {}),
        ...(s.requires && s.requires.length ? { requires: s.requires.slice() } : {}),
        condition: deepClone(s.condition),
      })),
      scoring: { ...state.scoring },
      modifiers: {
        poke:     { ...state.modifiers.poke },
        friction: { ...state.modifiers.friction },
      },
    };
  }

  function validate(state) {
    const raw = serializeToMission(state);
    try {
      const mission = MISSIONS.loader.load(raw);
      return { ok: true, mission };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function loadFromMission(mission) {
    const state = createBlank();
    state.id              = mission.id;
    state.title           = mission.title;
    state.description     = mission.description || '';
    state.author          = mission.author || '';
    state.type            = mission.type;
    state.difficulty_tier = mission.difficulty_tier;
    state.field           = {
      robot_start: { ...mission.field.robot_start },
      zones:       (mission.field.zones || []).map(z => ({ ...z })),
      obstacles:   (mission.field.obstacles || []).map(o => ({ ...o })),
      lines:       (mission.field.lines || []).map(l => ({ ...l })),
      walls:       (mission.field.walls || []).map(w => ({ ...w })),
    };
    state.steps = mission.steps.map(s => ({
      id: s.id, title: s.title, points: s.points,
      ...(s.hint ? { hint: s.hint } : {}),
      ...(s.requires ? { requires: s.requires.slice() } : {}),
      condition: deepClone(s.condition),
    }));
    state.scoring   = { ...mission.scoring };
    state.modifiers = mission.modifiers
      ? {
          poke:     { ...mission.modifiers.poke },
          friction: { ...mission.modifiers.friction },
        }
      : {
          poke:     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
          friction: { enabled: false, multiplier: 1.0 },
        };
    state.selection = null;
    state.dirty     = false;
    return state;
  }

  editor.state = {
    createBlank, newId,
    addObstacle, moveObstacle, resizeObstacle, deleteObstacle,
    addZone, moveZone, resizeZone, deleteZone,
    addLine, moveLineEndpoint, setLineProps, deleteLine,
    addWall, moveWall, resizeWall, deleteWall,
    setRobotStart, setSelection, setMeta, setModifiers,
    setObstacleLabel, setZoneLabel, setZoneColor, setObstacleColor, setWallColor,
    addStep, editStep, deleteStep, reorderStep,
    serializeToMission, loadFromMission, validate,
    _clone: clone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
