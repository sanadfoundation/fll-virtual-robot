// js/myblocks_proccode.js
//
// proccode <-> argspec helpers for SPIKE My Blocks (Scratch procedure system).
//
// Scratch encodes a custom block's call signature as a printf-style template
// string stored on the prototype's mutation: e.g. `"rotate %s %b my function"`.
// Labels and arg slots are interleaved; `%s` = string/number, `%b` = boolean,
// `%%` = literal `%`. The parallel arrays `argumentnames`, `argumentdefaults`,
// `argumentids` carry per-arg metadata in proccode-order.
//
// We expand this packed form into an `argspec[]` of mixed label/arg tokens —
// the canonical shape used by every other part of the My Blocks system (block
// init, mutator serialization, generator, modal preview, .llsp3 round-trip).
'use strict';
(function (global) {
  const MyBlocks = (global.MyBlocks = global.MyBlocks || {});

  // Walk the proccode character by character. We can't naively split on
  // `/%[sb]/` because `%%` is an escape for a literal `%` and would corrupt
  // the label boundaries on patterns like `"100%% off %s"`.
  function parseProccode({ proccode, argumentnames, argumentdefaults, argumentids }) {
    const names    = argumentnames    || [];
    const defaults = argumentdefaults || [];
    const ids      = argumentids      || [];

    const tokens = [];   // alternating labels and args, with empty labels kept
    let buf = '';
    let argIdx = 0;

    const src = String(proccode || '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch !== '%' || i + 1 >= src.length) { buf += ch; continue; }
      const next = src[i + 1];
      if (next === '%') { buf += '%'; i++; continue; }
      if (next !== 's' && next !== 'b') { buf += ch; continue; } // unknown %x → literal
      tokens.push({ kind: 'label', text: buf });
      buf = '';
      const argKind = (next === 's') ? 'string_number' : 'boolean';
      const defaultValue = (defaults[argIdx] !== undefined)
        ? defaults[argIdx]
        : (argKind === 'boolean' ? 'false' : '');
      tokens.push({
        kind: 'arg',
        argKind,
        name:  names[argIdx] !== undefined ? names[argIdx] : '',
        argId: ids[argIdx]   !== undefined ? ids[argIdx]   : '',
        defaultValue,
      });
      argIdx++;
      i++;
    }
    tokens.push({ kind: 'label', text: buf });

    // Drop empty labels — they're noise in our model and we can reconstruct
    // the proccode without them (the emit step just concatenates).
    return tokens.filter(t => t.kind !== 'label' || t.text !== '');
  }

  function emitProccode(argspec) {
    const parts = [];
    const argumentnames    = [];
    const argumentdefaults = [];
    const argumentids      = [];

    for (const token of argspec) {
      if (token.kind === 'label') {
        parts.push(String(token.text).replace(/%/g, '%%'));
      } else {
        parts.push(token.argKind === 'boolean' ? '%b' : '%s');
        argumentnames.push(token.name || '');
        argumentdefaults.push(token.defaultValue !== undefined
          ? token.defaultValue
          : (token.argKind === 'boolean' ? 'false' : ''));
        argumentids.push(token.argId || '');
      }
    }

    // SPIKE's procedure-block renderer splits proccode on whitespace and only
    // recognises an `%s`/`%b` token as an argument slot when it's space-bounded.
    // Without that, a modal-created argspec like
    //   [{label "myblock"}, {arg}, {arg}, {arg}]
    // would emit `"myblock%s%b%s"`, which SPIKE renders as garbled text.
    // Insert a single space at any boundary where neither side already has
    // whitespace. Idempotent for SPIKE-imported argspecs whose labels already
    // carry their boundary spaces (e.g. `[{label "rotate "}, {arg}, {label " "}, …]`).
    let proccode = '';
    for (const piece of parts) {
      if (piece === '') continue;
      if (proccode === '' || /\s$/.test(proccode) || /^\s/.test(piece)) {
        proccode += piece;
      } else {
        proccode += ' ' + piece;
      }
    }

    return {
      proccode,
      argumentnames, argumentdefaults, argumentids,
    };
  }

  MyBlocks.parseProccode = parseProccode;
  MyBlocks.emitProccode  = emitProccode;
})(typeof window !== 'undefined' ? window : globalThis);
