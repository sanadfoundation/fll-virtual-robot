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
      return this.progress;
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

  MISSIONS.engine = { ChallengeEngine };
})(typeof window !== 'undefined' ? window : globalThis);
