'use strict';

// Live variable watch — one Map of name → value, one rAF-coalesced renderer,
// one DOM target. Installed as window._watch so Blockly codegen (`_watch.set`,
// `_watch.declare`) and the simulator's 'var_update' bridge case can both
// reach it through the same surface. Read-only from the user's perspective.

(function () {
  // ── State ────────────────────────────────────────────────────────────
  const state = new Map();              // name → { value, isChanged }
  let renderScheduled = false;
  let pane = null;
  let list = null;

  // ── DOM lookup (deferred until DOMContentLoaded) ─────────────────────
  function _ensureDom() {
    if (pane && list) return true;
    if (typeof document === 'undefined') return false;
    pane = document.querySelector('.watch-pane');
    list = document.getElementById('watch-pane-list');
    return !!(pane && list);
  }

  // ── Value formatting ─────────────────────────────────────────────────
  function _format(v) {
    if (typeof v === 'number') {
      return Number.isInteger(v) ? String(v) : v.toFixed(3);
    }
    if (typeof v === 'boolean')  return v ? 'true' : 'false';
    if (typeof v === 'string')   return JSON.stringify(v);
    if (v === null)              return 'null';
    if (v === undefined)         return 'undefined';
    if (Array.isArray(v)) {
      const inner = v.map(_format).join(', ');
      const full = '[' + inner + ']';
      if (full.length <= 32) return full;
      return full.slice(0, 29) + '…]';
    }
    try { return JSON.stringify(v); } catch (_) { return String(v); }
  }

  // ── Render (rAF-coalesced) ───────────────────────────────────────────
  function _scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(_render);
  }

  function _render() {
    renderScheduled = false;
    if (!_ensureDom()) return;

    const row = pane.parentElement;
    if (row && row.classList) row.classList.toggle('empty', state.size === 0);

    if (state.size === 0) {
      // Clear list and slide pane out.
      list.innerHTML = '';
      pane.classList.remove('visible');
      return;
    }

    // Make sure the pane is mounted and animating in. Display first, then
    // add .visible in the next frame so the CSS transition runs.
    if (pane.style.display === 'none' || pane.style.display === '') {
      pane.style.display = 'flex';
    }
    if (!pane.classList.contains('visible')) {
      requestAnimationFrame(() => pane.classList.add('visible'));
    }

    const entries = Array.from(state.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    // TODO(diff-render): rebuild every render orphans setTimeout closures on
    // detached rows, so a set() within an active flash window leaves the new
    // row to its own timer. Cosmetic only — switch to a row-reuse diff if a
    // jumpy animation surfaces in practice.
    list.innerHTML = '';
    for (const [name, info] of entries) {
      const row = document.createElement('div');
      row.classList.add('watch-row');
      row.dataset.name = name;
      const formatted = _format(info.value);
      const nameSpan  = document.createElement('span');
      nameSpan.classList.add('watch-row-name');
      nameSpan.textContent = name;
      const valueSpan = document.createElement('span');
      valueSpan.classList.add('watch-row-value');
      valueSpan.textContent = formatted;
      valueSpan.title = String(info.value);
      row.appendChild(nameSpan);
      row.appendChild(valueSpan);
      list.appendChild(row);

      if (info.isChanged) {
        row.classList.add('flash');
        setTimeout(() => row.classList.remove('flash'), 600);
      }
      info.isChanged = false;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────
  const api = {
    declare(name, value) {
      if (state.has(name)) return;       // idempotent
      state.set(name, { value, isChanged: false });
      _scheduleRender();
    },
    set(name, value) {
      const prev = state.get(name);
      const changed = !prev || !_valuesEqual(prev.value, value);
      state.set(name, { value, isChanged: changed });
      _scheduleRender();
    },
    clear() {
      state.clear();
      _scheduleRender();
    },
    _snapshot() {
      const out = {};
      for (const [k, v] of state.entries()) out[k] = v.value;
      return out;
    },
  };

  function _valuesEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!_valuesEqual(a[i], b[i])) return false;
      }
      return true;
    }
    return false;
  }

  // ── Hook up transitionend so the pane fully hides after slide-out ───
  function _attachHideListener() {
    if (!_ensureDom()) return;
    pane.addEventListener('transitionend', (e) => {
      if (e.propertyName !== 'width') return;
      if (state.size === 0) pane.style.display = 'none';
    });
  }

  // ── DOM-ready boot ───────────────────────────────────────────────────
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        _ensureDom();
        _attachHideListener();
      });
    } else {
      _ensureDom();
      _attachHideListener();
    }
  }

  // ── Expose on window ─────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window._watch = api;
  } else if (typeof globalThis !== 'undefined') {
    globalThis._watch = api;
  }
})();
