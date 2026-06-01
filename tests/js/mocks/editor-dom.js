'use strict';

// Richer DOM mock for editor tests: tracks parent/child, listeners, dataset,
// classList with toggle, attributes, and a working querySelector for class
// and id selectors only (no descendant combinators, no pseudo-classes).
// Mirrors the makeEl pattern in tests/js/mocks/main-env.js but adds enough
// to drive multi-element editor flows.

function makeEl(tag) {
  const listeners = {};
  const el = {
    tag,
    parentEl: null,
    children: [],
    attrs: {},
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(...cs)       { for (const c of cs) this._set.add(c); },
      remove(...cs)    { for (const c of cs) this._set.delete(c); },
      contains(c)      { return this._set.has(c); },
      toggle(c, on)    {
        const want = (on === undefined) ? !this._set.has(c) : !!on;
        if (want) this._set.add(c); else this._set.delete(c);
        return want;
      },
      get length()     { return this._set.size; },
    },
    textContent: '',
    get innerHTML() { return ''; },
    set innerHTML(v) {
      if (v === '' || v == null) {
        // Clear all children
        while (el.children.length) {
          const c = el.children[0];
          el.children.splice(0, 1);
          c.parentEl = null;
        }
      }
      // Non-empty innerHTML is not implemented; only '' clearing is needed for tests.
    },
    value: '',
    hidden: false,
    disabled: false,
    appendChild(c) {
      if (c.parentEl) c.parentEl.removeChild(c);
      this.children.push(c);
      c.parentEl = this;
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) { this.children.splice(i, 1); c.parentEl = null; }
      return c;
    },
    insertBefore(newC, refC) {
      if (newC.parentEl) newC.parentEl.removeChild(newC);
      const i = refC ? this.children.indexOf(refC) : this.children.length;
      this.children.splice(i < 0 ? this.children.length : i, 0, newC);
      newC.parentEl = this;
      return newC;
    },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k)    { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(name, cb) {
      (listeners[name] = listeners[name] || []).push(cb);
    },
    removeEventListener(name, cb) {
      const arr = listeners[name];
      if (!arr) return;
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    },
    _fire(name, event) {
      const arr = listeners[name] || [];
      for (const cb of arr.slice()) cb(event || { type: name, target: el });
    },
    _click() { this._fire('click'); },
    querySelector(sel) {
      return _findFirst(this, sel);
    },
    querySelectorAll(sel) {
      const out = [];
      _findAll(this, sel, out);
      return out;
    },
    closest(sel) {
      // Walk up the tree (including self) looking for the selector.
      let cur = el;
      while (cur) {
        if (_matches(cur, sel)) return cur;
        cur = cur.parentEl;
      }
      return null;
    },
    focus() {},
    blur() {},
    click() { this._click(); },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
  };
  return el;
}

function _matches(el, sel) {
  if (sel.startsWith('#')) return el.attrs.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  return el.tag === sel;
}

function _findFirst(root, sel) {
  for (const c of root.children) {
    if (_matches(c, sel)) return c;
    const inner = _findFirst(c, sel);
    if (inner) return inner;
  }
  return null;
}

function _findAll(root, sel, out) {
  for (const c of root.children) {
    if (_matches(c, sel)) out.push(c);
    _findAll(c, sel, out);
  }
}

function makeDoc() {
  const idIndex = Object.create(null);
  const doc = {
    documentElement: makeEl('html'),
    body: makeEl('body'),
    _idIndex: idIndex,
    getElementById(id) { return idIndex[id] || null; },
    createElement(tag) {
      const el = makeEl(tag);
      const origSet = el.setAttribute.bind(el);
      el.setAttribute = function (k, v) {
        origSet(k, v);
        if (k === 'id') idIndex[v] = this;
      };
      Object.defineProperty(el, 'id', {
        get() { return el.attrs.id || ''; },
        set(v) { el.attrs.id = String(v); idIndex[v] = el; },
      });
      return el;
    },
    createElementNS(_ns, tag) {
      return doc.createElement(tag);
    },
    addEventListener() {},
    removeEventListener() {},
    querySelector(sel)    { return _findFirst(doc.body, sel); },
    querySelectorAll(sel) { const out = []; _findAll(doc.body, sel, out); return out; },
  };
  return doc;
}

// Pre-seeds a doc with the static editor HTML scaffold IDs that all editor
// modules read on mount. Each id maps to an empty createElement('div')-style
// element so modules can read/write textContent, attributes, children, etc.
function makeEditorDoc(idsExtra = []) {
  const doc = makeDoc();
  const ids = [
    // toolbar + shell
    'header-editor-controls', 'editor-title-input', 'btn-editor-save',
    'btn-editor-load', 'btn-editor-playtest', 'btn-editor-exit',
    'editor-canvas-overlay', 'editor-right-panel',
    // inspector
    'editor-inspector-section', 'editor-inspector-body',
    // metadata
    'editor-meta-section', 'editor-meta-desc', 'editor-meta-difficulty', 'editor-meta-type',
    'editor-meta-time-limit',
    'editor-meta-show-labels',    // ← add this line
    // steps
    'editor-steps-section', 'editor-steps-list', 'btn-add-step',
    // conditions
    'editor-cond-section', 'editor-cond-workspace',
    'btn-cond-back',    // ← add this line
    // shared with Plan 1 (sandbox surfaces hidden in editor mode)
    'mission-map', 'mission-map-title', 'mm-exit',
    // library modal
    'mission-library-modal', 'mission-library-backdrop',
    'btn-library-close', 'btn-library-new', 'btn-library-import',
    'library-file-input', 'library-rail', 'library-grid', 'library-empty',
    'library-count-badge',
    'rail-count-all', 'rail-count-bundled', 'rail-count-mine', 'rail-count-imported',
  ].concat(idsExtra);
  for (const id of ids) {
    const el = doc.createElement('div');
    el.setAttribute('id', id);
    doc.body.appendChild(el);
  }

  // Add rail buttons inside library-rail so click delegation works.
  const rail = doc.getElementById('library-rail');
  if (rail) {
    for (const source of ['all', 'bundled', 'mine', 'imported']) {
      const btn = doc.createElement('button');
      btn.classList.add('library-rail-btn');
      btn.setAttribute('data-source', source);
      rail.appendChild(btn);
    }
  }

  return doc;
}

module.exports = { makeEl, makeDoc, makeEditorDoc };
