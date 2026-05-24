'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const schema   = MISSIONS.schema;
  if (!schema) throw new Error('mission_loader requires mission_schema to be loaded first');

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
    if (raw.type === 'mission' && (!Array.isArray(raw.steps) || raw.steps.length === 0)) {
      throw new Error('mission: type "mission" requires at least one step');
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
      modifiers: raw.modifiers || { available: [], defaults: {} },
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
