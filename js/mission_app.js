'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});

  function create() {
    const state = { mode: 'sandbox', mission: null, editorState: null };
    const subs = new Set();

    function emit() {
      for (const cb of subs) cb({ mode: state.mode, mission: state.mission, editorState: state.editorState });
    }

    return {
      get mode()        { return state.mode; },
      get mission()     { return state.mission; },
      get editorState() { return state.editorState; },
      enterPlay(mission) {
        state.mode = 'play';
        state.mission = mission;
        state.editorState = null;
        emit();
      },
      enterEditor(missionOrNull) {
        state.mode = 'editor';
        state.mission = null;
        state.editorState = missionOrNull
          ? MISSIONS.editor.state.loadFromMission(missionOrNull)
          : MISSIONS.editor.state.createBlank();
        emit();
      },
      setEditorState(next) {
        state.editorState = next;
        emit();
      },
      exitMission() {
        state.mode = 'sandbox';
        state.mission = null;
        state.editorState = null;
        emit();
      },
      exitEditor() {
        state.mode = 'sandbox';
        state.mission = null;
        state.editorState = null;
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

  async function boot({ sim, doc, location, fetch, storage, autoStart }) {
    const app    = create();
    const engine = new MISSIONS.engine.ChallengeEngine();
    const ui     = MISSIONS.ui.mount(doc);

    // Attach the editor mode lifecycle (no-op if editor modules aren't loaded).
    if (MISSIONS.editor && MISSIONS.editor.app && MISSIONS.editor.app.attach) {
      MISSIONS.editor.app.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.field && MISSIONS.editor.field.attach) {
      MISSIONS.editor.field.attach(app, doc);
    }

    // Wire the header 🎯 button: open a blank editor on click.
    const missionsBtn = doc.getElementById('btn-missions');
    if (missionsBtn) {
      missionsBtn.addEventListener('click', () => {
        if (app.mode === 'editor') {
          app.exitEditor();
        } else {
          app.enterEditor();
        }
      });
    }

    // Initialise: ensure the panel is hidden until a mission is entered.
    ui.render(null, null);

    // Wire the Exit Mission button.
    const exitBtn = doc.getElementById('mm-exit');
    if (exitBtn) exitBtn.addEventListener('click', () => app.exitMission());

    // When mode changes, re-render the panel.
    app.onChange(({ mode, mission }) => {
      if (mode === 'play') {
        ui.render(mission, engine);
      } else {
        engine.reset();
        ui.render(null, null);
      }
    });

    // Subscribe to obstacle contacts for the contact condition primitive.
    if (sim && sim.onObstacleContact) {
      sim.onObstacleContact((id) => engine.recordContact(id, Date.now()));
    }

    const id = MISSIONS.app.parseHash(location.hash);
    if (id) {
      const libFetch = fetch || global.fetch;
      const res = await libFetch(`missions/${id}/mission.json`);
      if (res.ok) {
        const raw = await res.json();
        const mission = MISSIONS.loader.load(raw);
        if (sim && sim.placeRobot) {
          sim.placeRobot(mission.field.robot_start.x, mission.field.robot_start.y,
                         mission.field.robot_start.heading);
        }
        engine.load(mission);
        app.enterPlay(mission);
        if (autoStart) engine.start(Date.now());
      }
    }

    // Test seam: tick once with the sim's current snapshot.
    function _tickOnce() {
      if (app.mode !== 'play') return;
      const snap = sim.getStateSnapshot();
      engine.tick(snap);
      ui.updateProgress(engine);
    }

    return Object.assign(app, { engine, ui, _tickOnce });
  }

  MISSIONS.app  = { create, parseHash };
  MISSIONS.boot = boot;
})(typeof window !== 'undefined' ? window : globalThis);
