'use strict';

function makeCtx2D() {
  const noop = () => {};
  return {
    clearRect: noop, fillRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    fill: noop, stroke: noop,
    save: noop, restore: noop,
    translate: noop, rotate: noop,
    setLineDash: noop, fillText: noop,
    measureText: () => ({ width: 0 }),
    roundRect: noop, drawImage: noop,
    lineDashOffset: 0,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    lineCap: '', lineJoin: '', font: '',
    textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
  };
}

function makeCanvas() {
  const ctx = makeCtx2D();
  const listeners = {};
  return {
    getContext: () => ctx,
    width: 2362, height: 1143,
    style: { marginLeft: '', marginTop: '', cursor: '' },
    parentElement: {
      clientWidth: 2364, clientHeight: 1145,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 2362, height: 1143 }),
    },
    addEventListener: (event, handler) => {
      (listeners[event] = listeners[event] || []).push(handler);
    },
    dispatchEvent: (event) => {
      const handlers = listeners[event.type] || [];
      for (const h of handlers) h(event);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 2362, height: 1143 }),
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    _listeners: listeners,
  };
}

module.exports = { makeCanvas, makeCtx2D };
