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
    roundRect: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    lineCap: '', lineJoin: '', font: '',
    textAlign: '', textBaseline: '',
    shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
  };
}

function makeCanvas() {
  const ctx = makeCtx2D();
  return {
    getContext: () => ctx,
    width: 2362, height: 1143,
    style: { marginLeft: '', marginTop: '' },
    parentElement: { clientWidth: 2364, clientHeight: 1145 },
  };
}

module.exports = { makeCanvas, makeCtx2D };
