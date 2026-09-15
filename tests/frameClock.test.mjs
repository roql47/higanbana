import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameClock } from '../src/core/frameClock.ts';

for (const hz of [60, 120, 144, 165]) {
  test(`60 fps limit preserves its cadence on a ${hz} Hz display`, () => {
    const clock = new FrameClock(0);
    const deltas = [];
    for (let i = 1; i <= hz * 10; i++) {
      const dt = clock.sample(i * 1000 / hz, 60);
      if (dt !== null) deltas.push(dt);
    }
    assert.ok(Math.abs(deltas.length - 600) <= 1, `${deltas.length} frames in 10 seconds`);
    assert.ok(Math.abs(deltas.reduce((a, b) => a + b, 0) - 10) < 1 / 60);
  });
}

test('hidden-tab reset discards idle time without a catch-up burst', () => {
  const clock = new FrameClock(0);
  clock.sample(16.667, 60);
  clock.reset(10000);
  assert.equal(clock.sample(10001, 60), null);
  assert.ok(Math.abs(clock.sample(10017, 60) - 0.017) < 1e-8);
  assert.equal(clock.sample(10018, 60), null);
});

test('uncapped frames retain actual elapsed time, including long frames', () => {
  const clock = new FrameClock(0);
  assert.equal(clock.sample(8, 0), 0.008);
  assert.equal(clock.sample(508, 0), 0.5);
});
