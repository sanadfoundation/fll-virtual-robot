'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  const { ctx } = makeLlsp3Env([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_app',
    'mission_editor_io',
  ]);
  return ctx;
}

test('Phase F milestone: author → save → load → engine produces same score', async () => {
  const ctx = env();

  // Author in-memory.
  let s = ctx.MISSIONS.editor.state.createBlank();
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 500, y: 500 });
  const zid = s.field.zones[0].id;
  s.steps.push({ id: 'reach', title: 'Reach', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: zid } });
  s.title = 'Roundtrip Mission';
  const r = ctx.MISSIONS.editor.state.validate(s);
  assert.strictEqual(r.ok, true);

  // Save (ZIP bytes).
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(r.mission);
  assert.ok(bytes instanceof Uint8Array);

  // Load back.
  const { mission: loaded } = await ctx.MISSIONS.editor.io.readBundle(bytes);
  assert.strictEqual(loaded.title, 'Roundtrip Mission');
  assert.strictEqual(loaded.steps.length, 1);

  // Run the engine against the loaded mission.
  const engine = new ctx.MISSIONS.engine.ChallengeEngine();
  engine.load(loaded);
  engine.start(0);
  const completed = engine.tick({
    robot: { x: 500, y: 500, heading: 0 },
    obstacles: {}, sensors: {},
  });
  assert.deepStrictEqual(completed, ['reach']);
  assert.strictEqual(engine.progress.score, 10);
});
