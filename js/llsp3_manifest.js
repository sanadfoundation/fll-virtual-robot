'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

  function genId() {
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    }
    return id;
  }

  function defaultManifest(type, opts = {}) {
    const now = new Date().toISOString();
    const name = opts.name || 'Untitled';
    const id = opts.id || genId();

    if (type === 'python') {
      return {
        type: 'python',
        appType: 'llsp3',
        autoDelete: false,
        created: now,
        id,
        lastsaved: now,
        size: 0,
        name,
        slotIndex: 0,
        workspaceX: -155,
        workspaceY: 0,
        zoomLevel: 0.5,
        hardware: { python: { type: 'flipper' } },
        state: { canvasDrawerOpen: true, hasMonitors: false, playMode: 'download' },
        extraFiles: [],
        lastConnectedHubType: 'flipper',
      };
    }
    if (type === 'word-blocks') {
      return {
        type: 'word-blocks',
        autoDelete: false,
        created: now,
        id,
        lastsaved: now,
        size: 0,
        name,
        slotIndex: 0,
        workspaceX: 0,
        workspaceY: 0,
        zoomLevel: 0.675,
        showAllBlocks: false,
        version: 38,
        hardware: { flipper: { type: 'flipper' } },
        extensions: [],
        state: { playMode: 'download', canvasDrawerOpen: false },
        extraFiles: [],
      };
    }
    throw new Error(`Unknown manifest type: ${type}`);
  }

  LLSP3.manifest = { defaultManifest, genId };
})(typeof window !== 'undefined' ? window : globalThis);
