// js/llsp3_python.js
'use strict';
(function (global) {
  const LLSP3 = (global.LLSP3 = global.LLSP3 || {});

  function writeProjectBody(source) {
    return JSON.stringify({ main: String(source) });
  }

  function readProjectBody(text) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      throw new Error(`projectbody.json is not valid JSON: ${e.message}`);
    }
    if (!obj || typeof obj.main !== 'string') {
      throw new Error('projectbody.json missing required key "main"');
    }
    return obj.main;
  }

  LLSP3.python = { writeProjectBody, readProjectBody };
})(typeof window !== 'undefined' ? window : globalThis);
