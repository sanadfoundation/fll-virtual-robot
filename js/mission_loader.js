'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const schema   = MISSIONS.schema;
  if (!schema) throw new Error('mission_loader requires mission_schema to be loaded first');

  function _normaliseModifiers(raw) {
    const m = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    const p = (m.poke && typeof m.poke === 'object') ? m.poke : {};
    const f = (m.friction && typeof m.friction === 'object') ? m.friction : {};
    return {
      poke: {
        enabled:          !!(p.enabled),
        interval_min_s:   typeof p.interval_min_s === 'number' ? p.interval_min_s : 8,
        interval_max_s:   typeof p.interval_max_s === 'number' ? p.interval_max_s : 15,
        severity:         typeof p.severity        === 'number' ? p.severity        : 0.4,
      },
      friction: {
        enabled:    !!(f.enabled),
        multiplier: typeof f.multiplier === 'number' ? f.multiplier : 1.0,
      },
    };
  }

  function load(raw) {
    if (!raw || typeof raw !== 'object') {
      throw new Error('mission: expected an object');
    }
    if (raw.schema_version !== schema.SCHEMA_VERSION) {
      throw new Error(`mission: unsupported schema_version (got ${raw.schema_version}, want ${schema.SCHEMA_VERSION})`);
    }
    for (const k of ['id', 'title', 'type', 'difficulty_tier', 'field', 'steps', 'scoring']) {
      if (raw[k] === undefined) throw new Error(`mission: missing required field "${k}"`);
    }
    if (!schema.CHALLENGE_TYPES.includes(raw.type)) {
      throw new Error(`mission: unknown type "${raw.type}"`);
    }
    if (!schema.DIFFICULTY_TIERS.includes(raw.difficulty_tier)) {
      throw new Error(`mission: unknown difficulty_tier "${raw.difficulty_tier}"`);
    }
    if (!schema.SCORING_KINDS.includes(raw.scoring.kind)) {
      throw new Error(`mission: unknown scoring.kind "${raw.scoring.kind}"`);
    }
    if (raw.type === 'obstacle_course' && raw.scoring.kind !== 'objective_minus_penalties') {
      throw new Error('mission: obstacle_course requires scoring.kind = objective_minus_penalties');
    }
    // Optional hard time limit. Applies to both mission types — when set,
    // the engine auto-finalizes after limit seconds.
    if (raw.scoring.time_limit_s !== undefined) {
      const t = raw.scoring.time_limit_s;
      if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) {
        throw new Error('mission scoring.time_limit_s must be a positive finite number when set');
      }
    }
    if (raw.type === 'mission' && (!Array.isArray(raw.steps) || raw.steps.length === 0)) {
      throw new Error('mission: type "mission" requires at least one step');
    }

    // Validate lines
    const LINE_COLORS = ['black', 'red', 'green', 'blue', 'yellow', 'orange'];
    for (const line of (raw.field.lines || [])) {
      if (typeof line.id !== 'string' || line.id === '') {
        throw new Error('mission line: id must be a non-empty string');
      }
      for (const k of ['x1', 'y1', 'x2', 'y2']) {
        if (line[k] === undefined) throw new Error(`mission line: missing "${k}"`);
        if (typeof line[k] !== 'number' || !Number.isFinite(line[k])) {
          throw new Error(`mission line: "${k}" must be a finite number`);
        }
      }
      if (!LINE_COLORS.includes(line.color)) {
        throw new Error(`mission line: invalid color "${line.color}"; must be one of ${LINE_COLORS.join(', ')}`);
      }
      if (typeof line.thickness !== 'number' || !Number.isFinite(line.thickness) ||
          line.thickness < 1 || line.thickness > 20) {
        throw new Error(`mission line: thickness must be a finite number between 1 and 20`);
      }
    }

    // Validate walls
    for (const wall of (raw.field.walls || [])) {
      if (typeof wall.id !== 'string' || wall.id === '') {
        throw new Error('mission wall: id must be a non-empty string');
      }
      if (wall.shape !== 'rect') {
        throw new Error(`mission wall: shape must be "rect", got "${wall.shape}"`);
      }
      for (const k of ['x', 'y', 'w', 'h']) {
        if (wall[k] === undefined) throw new Error(`mission wall: missing "${k}"`);
        if (typeof wall[k] !== 'number' || !Number.isFinite(wall[k])) {
          throw new Error(`mission wall: "${k}" must be a finite number`);
        }
      }
      if (wall.w <= 0) throw new Error('mission wall: w must be > 0');
      if (wall.h <= 0) throw new Error('mission wall: h must be > 0');
    }

    const zoneIds     = new Set((raw.field.zones     || []).map(z => z.id));
    const obstacleIds = new Set((raw.field.obstacles || []).map(o => o.id));
    const stepIds     = new Set((raw.steps           || []).map(s => s.id));

    for (const step of (raw.steps || [])) {
      for (const k of ['id', 'title', 'points', 'condition']) {
        if (step[k] === undefined) throw new Error(`mission step "${step.id || '?'}": missing "${k}"`);
      }
      if (step.requires) {
        for (const req of step.requires) {
          if (!stepIds.has(req)) {
            throw new Error(`mission step "${step.id}": requires unknown step "${req}"`);
          }
        }
      }
      validateCondition(step.condition, zoneIds, obstacleIds, step.id);
    }

    return {
      ...raw,
      modifiers: _normaliseModifiers(raw.modifiers),
    };
  }

  function validateCondition(cond, zoneIds, obstacleIds, stepLabel) {
    if (!cond || typeof cond !== 'object') {
      throw new Error(`mission step "${stepLabel}": condition is not an object`);
    }
    if (!schema.CONDITION_KINDS.includes(cond.kind)) {
      throw new Error(`mission step "${stepLabel}": unknown condition kind "${cond.kind}"`);
    }
    switch (cond.kind) {
      case 'zone':
        if (!zoneIds.has(cond.zone)) {
          throw new Error(`mission step "${stepLabel}": unknown zone "${cond.zone}"`);
        }
        if (cond.subject !== 'robot' && !cond.subject.startsWith('obstacle:')) {
          throw new Error(`mission step "${stepLabel}": zone.subject must be "robot" or "obstacle:<id>"`);
        }
        if (cond.subject.startsWith('obstacle:')) {
          const oid = cond.subject.slice('obstacle:'.length);
          if (!obstacleIds.has(oid)) {
            throw new Error(`mission step "${stepLabel}": unknown obstacle "${oid}"`);
          }
        }
        break;
      case 'sensor':
        for (const k of ['port', 'op', 'value']) {
          if (cond[k] === undefined) {
            throw new Error(`mission step "${stepLabel}": sensor condition missing "${k}"`);
          }
        }
        break;
      case 'contact':
        if (!obstacleIds.has(cond.obstacle)) {
          throw new Error(`mission step "${stepLabel}": unknown obstacle "${cond.obstacle}"`);
        }
        break;
      case 'not':
        validateCondition(cond.of, zoneIds, obstacleIds, stepLabel);
        break;
      case 'all_of':
      case 'any_of':
        if (!Array.isArray(cond.of) || cond.of.length === 0) {
          throw new Error(`mission step "${stepLabel}": ${cond.kind} requires non-empty "of" array`);
        }
        for (const child of cond.of) validateCondition(child, zoneIds, obstacleIds, stepLabel);
        break;
    }
  }

  MISSIONS.loader = { load };
})(typeof window !== 'undefined' ? window : globalThis);
