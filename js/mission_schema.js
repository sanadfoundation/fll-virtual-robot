'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  const SCHEMA_VERSION    = 1;
  const CONDITION_KINDS   = Object.freeze(['zone', 'sensor', 'contact', 'not', 'all_of', 'any_of']);
  const SCORING_KINDS     = Object.freeze(['step_sum', 'objective_minus_penalties']);
  const DIFFICULTY_TIERS  = Object.freeze(['beginner', 'intermediate', 'advanced']);
  const CHALLENGE_TYPES   = Object.freeze(['mission', 'obstacle_course']);
  const DEFAULT_PENALTIES = Object.freeze({
    per_contact: 5,
    cap:         50,
    per_second_over: 1,
  });

  MISSIONS.schema = {
    SCHEMA_VERSION,
    CONDITION_KINDS,
    SCORING_KINDS,
    DIFFICULTY_TIERS,
    CHALLENGE_TYPES,
    DEFAULT_PENALTIES,
  };
})(typeof window !== 'undefined' ? window : globalThis);
