import test from 'node:test';
import assert from 'node:assert/strict';
import { LoopVoice } from '../src/audio/bank.ts';
import { mockGlobal } from './browser-globals.mjs';

function setup(t, mode, rate = 1) {
  const timers = [], sources = [], gains = [];
  mockGlobal(t, 'setTimeout', (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; });
  mockGlobal(t, 'clearTimeout', (timer) => { timer.cancelled = true; });
  t.mock.method(Math, 'random', () => 0.5);
  const node = () => ({ connect(to) { return to; }, disconnect() { this.disconnected = true; } });
  const param = () => ({ value: 1, curves: [],
    setValueAtTime(v) { this.value = v; }, cancelScheduledValues() {}, exponentialRampToValueAtTime() {},
    setValueCurveAtTime(curve, start, duration) { this.curves.push({ start, duration }); },
  });
  const ctx = { currentTime: 0,
    createGain() { const g = { ...node(), gain: param() }; gains.push(g); return g; },
    createBufferSource() {
      const s = { ...node(), playbackRate: param(), start(...args) { this.started = args; }, stop(t) { this.stoppedAt = t; } };
      sources.push(s); return s;
    },
  };
  const voice = new LoopVoice(ctx, { duration: 8 }, node(), mode, rate, 1, [8, 8]);
  return { voice, ctx, timers, sources, gains };
}

test('late crossfade timer reschedules the entire envelope from current audio time', (t) => {
  const { voice, ctx, timers, sources, gains } = setup(t, 'xfade');
  voice.start();
  ctx.currentTime = 100;
  timers[0].fn();
  assert.equal(sources[1].started[0], 100);
  assert.equal(sources[1].stoppedAt, 108.05);
  assert.equal(gains.at(-1).gain.curves.at(-1).start, 106);
  assert.equal(timers.at(-1).delay, 4500);
});

test('scatter fade and next grain timing use actual playback duration', (t) => {
  const { voice, timers, sources, gains } = setup(t, 'scatter', 2);
  voice.start();
  assert.deepEqual(sources[0].started, [0, 0, 8]);
  assert.equal(gains.at(-1).gain.curves.at(-1).start, 2.5); // 8 buffer seconds / 2x - 1.5s overlap
  assert.equal(timers[0].delay, 1000);
});

test('ended loop sources release their graph and stop cancels future scheduling', (t) => {
  const { voice, sources, gains, timers } = setup(t, 'xfade');
  voice.start();
  voice.stop();
  assert.equal(timers[0].cancelled, true);
  sources[0].onended();
  assert.equal(sources[0].disconnected, true);
  assert.ok(gains.every((g) => g.disconnected));
  timers[0].fn();
  assert.equal(sources.length, 1);
});
