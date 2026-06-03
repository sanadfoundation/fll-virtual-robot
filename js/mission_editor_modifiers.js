'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  function attach(app, doc) {
    const $ = (id) => doc.getElementById(id);

    const pokeEnabled     = $('editor-mod-poke-enabled');
    const pokeMin         = $('editor-mod-poke-interval-min');
    const pokeMax         = $('editor-mod-poke-interval-max');
    const pokeSeverity    = $('editor-mod-poke-severity');
    const frictionEnabled = $('editor-mod-friction-enabled');
    const frictionMult    = $('editor-mod-friction-multiplier');

    function patchPoke(patch) {
      if (app.mode !== 'editor' || !app.editorState) return;
      const next = MISSIONS.editor.state.setModifiers(app.editorState, { poke: patch });
      app.setEditorState(next);
    }

    function patchFriction(patch) {
      if (app.mode !== 'editor' || !app.editorState) return;
      const next = MISSIONS.editor.state.setModifiers(app.editorState, { friction: patch });
      app.setEditorState(next);
    }

    if (pokeEnabled)     pokeEnabled    .addEventListener('change', (e) => patchPoke({ enabled: e.target.checked }));
    if (pokeMin)         pokeMin        .addEventListener('input',  (e) => patchPoke({ interval_min_s: parseFloat(e.target.value) || 1 }));
    if (pokeMax)         pokeMax        .addEventListener('input',  (e) => patchPoke({ interval_max_s: parseFloat(e.target.value) || 1 }));
    if (pokeSeverity)    pokeSeverity   .addEventListener('input',  (e) => patchPoke({ severity: parseFloat(e.target.value) }));
    if (frictionEnabled) frictionEnabled.addEventListener('change', (e) => patchFriction({ enabled: e.target.checked }));
    if (frictionMult)    frictionMult   .addEventListener('input',  (e) => patchFriction({ multiplier: parseFloat(e.target.value) }));

    app.onChange(({ mode, editorState }) => {
      if (mode !== 'editor' || !editorState) return;
      const mods = editorState.modifiers;
      if (pokeEnabled)     pokeEnabled    .checked = mods.poke.enabled;
      if (pokeMin)         pokeMin        .value   = String(mods.poke.interval_min_s);
      if (pokeMax)         pokeMax        .value   = String(mods.poke.interval_max_s);
      if (pokeSeverity)    pokeSeverity   .value   = String(mods.poke.severity);
      if (frictionEnabled) frictionEnabled.checked = mods.friction.enabled;
      if (frictionMult)    frictionMult   .value   = String(mods.friction.multiplier);
    });
  }

  editor.modifiers = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
