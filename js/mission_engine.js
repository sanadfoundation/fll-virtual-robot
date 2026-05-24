'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.conditions) throw new Error('mission_engine requires mission_conditions');

  class ChallengeEngine {
    constructor() {
      this.mission       = null;
      this.progress      = null;
      this.startTimeMs   = null;
      this.firstContact  = {};
      this._zonesById    = {};
    }

    load(mission) {
      this.mission       = mission;
      this.progress      = { score: 0, stepResults: {}, finalized: false };
      this.startTimeMs   = null;
      this.firstContact  = {};
      this._zonesById    = {};
      for (const z of (mission.field.zones || [])) { this._zonesById[z.id] = z; }
      return this.progress;
    }

    start(nowMs) {
      this.startTimeMs = nowMs;
    }

    tick(simSnap) {
      const completed = [];
      if (this.startTimeMs == null || !this.progress || this.progress.finalized) return completed;
      const snap = this._snapshotFor(simSnap);
      for (const step of this.mission.steps) {
        if (this.progress.stepResults[step.id]) continue;
        if (!this._requiresMet(step)) continue;
        if (MISSIONS.conditions.evaluate(step.condition, snap)) {
          this.progress.stepResults[step.id] = { complete: true, completedAtMs: Date.now() };
          this.progress.score += step.points;
          completed.push(step.id);
        }
      }
      return completed;
    }

    recordContact(obstacleId, nowMs) {
      if (this.firstContact[obstacleId] == null) this.firstContact[obstacleId] = nowMs;
    }

    finalize(elapsedMs) {
      if (!this.progress) return null;
      this.progress.finalized = true;
      this.progress.elapsedMs = elapsedMs;
      this.progress.maxScore  = maxScore(this.mission);
      this.progress.breakdown = this._buildBreakdown();
      return this.progress;
    }

    _buildBreakdown() {
      const rows = [];
      for (const step of this.mission.steps) {
        if (this.progress.stepResults[step.id]) {
          rows.push({ kind: 'step', stepId: step.id, title: step.title, points: step.points });
        }
      }
      return rows;
    }

    reset() {
      if (this.mission) this.load(this.mission);
    }

    _requiresMet(step) {
      if (!step.requires || step.requires.length === 0) return true;
      return step.requires.every(id => this.progress.stepResults[id]);
    }

    _snapshotFor(simSnap) {
      const contacts = {};
      for (const id of Object.keys(this.firstContact)) contacts[id] = true;
      return {
        robot:     simSnap.robot,
        obstacles: simSnap.obstacles,
        sensors:   simSnap.sensors,
        zones:     this._zonesById,
        contacts,
      };
    }
  }

  function maxScore(mission) {
    if (mission.scoring.kind === 'step_sum') {
      return mission.steps.reduce((s, st) => s + st.points, 0);
    }
    if (mission.scoring.kind === 'objective_minus_penalties') {
      return 100;
    }
    return 0;
  }

  function starRating(score, max) {
    if (max <= 0) return 3;
    if (score <= 0) return 0;
    const r = score / max;
    if (r >= 0.9) return 3;
    if (r >= 0.6) return 2;
    return 1;
  }

  MISSIONS.engine = { ChallengeEngine, maxScore, starRating };
})(typeof window !== 'undefined' ? window : globalThis);
