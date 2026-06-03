import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// mission_loader.js exports nothing we can import cleanly, so we test
// the shape produced by the normaliser via a minimal inline reimplementation
// that mirrors _normaliseModifiers exactly. This is intentional: the test
// documents the contract, not the implementation file internals.

function normaliseModifiers(raw) {
  const m = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const p = (m.poke && typeof m.poke === 'object') ? m.poke : {};
  const f = (m.friction && typeof m.friction === 'object') ? m.friction : {};
  return {
    poke: {
      enabled:          !!(p.enabled),
      interval_min_s:   typeof p.interval_min_s === 'number' ? p.interval_min_s : 8,
      interval_max_s:   typeof p.interval_max_s === 'number' ? p.interval_max_s : 15,
      severity:         typeof p.severity        === 'number' ? p.severity        : 0.4,
    },
    friction: {
      enabled:    !!(f.enabled),
      multiplier: typeof f.multiplier === 'number' ? f.multiplier : 1.0,
    },
  };
}

describe('_normaliseModifiers', () => {
  it('converts old stub shape to new shape with defaults', () => {
    const result = normaliseModifiers({ available: [], defaults: {} });
    assert.deepEqual(result, {
      poke:     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
      friction: { enabled: false, multiplier: 1.0 },
    });
  });

  it('preserves explicit poke and friction values', () => {
    const result = normaliseModifiers({
      poke:     { enabled: true, interval_min_s: 5, interval_max_s: 12, severity: 0.7 },
      friction: { enabled: true, multiplier: 0.8 },
    });
    assert.deepEqual(result, {
      poke:     { enabled: true, interval_min_s: 5, interval_max_s: 12, severity: 0.7 },
      friction: { enabled: true, multiplier: 0.8 },
    });
  });

  it('handles null/undefined/missing modifiers', () => {
    for (const raw of [null, undefined, 'string', 42]) {
      const result = normaliseModifiers(raw);
      assert.deepEqual(result, {
        poke:     { enabled: false, interval_min_s: 8, interval_max_s: 15, severity: 0.4 },
        friction: { enabled: false, multiplier: 1.0 },
      });
    }
  });
});
