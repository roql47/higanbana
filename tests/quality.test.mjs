import test from 'node:test';
import assert from 'node:assert/strict';
import { detectQuality, saveQuality, effectivePixelRatio, profileFor } from '../src/core/quality.ts';
import { mockGlobal } from './browser-globals.mjs';

test('blocked browser storage does not prevent startup or live quality changes', (t) => {
  mockGlobal(t, 'location', { search: '' });
  mockGlobal(t, 'localStorage', {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  });
  assert.equal(detectQuality().level, 'high');
  assert.doesNotThrow(() => saveQuality('low'));
});

test('quality validates own profile names and preserves URL > save > default precedence', (t) => {
  const location = { search: '?quality=ultra' };
  let saved = 'low';
  mockGlobal(t, 'location', location);
  mockGlobal(t, 'localStorage', { getItem: () => saved });
  assert.equal(detectQuality().level, 'ultra');
  location.search = '?quality=constructor';
  assert.equal(detectQuality().level, 'low');
  saved = 'toString';
  assert.equal(detectQuality().level, 'high');
});

test('resolution respects pixel budget, manual scale and finite hidden viewport size', () => {
  const q = profileFor('high');
  const pr = effectivePixelRatio(q, 1440, 900, 2);
  assert.ok(pr * pr * 1440 * 900 <= q.pixelBudget * 1e6 + 1);
  assert.equal(effectivePixelRatio(q, 1440, 900, 2, 0.5), pr * 0.5);
  assert.ok(Number.isFinite(effectivePixelRatio(q, 0, 0, 2)));
});

test('fullscreen 1440p, 4K and ultrawide stay within every quality pixel budget', () => {
  for (const level of ['low', 'medium', 'high', 'ultra']) {
    const q = profileFor(level);
    for (const [w, h] of [[2560, 1440], [3840, 2160], [5120, 1440], [7680, 2160]]) {
      for (const dpr of [1, 1.5, 2]) {
        const ratio = effectivePixelRatio(q, w, h, dpr);
        assert.ok(ratio > 0 && ratio <= Math.min(dpr, q.pixelRatio));
        assert.ok(w * h * ratio ** 2 <= q.pixelBudget * 1e6 + 1, `${level} ${w}×${h} @${dpr}`);
        assert.equal(effectivePixelRatio(q, w, h, dpr, 0.5), ratio * 0.5);
      }
    }
  }
});
