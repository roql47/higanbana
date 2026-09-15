import test from 'node:test';
import assert from 'node:assert/strict';
import { StorySave, defaultFlags } from '../src/story/flags.ts';
import { mockGlobal } from './browser-globals.mjs';

function storage(t, initial) {
  const data = new Map(initial ? [['higanbana.save.0', initial]] : []);
  mockGlobal(t, 'localStorage', {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  });
  return data;
}

test('legacy chapter-only save gains complete default flags without losing its chapter', (t) => {
  storage(t, JSON.stringify({ v: 1, flags: { chapter: 'act10', phone: true } }));
  const p = new StorySave().peek();
  assert.equal(p.flags.act, 10);
  assert.equal(p.flags.chapter, 'act10');
  assert.equal(p.flags.phase, 'false_ritual');
  assert.equal(p.flags.phoneBattery, 86);
  assert.deepEqual(p.flags.regrets, {});
  assert.deepEqual(p.flags.roster, []);
  assert.deepEqual(p.flags.evidence, []);
});

test('malformed nested save fields cannot enter runtime state', (t) => {
  storage(t, JSON.stringify({ v: 1, flags: {
    act: 10, offered: -3, deaths: 'many', regrets: null, roster: [null, 'name', 'name'],
    evidence: [false, {}, 'clue'], chochin: 'false', phoneBattery: 1000,
  }, world: {
    offered: ['suzu', null, 'suzu'], carried: 'kushi', rulesStarted: 'false',
    suzuWardOrder: [0, '1', 0, -1, 2], player: { x: 0, y: 1e10, z: 0 },
  } }));
  const p = new StorySave().peek();
  assert.equal(p.flags.offered, 0);
  assert.equal(p.flags.deaths, 0);
  assert.equal(p.flags.chochin, false);
  assert.equal(p.flags.phoneBattery, 100);
  assert.deepEqual(p.flags.evidence, ['clue']);
  assert.deepEqual(p.flags.roster, ['name']);
  assert.deepEqual(p.world.offered, ['suzu']);
  assert.deepEqual(p.world.carried, []);
  assert.deepEqual(p.world.suzuWardOrder, [0, 2]);
  assert.equal(p.world.rulesStarted, undefined);
  assert.equal(p.world.player, undefined);
});

test('checkpoint remains a snapshot after live flags and world mutate', (t) => {
  storage(t, null);
  const save = new StorySave(), flags = defaultFlags();
  flags.evidence.push('clue');
  const world = { carried: ['suzu'], player: { x: 1, y: 2, z: 3 } };
  assert.equal(save.checkpoint(flags, world), true);
  flags.evidence.push('later');
  world.carried.length = 0;
  world.player.x = 99;
  const p = save.peek();
  assert.deepEqual(p.flags.evidence, ['clue']);
  assert.deepEqual(p.world.carried, ['suzu']);
  assert.equal(p.world.player.x, 1);
});

test('unsupported and invalid save envelopes return null', (t) => {
  for (const raw of ['{', 'null', '{"v":2,"flags":{}}', '{"v":1,"flags":[]}']) {
    storage(t, raw);
    assert.equal(new StorySave().peek(), null);
  }
});

test('serialization errors return false without throwing or replacing the previous save', (t) => {
  storage(t, null);
  const save = new StorySave();
  assert.equal(save.checkpoint(defaultFlags()), true);
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(save.checkpoint(defaultFlags(), cyclic), false);
  assert.equal(save.peek().flags.act, 2);
});

test('corrupt latest checkpoint recovers the previous snapshot without overwriting its backup', (t) => {
  const data = storage(t, null), save = new StorySave();
  save.checkpoint(defaultFlags(), { carried: ['suzu'], act17: 'pending' });
  save.checkpoint(defaultFlags(), { carried: ['kushi'], act17: 'complete' });
  const backup = data.get('higanbana.save.0.backup');
  data.set('higanbana.save.0', '{broken');
  assert.deepEqual(save.peek().world.carried, ['suzu']);
  assert.equal(save.peek().world.act17, 'pending');
  assert.equal(save.lastReadSource, 'backup');
  assert.equal(save.lastSavedAt, JSON.parse(backup).t);
  assert.equal(save.checkpoint(defaultFlags(), { carried: ['coins'] }), true);
  assert.equal(data.get('higanbana.save.0.backup'), backup);
  assert.deepEqual(save.peek().world.carried, ['coins']);
  assert.equal(save.lastReadSource, 'primary');
});

test('storage failures preserve the last primary save and return a failure signal', (t) => {
  const data = storage(t, null), save = new StorySave();
  save.checkpoint(defaultFlags(), { carried: ['suzu'] });
  const before = data.get('higanbana.save.0');
  const set = localStorage.setItem;
  localStorage.setItem = (key, value) => {
    if (key === 'higanbana.save.0') throw new Error('quota');
    set(key, value);
  };
  assert.equal(save.checkpoint(defaultFlags(), { carried: ['kushi'] }), false);
  assert.equal(data.get('higanbana.save.0'), before);
  assert.deepEqual(save.peek().world.carried, ['suzu']);
});

test('backup write failure does not replace the previous checkpoint', (t) => {
  const data = storage(t, null), save = new StorySave();
  save.checkpoint(defaultFlags());
  const previous = data.get('higanbana.save.0');
  localStorage.setItem = () => { throw new Error('storage blocked'); };
  assert.equal(save.checkpoint(defaultFlags(), { carried: ['suzu'] }), false);
  assert.equal(data.get('higanbana.save.0'), previous);
});

test('explicit new game clears primary and backup; deletion failure is reported', (t) => {
  const data = storage(t, null), save = new StorySave();
  save.checkpoint(defaultFlags());
  save.checkpoint(defaultFlags(), { carried: ['suzu'] });
  const remove = localStorage.removeItem;
  localStorage.removeItem = () => { throw new Error('blocked'); };
  assert.equal(save.clear(), false);
  assert.ok(save.peek());
  localStorage.removeItem = remove;
  assert.equal(save.clear(), true);
  assert.equal(save.peek(), null);
  assert.equal(data.size, 0);
});
