import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AsyncPool } from '../src/core/asyncPool.ts';
import { Inspect } from '../src/game/inspect.ts';
import { PathQueue } from '../src/ai/pathQueue.ts';
import { Senses } from '../src/ai/senses.ts';

test('FIFO work pool limits active tasks and continues after a failed task', async () => {
  const pool = new AsyncPool(2), release = [], started = [];
  const jobs = [0, 1, 2].map(i => pool.run(async () => { started.push(i); await new Promise(r => release[i] = r); if (i === 0) throw new Error('expected'); return i; }));
  const result = Promise.allSettled(jobs);
  await Promise.resolve(); assert.deepEqual(started, [0, 1]);
  release[0]();
  while (!release[2]) await new Promise(r => setImmediate(r));
  release[1](); release[2]();
  assert.deepEqual((await result).map(r => r.status), ['rejected', 'fulfilled', 'fulfilled']);
});

test('spatial investigation search matches a linear reference including negative cells and ties', () => {
  const inspect = new Inspect(() => {}), points = [];
  let seed = 713, evaluations = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let i = 0; i < 1000; i++) {
    const p = { id: String(i), pos: new THREE.Vector3(random() * 200 - 100, random() * 8, random() * 200 - 100),
      radius: 1 + random() * 12, prompt: String(i), once: false, onUse() {}, enabled: () => { evaluations++; return i % 3 !== 0; } };
    points.push(p); inspect.add(p);
  }
  for (let i = 0; i < 200; i++) {
    const pos = new THREE.Vector3(random() * 200 - 100, random() * 8, random() * 200 - 100);
    const expected = points.filter((p, j) => j % 3 !== 0 && p.pos.distanceTo(pos) < p.radius)
      .sort((a, b) => a.pos.distanceToSquared(pos) - b.pos.distanceToSquared(pos))[0];
    inspect.update(pos);
    assert.equal(inspect.targetPosition, expected?.pos ?? null);
  }
  assert.ok(evaluations < 2000, 'distant points must not run their enabled predicates');
  const tie = new Inspect(() => {});
  const a = { id: 'a', pos: new THREE.Vector3(), radius: 2, prompt: 'a', once: false, onUse() {} };
  const b = { ...a, id: 'b', pos: new THREE.Vector3() };
  tie.add(a); tie.add(b); tie.add(a); tie.update(new THREE.Vector3());
  assert.equal(tie.targetPosition, a.pos, 'replacing a point preserves tie order');
});

test('spatial point replacement, hold completion, and removal clear old cells and prompts', () => {
  const inspect = new Inspect(() => {}); let uses = 0; const progress = [];
  const p = { id: 'p', pos: new THREE.Vector3(-8, 0, 0), radius: 2, prompt: 'test', once: true, hold: 1, onUse: () => { uses++; }, onHold: value => progress.push(value) };
  inspect.add(p); inspect.update(p.pos, 0.5, true); assert.equal(inspect.holdProgress, 0.5);
  inspect.update(p.pos, 0.5, true); assert.equal(uses, 1); assert.equal(inspect.targetPosition, null);
  assert.equal(progress.at(-1), 1, 'completed wiping must stay complete');
  inspect.add({ ...p, hold: 0, pos: new THREE.Vector3(100, 0, 0) });
  inspect.update(p.pos); assert.equal(inspect.targetPosition, null);
  inspect.remove('p'); inspect.update(new THREE.Vector3(100, 0, 0)); assert.equal(inspect.interact(), false);
});

test('path work executes one owner per frame, coalesces updates and cancels stale requests', () => {
  const q = new PathQueue(), a = {}, b = {}, calls = [];
  q.request(a, () => calls.push('old')); q.request(b, () => calls.push('b')); q.request(a, () => calls.push('new'));
  q.update(); assert.deepEqual(calls, ['new']);
  q.cancel(b); q.update(); assert.deepEqual(calls, ['new']);
});

test('dot-product sight cone agrees with the original angle test over a full circle', () => {
  let casts = 0;
  const physics = { R: { Ray: class { constructor(origin, dir) { this.origin = origin; this.dir = dir; } } }, world: { castRay() { casts++; return null; } } };
  const senses = new Senses(physics), eye = new THREE.Vector3(0, 1.2, 0);
  const range = senses.detectionRange(false);
  const radius = Math.min(3, range * 0.8);
  for (let i = 0; i < 360; i++) {
    const a = (i + 0.25) * Math.PI / 180;
    const pos = new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    const expected = Math.abs(Math.atan2(pos.x, pos.z)) <= Math.PI / 4 || radius <= 2;
    assert.equal(senses.canSee(eye, new THREE.Vector3(0, 0, 1), pos, false), expected);
  }
  const before = casts;
  assert.equal(senses.canSee(eye, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, range + 1), false), false);
  assert.equal(casts, before, 'outside detection range must not raycast');
});
