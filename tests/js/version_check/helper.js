'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../js/version_check.js'),
  'utf8',
);

function loadVersionCheck() {
  const root = {};
  const context = vm.createContext({
    window: root,
    globalThis: root,
    console,
  });
  vm.runInContext(SRC, context);
  return root.versionCheck;
}

module.exports = { loadVersionCheck };
