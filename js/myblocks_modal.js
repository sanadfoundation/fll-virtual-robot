// js/myblocks_modal.js
//
// SPIKE-styled "Make a block" modal. Two layers:
//
//   1. createModalState() — pure controller object holding the argspec under
//      construction. No DOM. Fully unit-testable in Node.
//   2. openMyBlocksModal(Blockly) — the browser-only shell. Builds the DOM
//      mirroring the real SPIKE editor (.my-blocks > .my-blocks__content),
//      hosts a child Blockly workspace for the live preview, wires the
//      three "Add" cards to the state, and resolves a Promise with the
//      final argspec on SAVE (or null on Cancel).
//
// The shell intentionally has no inline-arg-delete UI yet — the SPIKE editor
// uses a contextual trash icon on hover. For MVP, users Cancel and restart;
// inline removal is a follow-up.
'use strict';
(function (global) {
  const MyBlocks = (global.MyBlocks = global.MyBlocks || {});

  function createModalState() {
    const procId = MyBlocks.genId ? MyBlocks.genId() : 'pid';
    let argspec = MyBlocks.seedArgspec ? MyBlocks.seedArgspec() : [{ kind: 'label', text: 'block name' }];
    const listeners = new Set();
    const fire = () => { for (const l of listeners) try { l(argspec); } catch (_e) {} };
    return {
      getProcId() { return procId; },
      getArgspec() { return argspec.map(t => Object.assign({}, t)); },
      addNumber()  { argspec = argspec.concat([MyBlocks.makeArgToken('number')]);  fire(); },
      addBoolean() { argspec = argspec.concat([MyBlocks.makeArgToken('boolean')]); fire(); },
      addLabel(text) {
        argspec = argspec.concat([MyBlocks.makeArgToken('label', text)]);
        fire();
      },
      removeAt(idx) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= argspec.length) return;
        argspec = argspec.slice(0, idx).concat(argspec.slice(idx + 1));
        fire();
      },
      editTokenText(idx, text) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= argspec.length) return;
        const t = argspec[idx];
        const next = Object.assign({}, t);
        if (t.kind === 'label') next.text = String(text || '');
        else                     next.name = String(text || '');
        argspec = argspec.slice(0, idx).concat([next], argspec.slice(idx + 1));
        fire();
      },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    };
  }

  MyBlocks.createModalState = createModalState;

  // ── Browser-only DOM shell ───────────────────────────────────────────────
  if (typeof global.document === 'undefined') return;
  const doc = global.document;

  function el(tag, opts, kids) {
    const n = doc.createElement(tag);
    if (opts) {
      if (opts.cls)  n.className = opts.cls;
      if (opts.text != null) n.textContent = String(opts.text);
      if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) n.setAttribute(k, v);
      if (opts.style) for (const [k, v] of Object.entries(opts.style)) n.style[k] = v;
      if (opts.on)    for (const [k, v] of Object.entries(opts.on))    n.addEventListener(k, v);
    }
    if (kids) for (const k of kids) if (k) n.appendChild(k);
    return n;
  }

  // Icon SVGs captured from the real LEGO editor (data URIs decoded and
  // embedded inline so the modal has no asset dependency).
  const ICONS = {
    number:  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 49"><rect x="0.5" y="0.5" width="56" height="48" rx="4" ry="4" fill="#ff6680" stroke="#f35"/><rect x="8.5" y="8.5" width="40" height="32" rx="16" ry="16" fill="#ff4d6a" stroke="#f35"/></svg>',
    boolean: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 49"><rect x="0.5" y="0.5" width="56" height="48" rx="4" ry="4" fill="#ff6680" stroke="#f35"/><path d="M32.5,40.5h-8l-16-16h0l16-16h8l16,16h0Z" fill="#ff4d6a" stroke="#f35" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    label:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 49"><rect x="0.5" y="0.5" width="56" height="48" rx="4" ry="4" fill="#ff6680" stroke="#f35"/><text x="28.5" y="31" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Helvetica Neue, Helvetica, sans-serif">text</text></svg>',
  };

  function openMyBlocksModal(Blockly) {
    return new Promise((resolve) => {
      const state = createModalState();

      // ── DOM scaffold (matches captured `.my-blocks` structure) ──────────
      const previewDiv = el('div', { cls: 'my-blocks__content__workspace' });
      const overlay = el('div', { cls: 'my-blocks' }, [
        el('div', { cls: 'my-blocks__content' }, [
          el('button', { cls: 'lls-modal__cancel-button', attrs: { 'aria-label': 'Close' }, text: '×',
            on: { click: cancel } }),
          el('div', { cls: 'lls-modal__header' }, [
            el('span', { text: 'Make a block' }),
          ]),
          el('div', { cls: 'my-blocks__content__body' }, [
            previewDiv,
            el('div', { cls: 'my-blocks__content__seperator' }),
            el('div', { cls: 'my-blocks__content__options' }, [
              optionCard('number',  'Add an input', 'number or text', state.addNumber),
              optionCard('boolean', 'Add an input', 'boolean',        state.addBoolean),
              optionCard('label',   'Add a label',  '',               () => state.addLabel()),
            ]),
          ]),
          el('div', { cls: 'lls-modal__footer withSeperator' }, [
            el('div', { cls: 'lls-modal__button', text: 'Cancel', on: { click: cancel } }),
            el('div', { cls: 'lls-modal__button', text: 'Save',   on: { click: save } }),
          ]),
        ]),
      ]);
      doc.body.appendChild(overlay);

      // ── HTML mock preview ────────────────────────────────────────────────
      // We deliberately do NOT inject a child Blockly workspace here. Two
      // reasons: (1) Blockly.inject hijacks getMainWorkspace and doesn't
      // restore it on dispose, breaking subsequent toolbox interactions on
      // the real workspace; (2) the Zelos drawer crashes when fields are
      // added/removed via mutators after initSvg. An HTML mock costs us
      // pixel-perfect block fidelity but is reliable and fast to render.
      function renderPreview() {
        previewDiv.innerHTML = '';
        const card = doc.createElement('div');
        card.className = 'myblocks-preview-card';
        const spec = state.getArgspec();
        spec.forEach((tok, idx) => {
          const chip = doc.createElement('span');
          if (tok.kind === 'label') {
            chip.className = 'myblocks-preview-label';
            chip.contentEditable = 'true';
            chip.textContent = tok.text || '';
            chip.addEventListener('blur', () => state.editTokenText(idx, chip.textContent));
            chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chip.blur(); } });
          } else {
            chip.className = 'myblocks-preview-arg myblocks-preview-arg-' + tok.argKind;
            chip.contentEditable = 'true';
            chip.textContent = tok.name || '';
            chip.addEventListener('blur', () => state.editTokenText(idx, chip.textContent));
            chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chip.blur(); } });
          }
          card.appendChild(chip);
          // Hover ✕ to delete (skip the first label so there's always one)
          if (idx > 0) {
            const del = doc.createElement('button');
            del.className = 'myblocks-preview-del';
            del.textContent = '×';
            del.title = 'Remove';
            del.addEventListener('click', () => state.removeAt(idx));
            card.appendChild(del);
          }
        });
        previewDiv.appendChild(card);
      }
      renderPreview();

      const unsub = state.onChange(renderPreview);

      // ── Esc-to-cancel ────────────────────────────────────────────────────
      function onKeydown(ev) { if (ev.key === 'Escape') cancel(); }
      doc.addEventListener('keydown', onKeydown);

      function teardown() {
        unsub();
        doc.removeEventListener('keydown', onKeydown);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      function save()   { const result = { procId: state.getProcId(), argspec: state.getArgspec() }; teardown(); resolve(result); }
      function cancel() { teardown(); resolve(null); }

      function optionCard(iconKey, header, subheader, onClick) {
        const img = el('img', { attrs: {
          src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ICONS[iconKey]),
          alt: iconKey, width: 50, height: 43,
        }});
        const headerDiv = el('div', { cls: 'my-blocks__content__options__option__header', text: header });
        const kids = [img, headerDiv];
        if (subheader) kids.push(el('div', { cls: 'my-blocks__content__options__option__subheader', text: subheader }));
        return el('div', { cls: 'my-blocks__content__options__option', on: { click: onClick } }, kids);
      }
    });
  }

  MyBlocks.openMyBlocksModal = openMyBlocksModal;

})(typeof window !== 'undefined' ? window : globalThis);
