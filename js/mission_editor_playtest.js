'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});

  let savedEditorState = null;
  let savedApp = null;
  let savedStorage = null;
  let savedDoc = null;

  function attach(app, doc, storage) {
    savedApp = app; savedDoc = doc; savedStorage = storage || (global.localStorage || null);
    const btn = doc.getElementById('btn-editor-playtest');
    if (!btn) return;
    btn.addEventListener('click', () => playtest());
  }

  function playtest() {
    if (!savedApp || savedApp.mode !== 'editor') return;
    clearError();
    const result = MISSIONS.editor.state.validate(savedApp.editorState);
    if (!result.ok) { showError(result.error); return; }
    savedEditorState = savedApp.editorState;
    if (savedStorage && savedStorage.setItem) {
      savedStorage.setItem('mission_playtest_temp', JSON.stringify(MISSIONS.editor.state.serializeToMission(savedEditorState)));
    }
    savedApp.enterPlay(result.mission);

    // Re-label the exit button and intercept its click so it returns to editor.
    if (savedDoc) {
      const exit = savedDoc.getElementById('mm-exit');
      if (exit) {
        exit.textContent = '✕ Back to Editor';
        // The mm-exit button already has Plan 1's app.exitMission() handler attached.
        // Add our wrapper that detects the post-exitMission state and restores editor.
        const handler = () => {
          exit.removeEventListener('click', handler);
          exit.textContent = '✕ Exit Mission';
          if (savedApp.mode === 'sandbox') {
            // exitMission already ran; restore editor.
            savedApp.enterEditor();
            savedApp.setEditorState(savedEditorState);
            savedEditorState = null;
          } else {
            returnToEditor();
          }
        };
        exit.addEventListener('click', handler);
      }
    }
  }

  function returnToEditor() {
    if (!savedApp || savedApp.mode !== 'play') return;
    if (!savedEditorState) { savedApp.exitMission(); return; }
    savedApp.enterEditor();
    savedApp.setEditorState(savedEditorState);
    savedEditorState = null;
  }

  function showError(msg) {
    if (!savedDoc) return;
    const toolbar = savedDoc.getElementById('editor-toolbar');
    if (!toolbar) return;
    let tag = toolbar.querySelector('.editor-error');
    if (!tag) {
      tag = savedDoc.createElement('span');
      tag.classList.add('editor-error');
      toolbar.appendChild(tag);
    }
    tag.textContent = `⚠ ${msg}`;
  }

  function clearError() {
    if (!savedDoc) return;
    const toolbar = savedDoc.getElementById('editor-toolbar');
    if (!toolbar) return;
    const tag = toolbar.querySelector('.editor-error');
    if (tag) toolbar.removeChild(tag);
  }

  editor.playtest = { attach, playtest, returnToEditor };
})(typeof window !== 'undefined' ? window : globalThis);
