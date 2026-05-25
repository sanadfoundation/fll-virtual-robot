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

  editor.state = { createBlank, newId };
})(typeof window !== 'undefined' ? window : globalThis);
