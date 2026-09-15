import test from 'node:test';
import assert from 'node:assert/strict';
import { Act18Revelation, CRYPT_TRACES } from '../src/story/act18.ts';
import { visibleEvidence } from '../src/story/evidenceEntries.ts';

function setup(found = new Set()) {
  const events = []; let inside = false, allowed = true;
  const deps = {
    evidence: found, dialogue: { say: async () => events.push('say') },
    quests: { glitchTo: async () => events.push('glitch') }, canEnter: () => allowed, inside: () => inside,
    travel: async down => { inside = down; events.push(down ? 'down' : 'up'); },
    remember: id => { found.add(id); events.push(id); }, checkpoint: () => events.push('save'),
    wait: async () => {}, stage: stage => events.push(stage), prepareOfferings: async () => events.push('prepare'),
    descendOfferings: progress => events.push(progress), finish: () => { assert.ok(found.has('crypt:revealed')); events.push('finish'); },
  };
  return { act: new Act18Revelation(deps), deps, found, events, inside: value => { inside = value; }, allow: value => { allowed = value; } };
}

test('crypt entry is gated and observations accept free order before the encounter', async () => {
  const s = setup(); s.allow(false); await s.act.enter(); assert.equal(s.act.entered, false);
  s.allow(true); await s.act.read(0); assert.equal(s.act.nextTrace, 0);
  await s.act.enter(); assert.equal(s.act.entered, true);
  await s.act.encounter(); assert.equal(s.found.has('crypt:encounter-started'), false);
  for (const i of [2, 0, 1]) await s.act.read(i);
  assert.equal(s.act.nextTrace, -1); await s.act.encounter();
  assert.equal(s.act.complete, true); assert.equal(s.act.moved, true);
  assert.ok(s.events.indexOf('crypt:offerings-moved') < s.events.indexOf('crypt:revealed'));
  assert.equal(visibleEvidence(s.found).length, 4, 'internal scene boundaries do not become discoveries');
  await s.act.leave(); assert.ok(s.events.includes('up'), 'completed chapter still permits exploration');
});

test('interrupted travel and clue reading do not commit unfinished state or retain the input lock', async () => {
  const s = setup(); s.deps.travel = async () => { throw Error('travel'); };
  await assert.rejects(s.act.enter(), /travel/); assert.equal(s.act.entered, false); assert.equal(s.act.busy, false);
  s.inside(true); s.deps.dialogue.say = async () => { throw Error('dialogue'); };
  await assert.rejects(s.act.read(0), /dialogue/); assert.equal(s.act.nextTrace, 0); assert.equal(s.act.busy, false);
});

test('an in-progress encounter coalesces triggers and resumes after the committed offering descent', async () => {
  const s = setup(new Set(CRYPT_TRACES.map(t => t.id))); s.inside(true);
  let release; const gate = new Promise(resolve => { release = resolve; }); let first = true;
  s.deps.dialogue.say = async () => {
    if (first) { first = false; await gate; }
    if (s.found.has('crypt:offerings-moved')) throw Error('reload');
  };
  const p = s.act.encounter(); assert.equal(s.act.busy, true); assert.equal(s.act.encounter(), p);
  release(); await assert.rejects(p, /reload/);
  assert.equal(s.act.complete, false); assert.equal(s.act.moved, true);
  const restored = setup(new Set(s.found)); restored.inside(true); await restored.act.resume();
  assert.equal(restored.act.complete, true);
  assert.deepEqual(restored.events.filter(e => typeof e === 'number'), [1, 1], 'committed objects restore once without replaying their journey');
  restored.events.length = 0; await restored.act.resume();
  assert.ok(!restored.events.includes('say')); assert.equal(restored.events.at(-1), 'finish');
});

test('a pending encounter outside the crypt does not pull the player back into a cutscene', async () => {
  const s = setup(new Set([...CRYPT_TRACES.map(t => t.id), 'crypt:encounter-started']));
  await s.act.resume(); assert.equal(s.act.busy, false); assert.ok(!s.events.includes('say'));
  assert.equal(s.act.complete, false);
});
