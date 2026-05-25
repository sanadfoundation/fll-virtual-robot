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

  editor.io = { writeBundle, readBundle };
})(typeof window !== 'undefined' ? window : globalThis);
