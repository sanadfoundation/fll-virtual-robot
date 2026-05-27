'use strict';
(function (global) {
  const MISSIONS = (global.MISSIONS = global.MISSIONS || {});
  const editor = (MISSIONS.editor = MISSIONS.editor || {});
  const JSZip = global.JSZip;
  if (!JSZip) throw new Error('mission_editor_io requires JSZip to be loaded first');

  async function writeBundle(mission, opts = {}) {
    const zip = new JSZip();
    zip.file('mission.json', JSON.stringify(mission, null, 2));
    if (opts.screenshot) zip.file('screenshot.png', opts.screenshot);
    if (opts.readme)     zip.file('README.md',     opts.readme);
    return await zip.generateAsync({ type: 'uint8array' });
  }

  async function readBundle(arrayBufferOrUint8) {
    const zip = await JSZip.loadAsync(arrayBufferOrUint8);
    const missionEntry = zip.file('mission.json');
    if (!missionEntry) throw new Error('Not an .llmission: missing mission.json');
    const text = await missionEntry.async('string');
    let raw;
    try { raw = JSON.parse(text); }
    catch (e) { throw new Error(`mission.json is not valid JSON: ${e.message}`); }
    const mission = MISSIONS.loader.load(raw);
    const out = { mission };
    if (zip.file('screenshot.png')) out.screenshot = await zip.file('screenshot.png').async('uint8array');
    if (zip.file('README.md'))      out.readme     = await zip.file('README.md').async('string');
    return out;
  }

  function slugify(s) {
    return (s || 'mission')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'mission';
  }

  function attach(app, doc, opts = {}) {
    const downloadFile = opts.downloadFile || _browserDownload;
    const captureScreenshot = opts.captureScreenshot || _defaultCaptureScreenshot;
    const btnSave = doc.getElementById('btn-editor-save');
    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        if (app.mode !== 'editor' || !app.editorState) return;
        const r = MISSIONS.editor.state.validate(app.editorState);
        if (!r.ok) {
          _showError(doc, r.error);
          return;
        }
        let screenshot = null;
        try {
          if (captureScreenshot) screenshot = await captureScreenshot();
        } catch (_e) { /* ignore screenshot failures */ }
        const bytes = await writeBundle(r.mission, screenshot ? { screenshot } : {});
        const filename = `${slugify(app.editorState.title)}.llmission`;
        downloadFile(filename, bytes);
        // Also persist to localStorage so the Mission Library shows it under My Missions.
        try {
          if (MISSIONS.library && MISSIONS.library.saveUserMission && global.localStorage) {
            const dataUrl = await _screenshotToDataUrl(screenshot);
            MISSIONS.library.saveUserMission(global.localStorage, r.mission, dataUrl);
          }
        } catch (_e) { /* non-fatal */ }
      });
    }

    const btnLoad = doc.getElementById('btn-editor-load');
    const fileInput = doc.getElementById('editor-file-open-input');
    if (btnLoad && fileInput) {
      btnLoad.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (ev) => {
        const file = ev.target && ev.target.files && ev.target.files[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        await loadBytesIntoEditor(app, new Uint8Array(buf));
        fileInput.value = '';
      });
    }

    const body = doc.body;
    if (body) {
      body.addEventListener('dragover', (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        if (ev && ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
      });
      body.addEventListener('drop', async (ev) => {
        if (ev && ev.preventDefault) ev.preventDefault();
        const files = ev && ev.dataTransfer && ev.dataTransfer.files;
        if (!files || !files.length) return;
        const file = files[0];
        if (!/\.llmission$/i.test(file.name || '')) return;
        const buf = await file.arrayBuffer();
        await loadBytesIntoEditor(app, new Uint8Array(buf));
      });
    }

    async function loadBytesIntoEditor(app, bytes) {
      try {
        const { mission } = await readBundle(bytes);
        app.enterEditor(mission);
      } catch (e) {
        _showError(doc, e.message);
      }
    }

    // Test seam.
    editor.io._test_loadBytes = (bytes) => loadBytesIntoEditor(app, bytes);
  }

  function _showError(doc, msg) {
    const toolbar = doc.getElementById('editor-toolbar');
    if (!toolbar) return;
    let tag = toolbar.querySelector('.editor-error');
    if (!tag) {
      tag = doc.createElement('span');
      tag.classList.add('editor-error');
      toolbar.appendChild(tag);
    }
    tag.textContent = `⚠ ${msg}`;
  }

  async function _defaultCaptureScreenshot() {
    if (typeof global.document === 'undefined') return null;
    const canvas = global.document.getElementById('robot-canvas');
    if (!canvas || typeof canvas.toBlob !== 'function') return null;
    return await new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)));
      }, 'image/png');
    });
  }

  async function _screenshotToDataUrl(bytes) {
    if (!bytes) return null;
    if (typeof global.Blob !== 'function' || typeof global.FileReader !== 'function') return null;
    return await new Promise((resolve) => {
      const blob = new global.Blob([bytes], { type: 'image/png' });
      const fr = new global.FileReader();
      fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  }

  function _browserDownload(filename, bytes) {
    if (!global.URL || !global.URL.createObjectURL) return;
    const blob = new global.Blob([bytes], { type: 'application/zip' });
    const url = global.URL.createObjectURL(blob);
    const a = global.document.createElement('a');
    a.href = url;
    a.download = filename;
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    setTimeout(() => global.URL.revokeObjectURL(url), 0);
  }

  editor.io = { writeBundle, readBundle, attach, _test_loadBytes: null };
})(typeof window !== 'undefined' ? window : globalThis);
