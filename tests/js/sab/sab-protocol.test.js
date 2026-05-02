'use strict';

const { TextEncoder, TextDecoder } = require('util');

function sendCmd(sab, cmd) {
  const flagView = new Int32Array(sab);
  const cmdBuf   = new Uint8Array(sab, 12, 4096);
  const enc      = new TextEncoder();
  const bytes    = enc.encode(JSON.stringify(cmd));
  cmdBuf.set(bytes);
  Atomics.store(flagView, 1, bytes.length);
  Atomics.store(flagView, 0, 1);
  Atomics.notify(flagView, 0, 1);
}

async function waitForResult(sab) {
  const flagView  = new Int32Array(sab);
  const resultBuf = new Uint8Array(sab, 4108, 1024);
  const dec       = new TextDecoder();
  if (Atomics.load(flagView, 0) === 1) {
    await Atomics.waitAsync(flagView, 0, 1).value;
  }
  const len = Atomics.load(flagView, 2);
  return JSON.parse(dec.decode(resultBuf.slice(0, len)));
}

module.exports = [
  {
    name: 'commandLoop: read_sensors returns initial robot state',
    async fn(createSim, assert) {
      const sab = new SharedArrayBuffer(5132);
      const sim = createSim();
      sim.setupSAB(sab);

      sendCmd(sab, { type: 'read_sensors' });
      const result = await waitForResult(sab);

      assert.strictEqual(result.x,       350);
      assert.strictEqual(result.y,       980);
      assert.strictEqual(result.heading, -90);
      assert.strictEqual(result.stopped, false);
    },
  },
  {
    name: 'commandLoop: move command updates robot position',
    async fn(createSim, assert) {
      const sab = new SharedArrayBuffer(5132);
      const sim = createSim();
      sim.setupSAB(sab);

      sendCmd(sab, { type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees' });
      const result = await waitForResult(sab);

      assert.ok(result.y < 980, `y=${result.y} should be < 980 after moving north`);
      assert.strictEqual(result.stopped, false);
    },
  },
  {
    name: 'commandLoop: sequential commands processed in order',
    async fn(createSim, assert) {
      const sab = new SharedArrayBuffer(5132);
      const sim = createSim();
      sim.setupSAB(sab);

      sendCmd(sab, { type: 'read_sensors' });
      const r1 = await waitForResult(sab);
      assert.strictEqual(r1.y, 980);

      sendCmd(sab, { type: 'move', pair_id: 0, steering: 0, speed: 1000, amount: 360, unit: 'degrees' });
      const r2 = await waitForResult(sab);
      assert.ok(r2.y < 980, `y=${r2.y} should decrease after move`);
    },
  },
  {
    name: 'commandLoop: stopped:true when _stopRequested is set',
    async fn(createSim, assert) {
      const sab = new SharedArrayBuffer(5132);
      const sim = createSim();
      sim.setupSAB(sab);
      sim._stopRequested = true;

      sendCmd(sab, { type: 'read_sensors' });
      const result = await waitForResult(sab);

      assert.strictEqual(result.stopped, true);
    },
  },
];
