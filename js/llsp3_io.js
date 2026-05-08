'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});
  const JSZip = global.JSZip;
  if (!JSZip) throw new Error('llsp3_io requires JSZip to be loaded first');

  async function read(arrayBufferOrUint8) {
    const zip = await JSZip.loadAsync(arrayBufferOrUint8);
    const manifestEntry = zip.file('manifest.json');
    if (!manifestEntry) throw new Error('Not an .llsp3: missing manifest.json');

    const manifestText = await manifestEntry.async('string');
    let manifest;
    try { manifest = JSON.parse(manifestText); }
    catch (e) { throw new Error(`manifest.json is not valid JSON: ${e.message}`); }

    if (manifest.type === 'python') {
      const bodyEntry = zip.file('projectbody.json');
      if (!bodyEntry) throw new Error('Python .llsp3 missing projectbody.json');
      const bodyText = await bodyEntry.async('string');
      const code = LLSP3.python.readProjectBody(bodyText);
      return { type: 'python', manifest, python: code };
    }
    if (manifest.type === 'word-blocks') {
      const sb3Entry = zip.file('scratch.sb3');
      if (!sb3Entry) throw new Error('Word-Blocks .llsp3 missing scratch.sb3');
      const sb3Buffer = await sb3Entry.async('uint8array');
      return { type: 'word-blocks', manifest, sb3: sb3Buffer };
    }
    throw new Error(`Unsupported .llsp3 type: ${manifest.type}`);
  }

  LLSP3.io = { read };
})(typeof window !== 'undefined' ? window : globalThis);
