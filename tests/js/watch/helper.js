'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../../js/watch_panel.js'),
  'utf8',
);

// Returns a sandbox with mocked DOM. Tests inspect pane / list.children
// directly to assert on renderer output; the api field gives access to
// the public window._watch surface.
function loadWatchPanel() {
  const rafQueue = [];
  const flushRaf = () => {
    while (rafQueue.length) {
      const cb = rafQueue.shift();
      cb(performance.now());
    }
  };
  const setTimeouts = [];
  const flushTimers = () => {
    while (setTimeouts.length) {
      const { fn } = setTimeouts.shift();
      fn();
    }
  };

  function makeElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      children: [],
      classList: {
        _set: new Set(),
        add(c)    { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); },
        toggle(c, on) {
          if (on === undefined) on = !this._set.has(c);
          on ? this._set.add(c) : this._set.delete(c);
          return on;
        },
      },
      dataset: {},
      style: {},
      textContent: '',
      title: '',
      id: '',
      _eventListeners: {},
      get innerHTML() { return ''; },
      set innerHTML(v) { this.children = []; },
      appendChild(child) { this.children.push(child); return child; },
      querySelector() { return null; },
      addEventListener(name, fn) {
        (this._eventListeners[name] = this._eventListeners[name] || []).push(fn);
      },
    };
    return el;
  }

  // The parent row hosts the .empty class that the renderer toggles to
  // signal to CSS that the watch pane (and its handle) should be hidden.
  const contentRow = makeElement('div');
  contentRow.classList.add('console-content-row');
  const pane = makeElement('div');
  pane.classList.add('watch-pane');
  pane.parentElement = contentRow;
  contentRow.appendChild(pane);
  const list = makeElement('div');
  list.id = 'watch-pane-list';
  pane.appendChild(list);

  const elementsById = { 'watch-pane-list': list };
  const elementsBySelector = { '.watch-pane': pane };

  const documentStub = {
    readyState: 'complete',
    addEventListener(name, fn) { /* no DOMContentLoaded needed since readyState complete */ },
    getElementById(id) { return elementsById[id] || null; },
    querySelector(sel) { return elementsBySelector[sel] || null; },
    createElement: makeElement,
  };

  const root = {};
  const context = vm.createContext({
    window: root,
    globalThis: root,
    document: documentStub,
    requestAnimationFrame(cb) { rafQueue.push(cb); return rafQueue.length; },
    setTimeout(fn, _ms) { setTimeouts.push({ fn }); return setTimeouts.length; },
    performance: { now: () => Date.now() },
    console,
  });
  vm.runInContext(SRC, context);

  return {
    api: root._watch,
    pane,
    list,
    contentRow,
    flushRaf,
    flushTimers,
  };
}

module.exports = { loadWatchPanel };
