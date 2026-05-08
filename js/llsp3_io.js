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

  const PYTHON_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="12" fill="#3b82f6"/>` +
    `<text x="48" y="58" text-anchor="middle" font-family="monospace" font-size="32" fill="#fff">Py</text>` +
    `</svg>`;

  const BLOCKS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="12" fill="#fbbf24"/>` +
    `<text x="48" y="58" text-anchor="middle" font-family="monospace" font-size="32" fill="#1f2937">Bl</text>` +
    `</svg>`;

  async function write(project) {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify(project.manifest));

    if (project.type === 'python') {
      zip.file('projectbody.json', LLSP3.python.writeProjectBody(project.python));
      zip.file('icon.svg', PYTHON_ICON_SVG);
    } else if (project.type === 'word-blocks') {
      if (!project.sb3) throw new Error('write: word-blocks project requires sb3 bytes');
      zip.file('scratch.sb3', project.sb3);
      zip.file('icon.svg', BLOCKS_ICON_SVG);
    } else {
      throw new Error(`write: unsupported project type ${project.type}`);
    }

    return await zip.generateAsync({ type: 'uint8array' });
  }

  LLSP3.io = { read, write };
})(typeof window !== 'undefined' ? window : globalThis);
