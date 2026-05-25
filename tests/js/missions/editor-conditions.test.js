'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');
const { makeBlocklyStub } = require('../mocks/blockly-stub');

function env() {
  const ctx = makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_editor_state',
    'mission_app', 'mission_editor_app', 'mission_editor_conditions',
  ]).ctx;
  ctx.Blockly = makeBlocklyStub();
  return ctx;
}

function setup() {
  const ctx = env();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const app = ctx.MISSIONS.app.create();
  ctx.MISSIONS.editor.app.attach(app, doc);
  ctx.MISSIONS.editor.conditions.attach(app, doc);
  return { ctx, doc, app };
}

test('conditions: section starts hidden when no step is selected', () => {
  const { doc, app } = setup();
  app.enterEditor();
  const section = doc.getElementById('editor-cond-section');
  assert.strictEqual(section.hidden, true);
});

test('conditions: section appears when a step is selected', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const stepId = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id: stepId }));
  const section = doc.getElementById('editor-cond-section');
  assert.strictEqual(section.hidden, false);
});

test('conditions: deselecting hides the section', () => {
  const { ctx, doc, app } = setup();
  app.enterEditor();
  app.setEditorState(ctx.MISSIONS.editor.state.addStep(app.editorState));
  const id = app.editorState.steps[0].id;
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, { kind: 'step', id }));
  app.setEditorState(ctx.MISSIONS.editor.state.setSelection(app.editorState, null));
  assert.strictEqual(doc.getElementById('editor-cond-section').hidden, true);
});

test('conditions: attaching defines all six predicate blocks', () => {
  const { ctx } = setup();
  // Defined-blocks map is populated by attach (via ensureBlockDefs).
  const defined = ctx.Blockly._definedBlocks;
  for (const t of ['cond_zone', 'cond_sensor', 'cond_contact', 'cond_not', 'cond_all_of', 'cond_any_of']) {
    assert.ok(defined[t], `expected block type "${t}" to be defined`);
  }
});
