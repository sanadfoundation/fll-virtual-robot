'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../js/feedback.js'),
  'utf8',
);

function loadFeedback() {
  const root = {};
  const context = vm.createContext({
    window: root,
    globalThis: root,
    console,
  });
  vm.runInContext(SRC, context);
  return root.feedback;
}

module.exports = { loadFeedback };
