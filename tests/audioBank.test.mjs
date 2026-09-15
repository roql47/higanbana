import test from 'node:test';
import assert from 'node:assert/strict';
import { SampleBank } from '../src/audio/bank.ts';
import { mockGlobal } from './browser-globals.mjs';

function fixture(t, keys, budget = 1024) {
  const fetched = [], decoded = [], sources = [], nodes = [];
  let decoding = 0, peak = 0;
  const sounds = Object.fromEntries(keys.map((key, i) => [key, { files: ['file-' + i], gain: 1, loop: false }]));
  mockGlobal(t, 'fetch', async (url) => {
    fetched.push(url);
    return { ok: true, json: async () => ({ sounds }), arrayBuffer: async () => new Uint8Array([Number(url.split('file-')[1])]).buffer };
  });
  const param = () => ({ value: 1, setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = () => { const n = { connect(to) { return to; }, disconnect() { this.disconnected = true; } }; nodes.push(n); return n; };
  const ctx = { state: 'running', currentTime: 0,
    async decodeAudioData(data) {
      decoding++; peak = Math.max(peak, decoding);
      const index = new Uint8Array(data)[0]; decoded.push(index);
      await Promise.resolve(); await Promise.resolve(); decoding--;
      return { length: 4, numberOfChannels: 1, duration: 1, index };
    },
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: param() }),
    createBufferSource() {
      const source = { ...node(), playbackRate: param(), start() {}, stop() {} }; sources.push(source); return source;
    },
  };
  const bank = new SampleBank('/audio/manifest.json', budget);
  return { bank, ctx, sounds, fetched, decoded, sources, nodes, peak: () => peak, attach: () => bank.attach(ctx, node()) };
}

test('audio prefetch selects the current region; leaving waits for an active one-shot to end', async (t) => {
  const f = fixture(t, ['foot/dirt', 'amb/crickets', 'well/wade', 'yuri/hum', 'combat/hit']);
  await f.bank.prefetch();
  assert.deepEqual(f.fetched.filter(u => u.includes('file-')).sort(), ['/audio/file-0', '/audio/file-1']);
  await f.attach();
  assert.equal(f.bank.stats.residentKeys, 2);
  assert.equal(f.bank.stats.compressedBytes, 0);
  await f.bank.setRegions(['village', 'well']);
  assert.equal(f.bank.stats.residentKeys, 3);
  f.bank.play('well/wade', { lp: 800 });
  await f.bank.setRegions(['village']);
  assert.equal(f.bank.stats.residentKeys, 3, 'playing sound must keep its buffer');
  f.sources[0].onended();
  assert.equal(f.sources[0].buffer, null);
  assert.equal(f.sources[0].disconnected, true);
  assert.equal(f.bank.stats.activeKeys, 0);
  assert.equal(f.bank.stats.residentKeys, 2);
});

test('loop buffers survive a region change and are released after the final faded source ends', async (t) => {
  const f = fixture(t, ['well/loop']);
  await f.bank.setRegions(['well']); await f.attach();
  const voice = f.bank.loop('well/loop', { mode: 'native' });
  await f.bank.setRegions([]);
  assert.equal(f.bank.stats.residentKeys, 1);
  voice.stop();
  assert.equal(f.bank.stats.activeKeys, 1);
  f.sources[0].onended();
  assert.equal(f.bank.stats.residentKeys, 0);
  assert.equal(voice.buffer, null, 'a retained stopped Voice must not retain PCM');
});

test('demand loads coalesce, decode concurrency is bounded, and unused keys follow LRU', async (t) => {
  const f = fixture(t, ['extra/a', 'extra/b', 'extra/c', 'extra/d'], 32);
  await f.attach();
  await Promise.all([f.bank.ensure('extra/a'), f.bank.ensure('extra/a'), f.bank.ensure('extra/b')]);
  assert.equal(f.decoded.length, 2);
  assert.ok(f.peak() <= 2);
  f.bank.buffer('extra/a');
  await f.bank.ensure('extra/c');
  assert.equal(f.bank.stats.decodedBytes, 32);
  await f.bank.ensure('extra/a');
  assert.equal(f.decoded.length, 3, 'recently used a stays cached');
  await f.bank.ensure('extra/b');
  assert.equal(f.decoded.length, 4, 'least recently used b was evicted');
});

test('retired region decode cannot repopulate the cache when it completes late', async (t) => {
  const f = fixture(t, ['well/wade']);
  await f.attach();
  let release;
  f.ctx.decodeAudioData = () => new Promise(resolve => { release = () => resolve({ length: 4, numberOfChannels: 1, duration: 1 }); });
  const pending = f.bank.setRegions(['well']);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await f.bank.setRegions([]);
  release(); await pending;
  assert.equal(f.bank.stats.residentKeys, 0);
  assert.equal(f.bank.stats.compressedBytes, 0);
});

test('a requested sample remains playable when protected ambience exceeds the soft cache budget', async (t) => {
  const f = fixture(t, ['amb/crickets', 'extra/a'], 8);
  await f.attach();
  await f.bank.ensure('extra/a');
  assert.ok(f.bank.play('extra/a'), 'demand loading must not evict its own result');
  f.sources[0].onended();
  assert.equal(f.bank.stats.residentKeys, 1);
});

test('streaming preloads just one chunk, transfers PCM ownership, and releases after stop', async t => {
  mockGlobal(t, 'setTimeout', () => 1); mockGlobal(t, 'clearTimeout', () => {});
  const f = fixture(t, ['amb/frogs']);
  f.sounds['amb/frogs'].stream = { sampleRate: 4, channels: 1,
    chunks: [{ file: 'file-10', frames: 4 }, { file: 'file-11', frames: 4 }] };
  await f.attach();
  assert.deepEqual(f.decoded, [10]);
  const voice = f.bank.loop('amb/frogs');
  assert.equal(f.bank.stats.residentKeys, 0, 'bank must not retain the first chunk for the full session');
  assert.equal(f.bank.stats.streamingVoices, 1);
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.deepEqual(f.decoded, [10, 11]);
  assert.equal(f.bank.has('amb/frogs'), true);
  await f.bank.setRegions([]); voice.stop(0); f.sources[0].onended();
  assert.equal(f.bank.stats.streamingVoices, 0);
  assert.equal(f.bank.stats.decodedBytes, 0);
  assert.equal(f.bank.stats.compressedBytes, 0);
});

test('unsupported chunk decoder falls back to the complete original recording', async t => {
  const f = fixture(t, ['amb/frogs']);
  f.sounds['amb/frogs'].stream = { sampleRate: 4, channels: 1, chunks: [{ file: 'file-10', frames: 8 }] };
  await f.attach();
  assert.deepEqual(f.decoded, [10, 0], 'wrong decoded duration must trigger original MP3 fallback');
  assert.equal(f.bank.buffer('amb/frogs').index, 0);
});
