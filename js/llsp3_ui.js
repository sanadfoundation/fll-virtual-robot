// js/llsp3_ui.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  const DEFAULT_NAME = 'Untitled';

  // hooks: {
  //   getActiveMode():       'python' | 'blocks'
  //   getPythonSource():     string
  //   setPythonSource(text): void
  //   getBlocklyState():     object   (from Blockly.serialization.workspaces.save)
  //   setBlocklyState(state):void
  //   switchTab(mode):       void
  //   isDirty():             boolean
  //   setDirty(flag):        void
  //   getProjectName():      string
  //   setProjectName(name):  void
  //   loadedManifest:        object | null  (last-loaded manifest, for re-save merge)
  //   setLoadedManifest(m):  void
  //   appendOutput(text, cls): void
  // }
  function init(hooks) {
    const fileInput = document.getElementById('file-open-input');
    const openBtn   = document.getElementById('btn-open');
    const saveBtn   = document.getElementById('btn-save');
    const nameInput = document.getElementById('project-name');

    if (!fileInput || !openBtn || !saveBtn || !nameInput) {
      console.error('llsp3_ui: required header elements missing');
      return;
    }

    nameInput.value = hooks.getProjectName() || DEFAULT_NAME;
    nameInput.addEventListener('input', () => {
      hooks.setProjectName(nameInput.value || DEFAULT_NAME);
      hooks.setDirty(true);
    });

    openBtn.addEventListener('click', () => {
      if (hooks.isDirty()) {
        const ok = window.confirm('You have unsaved changes. Discard and load this file?');
        if (!ok) return;
      }
      fileInput.value = '';
      fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const result = await LLSP3.io.read(buffer);

        if (result.type === 'python') {
          hooks.setPythonSource(result.python);
          hooks.switchTab('python');
        } else if (result.type === 'word-blocks') {
          const sb3 = await LLSP3.blocks.readSb3(result.sb3);
          const state = LLSP3.blocks.sb3BlocksToBlocklyState(sb3.blocks);
          hooks.setBlocklyState(state);
          hooks.switchTab('blocks');
        }

        const name = (result.manifest && result.manifest.name) || DEFAULT_NAME;
        hooks.setProjectName(name);
        nameInput.value = name;
        hooks.setLoadedManifest(result.manifest);
        hooks.setDirty(false);
        hooks.appendOutput(`[load] Opened "${name}"`, 'info');
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        let display;
        if (/missing manifest|invalid JSON|loadAsync/i.test(msg)) {
          display = "[load] Couldn't read this file — it doesn't look like a .llsp3.";
        } else if (/Unsupported \.llsp3 type/i.test(msg)) {
          display = `[load] This file uses a project type the simulator doesn't support.`;
        } else {
          display = '[load] ' + msg;
        }
        hooks.appendOutput(display, 'error');
      }
    });

    saveBtn.addEventListener('click', async () => {
      const mode = hooks.getActiveMode();
      const name = hooks.getProjectName() || DEFAULT_NAME;

      try {
        let llsp3Bytes;
        if (mode === 'python') {
          const code = hooks.getPythonSource();
          const manifest = hooks.loadedManifest && hooks.loadedManifest.type === 'python'
            ? LLSP3.manifest.mergeForSave(hooks.loadedManifest, { name })
            : LLSP3.manifest.defaultManifest('python', { name });
          llsp3Bytes = await LLSP3.io.write({ type: 'python', manifest, python: code });
        } else {
          const state = hooks.getBlocklyState();
          const sb3Blocks = LLSP3.blocks.blocklyStateToSb3Blocks(state);
          const extensions = LLSP3.blocks.deriveExtensions(sb3Blocks);
          const sb3 = await LLSP3.blocks.writeSb3(sb3Blocks, extensions);
          const manifest = hooks.loadedManifest && hooks.loadedManifest.type === 'word-blocks'
            ? LLSP3.manifest.mergeForSave(hooks.loadedManifest, { name, extensions })
            : LLSP3.manifest.defaultManifest('word-blocks', { name });
          if (!manifest.extensions || !manifest.extensions.length) manifest.extensions = extensions;
          llsp3Bytes = await LLSP3.io.write({ type: 'word-blocks', manifest, sb3 });
        }

        triggerDownload(llsp3Bytes, `${name}.llsp3`);
        hooks.setDirty(false);
        hooks.appendOutput(`[save] Saved "${name}.llsp3"`, 'info');
      } catch (e) {
        hooks.appendOutput('[save] ' + (e && e.message ? e.message : String(e)), 'error');
      }
    });
  }

  function triggerDownload(uint8, filename) {
    const blob = new Blob([uint8], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  LLSP3.ui = { init };
})(typeof window !== 'undefined' ? window : globalThis);
