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
    if (MISSIONS.editor && MISSIONS.editor.meta && MISSIONS.editor.meta.attach) {
      MISSIONS.editor.meta.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.modifiers && MISSIONS.editor.modifiers.attach) {
      MISSIONS.editor.modifiers.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.steps && MISSIONS.editor.steps.attach) {
      MISSIONS.editor.steps.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.inspector && MISSIONS.editor.inspector.attach) {
      MISSIONS.editor.inspector.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.conditions && MISSIONS.editor.conditions.attach) {
      MISSIONS.editor.conditions.attach(app, doc);
    }
    if (MISSIONS.editor && MISSIONS.editor.playtest && MISSIONS.editor.playtest.attach) {
      MISSIONS.editor.playtest.attach(app, doc, storage);
    }
    if (MISSIONS.editor && MISSIONS.editor.io && MISSIONS.editor.io.attach) {
      MISSIONS.editor.io.attach(app, doc, {});
    }

    // Mount the library UI and wire the header 🎯 button to open it.
    let libraryUi = null;
    if (MISSIONS.libraryUi && typeof MISSIONS.libraryUi.attach === 'function') {
      libraryUi = MISSIONS.libraryUi.attach(app, doc, { storage });
    }
    const missionsBtn = doc.getElementById('btn-missions');
    if (missionsBtn) {
      missionsBtn.addEventListener('click', () => {
        if (libraryUi && libraryUi.open) {
          if (libraryUi.isOpen && libraryUi.isOpen()) libraryUi.close();
          else libraryUi.open();
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

    // Mode-transition wiring. Centralizes sim field swap + engine load + UI
    // render so Playtest, URL-hash entries, and any future entry point all
    // run identical setup.
    app.onChange(({ mode, mission }) => {
      if (mode === 'play' && mission) {
        if (sim && typeof sim.setMissionField === 'function') {
          sim.setMissionField(mission.field, { showLabels: true });
        }
        if (sim && typeof sim.placeRobot === 'function') {
          sim.placeRobot(mission.field.robot_start.x,
                         mission.field.robot_start.y,
                         mission.field.robot_start.heading);
        }
        engine.load(mission);
        if (sim && typeof sim.setFrictionMultiplier === 'function') {
          const mods = mission.modifiers;
          sim.setFrictionMultiplier(mods && mods.friction && mods.friction.enabled ? mods.friction.multiplier : 1.0);
        }
        ui.render(mission, engine);
      } else if (mode === 'sandbox') {
        if (sim && typeof sim.restoreDefaultField === 'function') {
          sim.restoreDefaultField();
        }
        engine.reset();
        if (sim && typeof sim.setFrictionMultiplier === 'function') {
          sim.setFrictionMultiplier(1.0);
        }
        ui.render(null, null);
      } else if (mode === 'editor') {
        // Editor mode hides the sim field via CSS-driven suppression
        // (body[data-mode="editor"] in _drawField). Sim state stays as-is;
        // any pending engine progress is cleared.
        engine.reset();
        if (sim && typeof sim.setFrictionMultiplier === 'function') {
          sim.setFrictionMultiplier(1.0);
        }
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
        app.enterPlay(mission);  // onChange handles placeRobot, setMissionField, engine.load, ui.render
        if (autoStart) engine.start(Date.now());
      }
    }

    // Test seam: tick once with the sim's current snapshot.
    function _tickOnce() {
      if (app.mode !== 'play') return;
      const snap = sim.getStateSnapshot();
      const now = Date.now();
      engine.tick(snap, now, sim);
      ui.updateProgress(engine);
      if (typeof ui.updateTimer === 'function') ui.updateTimer(engine, now);
    }

    return Object.assign(app, { engine, ui, _tickOnce });
  }

  function isEnabled() {
    return true;
  }

  MISSIONS.app       = { create, parseHash };
  MISSIONS.boot      = boot;
  MISSIONS.isEnabled = isEnabled;
})(typeof window !== 'undefined' ? window : globalThis);
