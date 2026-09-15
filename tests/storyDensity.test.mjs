import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TruthReconstruction, TRUTH_RECORDS } from '../src/story/truthReconstruction.ts';
import { MirrorMemory } from '../src/story/mirrorMemory.ts';
import { ENTRIES, visibleEvidence } from '../src/story/evidenceEntries.ts';
import { STORY_ACTS, phaseForAct } from '../src/story/phases.ts';
import { Rules } from '../src/game/rules.ts';

test('truth records require ordered interaction; each focus is saved only after its conclusion', async () => {
  for (const focus of [0, 1]) {
    const evidence = new Set(), shown = [];
    let release, block = false;
    const dialogue = {
      async say(...lines) {
        shown.push(...lines.map(line => line.text));
        if (block) await new Promise(resolve => { release = resolve; });
      },
      async choose() { block = true; return focus; },
    };
    const truth = new TruthReconstruction(evidence, dialogue, id => evidence.add(id));
    assert.equal(await truth.read(2), false);
    for (let i = 0; i < 3; i++) {
      block = false; release = undefined;
      const work = truth.read(i);
      while (!release) await Promise.resolve();
      assert.equal(truth.busy, true);
      assert.equal(evidence.has(TRUTH_RECORDS[i].id), false);
      assert.equal(await truth.read(i), false, 'duplicate interaction is rejected');
      release(); await work;
      assert.equal(evidence.has(`${TRUTH_RECORDS[i].id}:focus-${focus}`), true);
      assert.equal(shown.includes(TRUTH_RECORDS[i].focus[focus][0].text), true);
      assert.equal(shown.includes(TRUTH_RECORDS[i].focus[1 - focus][0].text), false);
    }
    assert.equal(truth.complete, true);
    assert.equal(await truth.read(0), false);
  }
});

test('an interrupted reconstruction resumes at the first unread record and unlocks the final pedestal only when complete', async () => {
  const evidence = new Set(['truth:school']);
  const dialogue = { say: async () => { throw new Error('interrupted'); }, choose: async () => 1 };
  const truth = new TruthReconstruction(evidence, dialogue, id => evidence.add(id));
  await assert.rejects(truth.read(1), /interrupted/);
  assert.equal(truth.busy, false);
  assert.equal(truth.next, 1);
  const restoredEvidence = new Set(evidence);
  const restored = new TruthReconstruction(restoredEvidence, { say: async () => {}, choose: async () => 1 }, id => restoredEvidence.add(id));
  assert.equal(restored.next, 1);
  await restored.read(1);
  assert.equal(restored.next, 2);
  assert.equal(evidence.has('truth:well'), false, 'restored progress does not mutate the prior session');

  let blocked = 0, presented = 0;
  const ids = ['suzu', 'kushi', 'coins', 'geta', 'kagami', 'fuda', 'sayo'];
  const offerings = ids.map(id => ({ id, name: id, where: '', color: 0, pos: null }));
  const altar = new THREE.Vector3();
  const rules = new Rules(new THREE.Scene(), offerings, altar, {
    canPresentFuda: () => truth.complete,
    onFudaBlocked: () => blocked++,
    onFudaRefused: () => presented++,
  });
  rules.restoreProgress(ids.slice(0, 5), ['fuda'], { started: true });
  assert.equal(rules.interact(altar), true);
  assert.equal(blocked, 1);
  assert.equal(rules.fudaRefused, false);
  dialogue.say = async () => {};
  await truth.read(1); await truth.read(2);
  assert.equal(rules.interact(altar), true);
  assert.equal(presented, 1);
  assert.equal(rules.fudaRefused, true);
  assert.deepEqual(rules.carried, ['fuda'], 'the seal is never offered or consumed');
  rules.interact(altar);
  assert.equal(presented, 1);
});

test('mirror memory coalesces triggers, replays an interrupted save, and does not replay a completed memory', async () => {
  const evidence = new Set();
  let release, starts = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const deps = {
    evidence, begin: () => starts++, remember: id => evidence.add(id),
    dialogue: { say: async () => { await gate; }, choose: async () => 0 },
  };
  const memory = new MirrorMemory(deps);
  const work = memory.play();
  assert.equal(memory.play(), work);
  assert.equal(memory.busy, true);
  assert.equal(evidence.has('memory:bell'), false);
  release(); await work;
  assert.equal(memory.busy, false);
  assert.equal(evidence.has('memory:bell'), true);
  await new MirrorMemory(deps).play();
  assert.equal(starts, 1);
  const interrupted = new MirrorMemory({ ...deps, evidence: new Set(), dialogue: { ...deps.dialogue, say: async () => { throw Error('closed'); } } });
  await assert.rejects(interrupted.play(), /closed/);
  assert.equal(interrupted.busy, false);
});

test('the journal shows only observed records and keeps progression keys out of its count', () => {
  assert.equal(new Set(ENTRIES.map(e => e.id)).size, ENTRIES.length);
  const found = new Set(['village:tea', 'inn:wall-mirror', 'truth:school:focus-1', 'unknown-legacy-key']);
  assert.deepEqual(visibleEvidence(found).map(e => e.id), ['village:tea', 'inn:wall-mirror']);
  found.add('revisit:tea-1');
  assert.equal(visibleEvidence(found).some(e => e.id === 'revisit:tea-1'), true);
  for (const id of [...TRUTH_RECORDS.map(r => r.id), 'memory:bell', 'graveyard:palm', 'manor:roster', 'manor:minutes', 'manor:ihai']) {
    assert.equal(visibleEvidence(new Set([id])).length, 1, id);
  }
});

test('production metadata distinguishes playable chapters from the partial truth chapter and unbuilt acts', () => {
  assert.equal(STORY_ACTS.length, 35);
  assert.equal(phaseForAct(16).implementation, 'partial');
  assert.equal(STORY_ACTS[15].implementation, 'partial');
  assert.equal(STORY_ACTS[16].implementation, 'partial');
  assert.equal(STORY_ACTS[17].implementation, 'playable');
  assert.ok(STORY_ACTS.slice(18).every(act => act.implementation === 'planned'));
});
