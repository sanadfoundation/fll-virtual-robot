'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  if (!MISSIONS.engine) throw new Error('mission_ui requires mission_engine');

  function mount(doc) {
    const $ = (id) => doc.getElementById(id);

    const root      = $('mission-map');
    const tag       = $('mm-tag');
    const titleEl   = $('mm-title');
    const metaEl    = $('mm-meta');
    const scoreCur  = $('mm-score-current');
    const scoreMax  = $('mm-score-max');
    const starsEl   = $('mm-stars');
    const stepsEl   = $('mm-steps');

    let currentMission = null;
    const revealedHints = new Set();
    const stepRowsById = {};

    function render(mission, engine) {
      currentMission = mission;
      if (!mission || !engine) {
        root.hidden = true;
        return;
      }
      root.hidden = false;

      titleEl.textContent = mission.title;
      metaEl.textContent  = `${cap(mission.difficulty_tier)} · ${mission.steps.length} ${mission.steps.length === 1 ? 'step' : 'steps'}`;

      const max = MISSIONS.engine.maxScore(mission);
      scoreCur.textContent = String(engine.progress ? engine.progress.score : 0);
      scoreMax.textContent = `/${max}`;

      stepsEl.innerHTML = '';
      for (const k of Object.keys(stepRowsById)) delete stepRowsById[k];
      for (const step of mission.steps) {
        const row = renderStepRow(step);
        stepsEl.appendChild(row);
        stepRowsById[step.id] = row;
      }
      paintStars(engine, max);
    }

    function renderStepRow(step) {
      const row = doc.createElement('li');
      row.classList.add('mm-step');

      const r1 = doc.createElement('div');
      r1.classList.add('mm-step-row');
      const check = doc.createElement('span');
      check.classList.add('mm-step-check');
      check.textContent = '✓';
      const titleSpan = doc.createElement('span');
      titleSpan.classList.add('mm-step-title');
      titleSpan.textContent = step.title;
      const pts = doc.createElement('span');
      pts.classList.add('mm-step-points');
      pts.textContent = `+${step.points}`;
      r1.appendChild(check); r1.appendChild(titleSpan); r1.appendChild(pts);
      row.appendChild(r1);

      if (step.hint) {
        const r2 = doc.createElement('div');
        r2.classList.add('mm-step-hint-row');
        const btn = doc.createElement('button');
        btn.textContent = '💡 Show hint';
        btn.classList.add('mm-step-hint-btn');
        btn.addEventListener('click', () => revealHint(step.id));
        r2.appendChild(btn);
        row.appendChild(r2);
      }
      return row;
    }

    function revealHint(stepId) {
      if (revealedHints.has(stepId)) return;
      revealedHints.add(stepId);
      const step = currentMission.steps.find(s => s.id === stepId);
      const row  = stepRowsById[stepId];
      if (!step || !row) return;
      const reveal = doc.createElement('div');
      reveal.classList.add('mm-step-hint-reveal');
      reveal.textContent = step.hint;
      row.appendChild(reveal);
    }

    function updateProgress(engine) {
      if (!currentMission || !engine || !engine.progress) return;
      scoreCur.textContent = String(engine.progress.score);
      for (const step of currentMission.steps) {
        const row = stepRowsById[step.id];
        if (!row) continue;
        row.classList.toggle('done', !!engine.progress.stepResults[step.id]);
      }
      paintStars(engine, MISSIONS.engine.maxScore(currentMission));
    }

    function paintStars(engine, max) {
      const score = engine.progress ? engine.progress.score : 0;
      const n = MISSIONS.engine.starRating(score, max);
      starsEl.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = doc.createElement('span');
        s.textContent = '★';
        if (i < n) s.classList.add('lit');
        starsEl.appendChild(s);
      }
    }

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    return {
      render,
      updateProgress,
      _test_revealHint: revealHint,
    };
  }

  MISSIONS.ui = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
