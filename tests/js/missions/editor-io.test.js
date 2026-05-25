'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeLlsp3Env } = require('../mocks/llsp3-env');

function env() {
  // The IO module needs JSZip + schema + loader + editor state; reuse the
  // llsp3 env loader (it already loads JSZip).
  const { ctx } = makeLlsp3Env([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state', 'mission_app', 'mission_editor_app',
    'mission_editor_io',
  ]);
  return ctx;
}

const MIN_MISSION = {
  schema_version: 1, id: 'mio', title: 'IO Test',
  type: 'mission', difficulty_tier: 'beginner',
  field: {
    robot_start: { x: 0, y: 0, heading: 0 },
    zones: [{ id: 'z', shape: 'rect', x: 0, y: 0, w: 100, h: 100, color: 'red' }],
    obstacles: [],
  },
  steps: [{ id: 'a', title: 'a', points: 10,
    condition: { kind: 'zone', subject: 'robot', zone: 'z' } }],
  scoring: { kind: 'step_sum' },
};

test('writeBundle: produces a ZIP containing mission.json', async () => {
  const ctx = env();
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(MIN_MISSION);
  assert.ok(bytes instanceof Uint8Array);
  const zip = await ctx.JSZip.loadAsync(bytes);
  assert.ok(zip.file('mission.json'), 'mission.json must be present');
  const text = await zip.file('mission.json').async('string');
  const parsed = JSON.parse(text);
  assert.strictEqual(parsed.id, 'mio');
});

test('writeBundle: includes screenshot.png when provided', async () => {
  const ctx = env();
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);  // PNG magic
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(MIN_MISSION, { screenshot: pngBytes });
  const zip = await ctx.JSZip.loadAsync(bytes);
  assert.ok(zip.file('screenshot.png'), 'screenshot.png must be present');
});

test('writeBundle: includes README.md when provided', async () => {
  const ctx = env();
  const bytes = await ctx.MISSIONS.editor.io.writeBundle(MIN_MISSION, { readme: '# Hello' });
  const zip = await ctx.JSZip.loadAsync(bytes);
  assert.ok(zip.file('README.md'));
  const txt = await zip.file('README.md').async('string');
  assert.strictEqual(txt, '# Hello');
});

test('attach: clicking the Save button triggers a download with the title as filename', async () => {
  const ctx = env();
  const doc = require('../mocks/editor-dom').makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  // Provide minimal editor state via direct injection.
  app.enterEditor();
  let s = app.editorState;
  s = ctx.MISSIONS.editor.state.addZone(s, { x: 0, y: 0 });
  s.steps.push({ id: 'a', title: 'a', points: 1,
    condition: { kind: 'zone', subject: 'robot', zone: s.field.zones[0].id } });
  s.title = 'My Mission';
  app.setEditorState(s);
  const downloads = [];
  ctx.MISSIONS.editor.io.attach(app, doc, {
    downloadFile: (filename, bytes) => downloads.push({ filename, size: bytes.length }),
  });
  doc.getElementById('btn-editor-save')._click();
  // The save flow is async — wait for JSZip's internal async to complete.
  await new Promise(r => setTimeout(r, 100));
  assert.strictEqual(downloads.length, 1);
  assert.match(downloads[0].filename, /^my-mission(.*)\.llmission$/i);
});
