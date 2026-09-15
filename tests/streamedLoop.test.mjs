import test from 'node:test';
import assert from 'node:assert/strict';
import { StreamedLoopVoice } from '../src/audio/streamedLoop.ts';
import { mockGlobal } from './browser-globals.mjs';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(t, load) {
  const timers = [], sources = [], reads = [];
  mockGlobal(t, 'setTimeout', (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; });
  mockGlobal(t, 'clearTimeout', timer => { timer.cancelled = true; });
  const node = () => ({ connect(to) { return to; }, disconnect() { this.disconnected = true; } });
  const param = () => ({ value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  const buffer = i => ({ duration: i === 2 ? 2 : 6, length: (i === 2 ? 2 : 6) * 48000, numberOfChannels: 2, index: i });
  const ctx = { currentTime: 0, createGain: () => ({ ...node(), gain: param() }),
    createBufferSource() { const source = { ...node(), playbackRate: param(), start(time) { this.time = time; this.index = this.buffer.index; }, stop(time) { this.stoppedAt = time; } }; sources.push(source); return source; } };
  let released = 0;
  const voice = new StreamedLoopVoice(ctx, buffer(0), node(), { chunks: [{}, {}, {}] },
    async i => { reads.push(i); return load ? load(i, buffer) : buffer(i); }, 1, 0.4, () => released++);
  return { voice, ctx, timers, sources, reads, released: () => released };
}
test('chunks preserve sample-clock order across the shorter final chunk and wrap', async t => {
  const f = setup(t); f.voice.start(); await flush();
  for (const time of [5, 11, 13, 19, 25]) {
    f.ctx.currentTime = time; f.timers.at(-1).fn(); await flush();
    for (const source of f.sources) if (source.buffer && source.time + source.buffer.duration <= time) source.onended();
    assert.ok(f.voice.decodedBytes <= 18 * 48000 * 2 * 4, 'at most three six-second chunks while scheduling ahead');
  }
  assert.deepEqual(f.sources.map(s => [s.index, s.time]), [[0, 0], [1, 6], [2, 12], [0, 14], [1, 20], [2, 26]]);
});
test('suspending the audio clock does not accumulate sources or chunk reads', async t => {
  const f = setup(t); f.voice.start(); await flush();
  for (let i = 0; i < 50; i++) f.timers.at(-1).fn();
  assert.equal(f.sources.length, 1); assert.deepEqual(f.reads, [1]);
});
test('delayed reads repeat the current chunk, then recover without skipping order', async t => {
  let resolve;
  const f = setup(t, (i, buffer) => new Promise(done => { resolve = () => done(buffer(i)); }));
  f.voice.start(); f.ctx.currentTime = 5; f.timers.at(-1).fn();
  assert.deepEqual(f.sources.map(s => s.index), [0]);
  assert.equal(f.sources[0].loop, true); assert.equal(f.sources[0].stoppedAt, undefined);
  resolve(); await flush(); f.ctx.currentTime = 11; f.timers.at(-1).fn();
  assert.deepEqual(f.sources.map(s => s.index), [0, 1]);
});
test('a long main-thread stall leaves a looping tail and crossfades when scheduling resumes', async t => {
  const f = setup(t); f.voice.start(); await flush();
  assert.equal(f.sources[0].loop, true); assert.equal(f.sources[0].stoppedAt, undefined);
  f.ctx.currentTime = 50; f.timers.at(-1).fn();
  assert.equal(f.sources[1].time, 50.01);
  assert.ok(Math.abs(f.sources[0].stoppedAt - 50.06) < 1e-6);
});
test('stop cancels future scheduling and late reads cannot retain PCM', async t => {
  let resolve;
  const f = setup(t, (i, buffer) => new Promise(done => { resolve = () => done(buffer(i)); }));
  f.voice.start(); f.voice.stop(0); resolve(); await flush();
  f.sources[0].onended(); f.timers[0].fn();
  assert.equal(f.voice.decodedBytes, 0); assert.equal(f.released(), 1);
  assert.equal(f.sources.length, 1); assert.equal(f.sources[0].buffer, null);
});
