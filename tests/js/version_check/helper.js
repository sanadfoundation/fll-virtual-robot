'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../js/version_check.js'),
  'utf8',
);

function loadVersionCheckWithRoot(rootInit) {
  const root = Object.assign({}, rootInit || {});
  const context = vm.createContext({
    window: root,
    globalThis: root,
    console,
    URL: globalThis.URL,
  });
  vm.runInContext(SRC, context);
  return { api: root.versionCheck, root };
}

function loadVersionCheck() {
  return loadVersionCheckWithRoot().api;
}

module.exports = { loadVersionCheck, loadVersionCheckWithRoot };
