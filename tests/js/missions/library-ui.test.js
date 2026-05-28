'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { makeMissionsEnv } = require('../mocks/missions-env');
const { makeEditorDoc } = require('../mocks/editor-dom');

function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return Array.from(map.keys())[i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    _raw: map,
  };
}

function makeEnv() {
  return makeMissionsEnv([
    'mission_schema', 'mission_loader', 'mission_conditions',
    'mission_engine', 'mission_persistence',
    'mission_library',
    'mission_app', 'mission_library_ui',
  ]).ctx;
}

function setup(overrides) {
  overrides = overrides || {};
  const ctx = makeEnv();
  const doc = makeEditorDoc();
  ctx.document = doc;
  const storage = makeStorage();
  const app = ctx.MISSIONS.app.create();
  // Stub enterPlay / enterEditor to record calls
  const calls = { enterPlay: [], enterEditor: [] };
  app.enterPlay   = (m) => { calls.enterPlay.push(m); };
  app.enterEditor = (m) => { calls.enterEditor.push(m); };

  // Allow stubbing loadAllBundled before attach
  if (overrides.loadAllBundled) {
    ctx.MISSIONS.library.loadAllBundled = overrides.loadAllBundled;
  }

  const ui = ctx.MISSIONS.libraryUi.attach(app, doc, { storage });
  return { ctx, doc, app, ui, storage, calls };
}

// ── Sample missions ──────────────────────────────────────────────────────────
const BASE_MISSION = {
  schema_version: 1, id: 'u1', title: 'Test Mission', author: 'Alice',
  type: 'mission', difficulty_tier: 'beginner',
  field: { robot_start: { x: 350, y: 163, heading: 90 }, zones: [], obstacles: [] },
  steps: [
    { id: 's1', title: 'Step 1', points: 10,
      condition: { kind: 'zone', subject: 'robot', zone: 'z1' } },
    { id: 's2', title: 'Step 2', points: 20,
      condition: { kind: 'zone', subject: 'robot', zone: 'z1' } },
  ],
  scoring: { kind: 'step_sum' },
};

// ── 1. attach returns an object with open/close/isOpen/refresh ───────────────
test('libraryUi: attach returns object with open/close/isOpen/refresh', () => {
  const { ui } = setup({ loadAllBundled: async () => [] });
  assert.strictEqual(typeof ui.open,    'function');
  assert.strictEqual(typeof ui.close,   'function');
  assert.strictEqual(typeof ui.isOpen,  'function');
  assert.strictEqual(typeof ui.refresh, 'function');
});

// ── 2. modal is hidden by default ────────────────────────────────────────────
test('libraryUi: modal is hidden by default', () => {
  const { doc } = setup({ loadAllBundled: async () => [] });
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true);
});

// ── 3. open() unhides the modal ──────────────────────────────────────────────
test('libraryUi: open() unhides the modal', async () => {
  const { ui, doc } = setup({ loadAllBundled: async () => [] });
  await ui.open();
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, false);
});

// ── 4. close() hides the modal ───────────────────────────────────────────────
test('libraryUi: close() hides the modal', async () => {
  const { ui, doc } = setup({ loadAllBundled: async () => [] });
  await ui.open();
  ui.close();
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true);
});

// ── 5. backdrop click closes the modal ───────────────────────────────────────
test('libraryUi: backdrop click closes the modal', async () => {
  const { ui, doc } = setup({ loadAllBundled: async () => [] });
  await ui.open();
  const backdrop = doc.getElementById('mission-library-backdrop');
  backdrop._click();
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true);
});

// ── 6. close button click closes the modal ───────────────────────────────────
test('libraryUi: close button click closes the modal', async () => {
  const { ui, doc } = setup({ loadAllBundled: async () => [] });
  await ui.open();
  const closeBtn = doc.getElementById('btn-library-close');
  closeBtn._click();
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true);
});

// ── 7. New Mission button closes modal and calls app.enterEditor with no mission
test('libraryUi: New Mission button closes modal and calls app.enterEditor falsy', async () => {
  const { ui, doc, calls } = setup({ loadAllBundled: async () => [] });
  await ui.open();
  const newBtn = doc.getElementById('btn-library-new');
  newBtn._click();
  assert.strictEqual(calls.enterEditor.length, 1);
  assert.ok(!calls.enterEditor[0], 'enterEditor should be called with no/falsy mission');
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true);
});

// ── 8. empty state shows when no missions ────────────────────────────────────
test('libraryUi: empty state shows when storage empty and no bundled', async () => {
  const { ui, doc } = setup({ loadAllBundled: async () => [] });
  await ui.open();
  const emptyEl = doc.getElementById('library-empty');
  assert.strictEqual(emptyEl.hidden, false);
});

// ── 9. saved user missions render as cards in the grid ───────────────────────
test('libraryUi: saved user missions render as cards in the grid', async () => {
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [] });
  const m2 = { ...BASE_MISSION, id: 'u2', title: 'Second' };
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  ctx.MISSIONS.library.saveUserMission(storage, m2, null);
  await ui.open();
  const grid = doc.getElementById('library-grid');
  const cards = grid.querySelectorAll('.library-card');
  assert.strictEqual(cards.length, 2);
});

// ── 10. card shows title, author, step count, point total ────────────────────
test('libraryUi: card shows title, author, step count and point total', async () => {
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [] });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  await ui.open();
  const grid = doc.getElementById('library-grid');

  function collectText(el) {
    let text = el.textContent || '';
    for (const c of el.children) text += collectText(c);
    return text;
  }
  const card = grid.children[0];
  assert.ok(card, 'should have a card');
  const cardText = collectText(card);
  assert.ok(cardText.includes('Test Mission'), 'card should show title');
  assert.ok(cardText.includes('Alice'),        'card should show author');
  assert.ok(cardText.includes('2'),            'card should show step count');
  assert.ok(cardText.includes('30'),           'card should show total pts');
});

// ── 11. card star rating reads from MISSIONS.persistence.getBest ─────────────
test('libraryUi: card shows 2 lit stars when getBest returns stars:2', async () => {
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [] });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  // Stub getBest to return 2 stars
  ctx.MISSIONS.persistence.getBest = () => ({ stars: 2, score: 70, ts: 1 });
  await ui.open();
  const grid = doc.getElementById('library-grid');
  const card = grid.children[0];

  function findAll(el, cls, out) {
    if (el.classList && el.classList.contains(cls)) out.push(el);
    for (const c of el.children) findAll(c, cls, out);
  }
  const lit = [];
  findAll(card, 'lit', lit);
  assert.strictEqual(lit.length, 2, 'should have 2 lit stars');
});

// ── 12. card without persisted run shows 0 lit stars ─────────────────────────
test('libraryUi: card shows 0 lit stars when no run persisted', async () => {
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [] });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  ctx.MISSIONS.persistence.getBest = () => null;
  await ui.open();
  const grid = doc.getElementById('library-grid');
  const card = grid.children[0];

  function findAll(el, cls, out) {
    if (el.classList && el.classList.contains(cls)) out.push(el);
    for (const c of el.children) findAll(c, cls, out);
  }
  const lit = [];
  findAll(card, 'lit', lit);
  assert.strictEqual(lit.length, 0, 'should have 0 lit stars');
});

// ── 13. rail tab "Mine" filters to user missions only ─────────────────────────
test('libraryUi: rail "Mine" filters to only user missions', async () => {
  const bundled = { ...BASE_MISSION, id: 'b1', title: 'Bundled One' };
  const { ctx, ui, doc, storage } = setup({
    loadAllBundled: async () => [bundled],
  });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  await ui.open();
  const grid = doc.getElementById('library-grid');
  assert.strictEqual(grid.querySelectorAll('.library-card').length, 2, 'should show 2 cards on "all"');

  const rail = doc.getElementById('library-rail');
  const mineBtn = rail.querySelectorAll('.library-rail-btn').find
    ? rail.querySelectorAll('.library-rail-btn').find(b => b.attrs['data-source'] === 'mine')
    : Array.from(rail.querySelectorAll('.library-rail-btn')).find(b => b.attrs['data-source'] === 'mine');

  assert.ok(mineBtn, 'should have mine rail button');
  // Simulate click on the button — the handler fires on the rail element with target = the button.
  // The click triggers an internal refresh(); flush microtasks to let it settle.
  rail._fire('click', { target: mineBtn });
  await new Promise(resolve => setTimeout(resolve, 0));

  const cards = grid.querySelectorAll('.library-card');
  assert.strictEqual(cards.length, 1, 'Mine filter should show 1 user card');
});

// ── 14. rail tab "Bundled" filters to bundled only ───────────────────────────
test('libraryUi: rail "Bundled" filters to only bundled missions', async () => {
  const bundled = { ...BASE_MISSION, id: 'b1', title: 'Bundled One' };
  const { ctx, ui, doc, storage } = setup({
    loadAllBundled: async () => [bundled],
  });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  await ui.open();

  const rail = doc.getElementById('library-rail');
  const allBtns = rail.querySelectorAll('.library-rail-btn');
  const bundledBtn = allBtns.find
    ? allBtns.find(b => b.attrs['data-source'] === 'bundled')
    : Array.from(allBtns).find(b => b.attrs['data-source'] === 'bundled');

  rail._fire('click', { target: bundledBtn });
  await new Promise(resolve => setTimeout(resolve, 0));

  const grid = doc.getElementById('library-grid');
  const cards = grid.querySelectorAll('.library-card');
  assert.strictEqual(cards.length, 1, 'Bundled filter should show 1 bundled card');
});

// ── 15. Play button closes modal and calls app.enterPlay with mission ─────────
test('libraryUi: Play button closes modal and calls app.enterPlay with the mission', async () => {
  const { ctx, ui, doc, storage, calls } = setup({ loadAllBundled: async () => [] });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  await ui.open();
  const grid = doc.getElementById('library-grid');
  const card = grid.children[0];

  function findFirst(el, cls) {
    if (el.classList && el.classList.contains(cls)) return el;
    for (const c of el.children) { const r = findFirst(c, cls); if (r) return r; }
    return null;
  }
  const playBtn = findFirst(card, 'play-btn');
  assert.ok(playBtn, 'should have a play button');
  playBtn._click();
  assert.strictEqual(calls.enterPlay.length, 1, 'enterPlay should be called once');
  assert.strictEqual(calls.enterPlay[0].id, BASE_MISSION.id, 'enterPlay should receive the mission');
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true, 'modal should close after play');
});

// ── 16. Edit button closes modal and calls app.enterEditor with mission ───────
test('libraryUi: Edit button closes modal and calls app.enterEditor with the mission', async () => {
  const { ctx, ui, doc, storage, calls } = setup({ loadAllBundled: async () => [] });
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  await ui.open();
  const grid = doc.getElementById('library-grid');
  const card = grid.children[0];

  function findFirst(el, cls) {
    if (el.classList && el.classList.contains(cls)) return el;
    for (const c of el.children) { const r = findFirst(c, cls); if (r) return r; }
    return null;
  }
  // The edit button doesn't have a class; find by textContent
  function findByText(el, text) {
    if (el.textContent === text) return el;
    for (const c of el.children) { const r = findByText(c, text); if (r) return r; }
    return null;
  }
  const editBtn = findByText(card, 'Edit');
  assert.ok(editBtn, 'should have an Edit button');
  editBtn._click();
  assert.strictEqual(calls.enterEditor.length, 1, 'enterEditor should be called once');
  assert.strictEqual(calls.enterEditor[0].id, BASE_MISSION.id);
  const modal = doc.getElementById('mission-library-modal');
  assert.strictEqual(modal.hidden, true, 'modal should close after edit');
});

// ── 17. Delete button removes user mission and re-renders ─────────────────────
test('libraryUi: delete button removes user mission and re-renders grid without it', async () => {
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [] });
  const m2 = { ...BASE_MISSION, id: 'u2', title: 'Second' };
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  ctx.MISSIONS.library.saveUserMission(storage, m2, null);
  await ui.open();
  const grid = doc.getElementById('library-grid');
  assert.strictEqual(grid.querySelectorAll('.library-card').length, 2);

  // Find the delete button on the first card
  const firstCard = grid.children[0];
  function findFirst(el, cls) {
    if (el.classList && el.classList.contains(cls)) return el;
    for (const c of el.children) { const r = findFirst(c, cls); if (r) return r; }
    return null;
  }
  const delBtn = findFirst(firstCard, 'delete-btn');
  assert.ok(delBtn, 'should have a delete button');
  delBtn._click();
  // The click triggers an internal refresh(); flush microtasks to let it settle.
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.strictEqual(grid.querySelectorAll('.library-card').length, 1);
  // The deleted mission should be gone from storage
  const remaining = ctx.MISSIONS.library.readUserMissions(storage);
  assert.strictEqual(remaining.length, 1);
});

// ── 18. bundled missions don't have a delete button ──────────────────────────
test('libraryUi: bundled missions do not have a delete button', async () => {
  const bundled = { ...BASE_MISSION, id: 'b1', title: 'Bundled One' };
  const { ui, doc } = setup({ loadAllBundled: async () => [bundled] });
  await ui.open();
  const grid = doc.getElementById('library-grid');
  const card = grid.children[0];
  assert.ok(card, 'should have a card');

  function findFirst(el, cls) {
    if (el.classList && el.classList.contains(cls)) return el;
    for (const c of el.children) { const r = findFirst(c, cls); if (r) return r; }
    return null;
  }
  const delBtn = findFirst(card, 'delete-btn');
  assert.strictEqual(delBtn, null, 'bundled card should not have a delete button');
});

// ── 19. count badge shows total mission count ─────────────────────────────────
test('libraryUi: count badge shows total mission count', async () => {
  const bundled = { ...BASE_MISSION, id: 'b1', title: 'Bundled One' };
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [bundled] });
  const m2 = { ...BASE_MISSION, id: 'u2', title: 'Second' };
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  ctx.MISSIONS.library.saveUserMission(storage, m2, null);
  await ui.open();
  const badge = doc.getElementById('library-count-badge');
  assert.ok(badge.textContent.includes('3'), 'badge should show 3 missions');
  assert.ok(badge.textContent.toUpperCase().includes('MISSION'), 'badge should say MISSION');
});

// ── 20. rail counts for each source match ────────────────────────────────────
test('libraryUi: rail counts for each source are correct', async () => {
  const bundled = { ...BASE_MISSION, id: 'b1', title: 'Bundled One' };
  const { ctx, ui, doc, storage } = setup({ loadAllBundled: async () => [bundled] });
  const m2 = { ...BASE_MISSION, id: 'u2', title: 'Second User' };
  ctx.MISSIONS.library.saveUserMission(storage, BASE_MISSION, null);
  ctx.MISSIONS.library.saveUserMission(storage, m2, null);
  await ui.open();
  assert.strictEqual(doc.getElementById('rail-count-all').textContent,      '3');
  assert.strictEqual(doc.getElementById('rail-count-bundled').textContent,  '1');
  assert.strictEqual(doc.getElementById('rail-count-mine').textContent,     '2');
  assert.strictEqual(doc.getElementById('rail-count-imported').textContent, '0');
});
