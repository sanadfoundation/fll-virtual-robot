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
      },
      steps: [],
      scoring: { kind: 'step_sum' },
      modifiers: { available: [], defaults: {} },
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
      },
      steps:    state.steps.map(s => ({ ...s, condition: deepClone(s.condition), requires: s.requires ? s.requires.slice() : undefined })),
      scoring:  { ...state.scoring },
      modifiers: { available: state.modifiers.available.slice(), defaults: { ...state.modifiers.defaults } },
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

  function setRobotStart(state, { x, y, heading }) {
    const next = dirty(state);
    next.field.robot_start = { x, y, heading };
    return next;
  }

  function setMeta(state, patch) {
    const next = dirty(state);
    if (patch.description     !== undefined) next.description     = patch.description;
    if (patch.title           !== undefined) next.title           = patch.title;
    if (patch.author          !== undefined) next.author          = patch.author;
    if (patch.type            !== undefined) next.type            = patch.type;
    if (patch.difficulty_tier !== undefined) next.difficulty_tier = patch.difficulty_tier;
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
      modifiers: { available: state.modifiers.available.slice(), defaults: { ...state.modifiers.defaults } },
    };
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
    };
    state.steps = mission.steps.map(s => ({
      id: s.id, title: s.title, points: s.points,
      ...(s.hint ? { hint: s.hint } : {}),
      ...(s.requires ? { requires: s.requires.slice() } : {}),
      condition: deepClone(s.condition),
    }));
    state.scoring   = { ...mission.scoring };
    state.modifiers = mission.modifiers
      ? { available: mission.modifiers.available.slice(), defaults: { ...mission.modifiers.defaults } }
      : { available: [], defaults: {} };
    state.selection = null;
    state.dirty     = false;
    return state;
  }

  editor.state = {
    createBlank, newId,
    addObstacle, moveObstacle, resizeObstacle, deleteObstacle,
    addZone, moveZone, resizeZone, deleteZone,
    setRobotStart, setSelection, setMeta,
    serializeToMission, loadFromMission,
    _clone: clone,
  };
})(typeof window !== 'undefined' ? window : globalThis);
