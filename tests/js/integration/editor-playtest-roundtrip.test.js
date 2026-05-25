'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function env() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence',
    'mission_editor_state', 'mission_ui', 'mission_app',
    'mission_editor_app', 'mission_editor_playtest',
  ]).ctx;
}

function stubSim() {
  const contactSubs = new Set();
  let robot = { x: 0, y: 0, heading: 0 };
  return {
    get robot() { return robot; },
    placeRobot(x, y, heading) { robot = { x, y, heading }; },
    getStateSnapshot() { return { robot, obstacles: {}, sensors: {} }; },
    onObstacleContact(cb) { contactSubs.add(cb); return () => contactSubs.delete(cb); },
  };
}

test('Phase E milestone: author → playtest → engine ticks against authored state', () => {
  const ctx = env();
  const doc = makeEditorDoc(['mm-title', 'mm-steps', 'mm-score-current', 'mm-score-max', 'mm-stars', 'mm-exit', 'mm-meta', 'mm-tag']);
  ctx.document = doc;
  const storage = new Map();
  const ls = {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: k => { storage.delete(k); },
  };
  const sim = stubSim();
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.ui.mount(doc);
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.playtest.attach(app, doc, ls);

  // Author a one-step mission: robot enters a 200×200 zone at (1000, 500).
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 1000, y: 500 });
  const zid = s.field.zones[0].id;
  s = ctx.MISSIONS.editor.state.addStep(s);
  const sid = s.steps[0].id;
  s = ctx.MISSIONS.editor.state.editStep(s, sid, {
    title: 'Reach zone', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: zid },
  });
  app.setEditorState(s);

  // Playtest.
  doc.getElementById('btn-editor-playtest')._click();
  assert.strictEqual(app.mode, 'play');
  assert.ok(app.mission);
  assert.strictEqual(app.mission.steps.length, 1);

  // Drive the engine like the simulator would: set robot inside the zone, tick.
  // Note: in production the engine lives on the boot path; here we instantiate it directly.
  const engine = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(app.mission);
  engine.start(0);
  // Zone is at (1000, 500) with w=200, h=200 → spans (1000, 500) to (1200, 700).
  // Robot at zone top-left corner (inclusive) → inside.
  const completed = engine.tick({
    robot: { x: 1000, y: 500, heading: 0 },
    obstacles: {}, sensors: {},
  });
  assert.deepStrictEqual(completed, [sid]);
  assert.strictEqual(engine.progress.score, 10);

  // Return to editor — state intact.
  doc.getElementById('mm-exit')._click();
  assert.strictEqual(app.mode, 'editor');
  assert.strictEqual(app.editorState.steps[0].title, 'Reach zone');
});
