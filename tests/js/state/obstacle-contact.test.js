'use strict';

const test   = require('node:test');
const assert = require('node:assert');
const { createSim } = require('../sim-helper');

test('onObstacleContact: subscriber fires when the robot contacts an obstacle', async () => {
  const sim = createSim();
  const seen = [];
  sim.onObstacleContact((id) => seen.push(id));
  // Synthesise a contact by calling the simulator's internal handler the same
  // way Box2D's listener would.
  sim._dispatchObstacleContact('1');
  sim._dispatchObstacleContact('2');
  sim._dispatchObstacleContact('1');  // re-hit, still fires
  assert.deepStrictEqual(seen, ['1', '2', '1']);
});

test('onObstacleContact: multiple subscribers each receive every event', async () => {
  const sim = createSim();
  const a = []; const b = [];
  sim.onObstacleContact(id => a.push(id));
  sim.onObstacleContact(id => b.push(id));
  sim._dispatchObstacleContact('1');
  assert.deepStrictEqual(a, ['1']);
  assert.deepStrictEqual(b, ['1']);
});

test('onObstacleContact: unsubscribe stops further calls', async () => {
  const sim = createSim();
  const seen = [];
  const off = sim.onObstacleContact(id => seen.push(id));
  sim._dispatchObstacleContact('1');
  off();
  sim._dispatchObstacleContact('2');
  assert.deepStrictEqual(seen, ['1']);
});
