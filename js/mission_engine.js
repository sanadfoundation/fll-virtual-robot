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
      this._goalReached  = false;
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

      if (this.mission.type === 'obstacle_course' && this.mission.scoring.goal_zone) {
        const cond = { kind: 'zone', subject: 'robot', zone: this.mission.scoring.goal_zone };
        if (MISSIONS.conditions.evaluate(cond, snap)) this._goalReached = true;
      }

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

      if (this.mission.scoring.kind === 'step_sum') {
        this.progress.breakdown = this._buildBreakdown();
        return this.progress;
      }
      if (this.mission.scoring.kind === 'objective_minus_penalties') {
        this._finalizeObstacleCourse(elapsedMs);
        return this.progress;
      }
      return this.progress;
    }

    _finalizeObstacleCourse(elapsedMs) {
      const sc = this.mission.scoring;
      const reached = this._goalReached === true;
      const base = reached ? 100 : 0;

      const distinct = Object.keys(this.firstContact).length;
      const perContact = (sc.collisions && sc.collisions.per_contact) || 0;
      const cap        = (sc.collisions && sc.collisions.cap) || 0;
      const collisionPenalty = Math.min(cap, distinct * perContact);

      const targetS = sc.time_budget_s || 0;
      const perOver = sc.per_second_over || 0;
      const elapsedS = elapsedMs / 1000;
      const timePenalty = elapsedS > targetS
        ? Math.ceil(elapsedS - targetS) * perOver
        : 0;

      const total = Math.max(0, base - collisionPenalty - timePenalty);
      this.progress.score = total;
      this.progress.breakdown = [
        { kind: 'base',       label: reached ? 'Reached the finish zone' : 'Did not reach goal', points: base },
        { kind: 'collisions', label: `Collisions (${distinct})`, points: -collisionPenalty },
        { kind: 'time',       label: `Time over budget`,         points: -timePenalty },
      ];
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
