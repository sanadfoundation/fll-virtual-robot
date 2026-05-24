'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  function create() {
    const state = { mode: 'sandbox', mission: null };
    const subs = new Set();

    function emit() {
      for (const cb of subs) cb({ mode: state.mode, mission: state.mission });
    }

    return {
      get mode()    { return state.mode; },
      get mission() { return state.mission; },
      enterPlay(mission) {
        state.mode = 'play';
        state.mission = mission;
        emit();
      },
      exitMission() {
        state.mode = 'sandbox';
        state.mission = null;
        emit();
      },
      onChange(cb) { subs.add(cb); return () => subs.delete(cb); },
    };
  }

  function parseHash(hash) {
    if (!hash) return null;
    const m = /^#mission=([A-Za-z0-9_-]+)/.exec(hash);
    return m ? m[1] : null;
  }

  MISSIONS.app = { create, parseHash };
})(typeof window !== 'undefined' ? window : globalThis);
