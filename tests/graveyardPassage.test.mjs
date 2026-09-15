import test from 'node:test';
import assert from 'node:assert/strict';
import { GraveyardPassage, HOLLOW_CLUES } from '../src/story/graveyardPassage.ts';
import { visibleEvidence } from '../src/story/evidenceEntries.ts';

function setup(ids = []) {
  const evidence = new Set(ids), log = [], saves = [];
  const state = { inside: false, geta: false, ready: false };
  const deps = {
    evidence, dialogue: { say: async (...lines) => log.push(...lines) },
    remember: id => { evidence.add(id); saves.push({ id, ...state }); },
    inside: () => state.inside, hasGeta: () => state.geta, canEnter: () => state.ready,
    travel: async to => { state.inside = to !== 'outside'; log.push(to); },
    farewell: async () => { log.push('farewell'); evidence.add('graveyard:palm'); },
  };
  return { evidence, state, log, saves, deps, story: new GraveyardPassage(deps) };
}

test('the gaze gate requires the finished surface game and commits arrival after the teleport', async () => {
  const t = setup();
  assert.equal(await t.story.enter(), false);
  t.state.ready = true;
  assert.equal(await t.story.enter(), true);
  assert.equal(t.state.inside, true);
  assert.equal(t.story.crossed, true);
  assert.deepEqual(t.saves[0], { id: 'graveyard:crossed', inside: true, geta: false, ready: true });
  assert.equal(await t.story.enter(), false, 'a second arrival must not loop the player');
  assert.equal(await t.story.readClue(9), false);
  assert.equal(await t.story.inspectGeta(-1), false);
});

test('different statues corroborate the shared gaze without counting one statue repeatedly', async () => {
  const t = setup();
  await t.story.observeJizo(0); await t.story.observeJizo(0);
  assert.equal(t.evidence.has('graveyard:gaze'), false);
  await t.story.observeJizo(4);
  assert.equal(t.evidence.has('graveyard:gaze'), true);
  assert.deepEqual(visibleEvidence(t.evidence).map(e => e.id), ['graveyard:gaze']);
});

test('both physical clues are required; decoys fold the room without erasing discoveries', async () => {
  const t = setup(['graveyard:crossed']); t.state.inside = true;
  await t.story.inspectGeta(1); assert.equal(t.story.matched, false);
  await t.story.readClue(1); await t.story.readClue(0);
  assert.equal(t.story.nextClue, -1);
  const before = [...t.evidence];
  await t.story.inspectGeta(0); await t.story.inspectGeta(2);
  assert.deepEqual([...t.evidence], before);
  assert.equal(t.log.filter(x => x === 'reset').length, 2);
  assert.equal(t.story.matched, false);
  await t.story.inspectGeta(1); assert.equal(t.story.matched, true);
  assert.equal(await t.story.inspectGeta(1), false);
  assert.equal(t.state.geta, false, 'matching unlocks the real Rules pickup; it does not grant a duplicate item');
});

test('leaving early is allowed, and saved clues survive re-entry and matching', async () => {
  const t = setup(['graveyard:crossed']); t.state.inside = true; t.state.ready = true;
  await t.story.readClue(0); await t.story.leave();
  assert.equal(t.state.inside, false);
  assert.equal(t.log.includes('farewell'), false);
  assert.equal(t.evidence.has('graveyard:returned'), false);
  const restored = setup(JSON.parse(JSON.stringify([...t.evidence])));
  restored.state.ready = true; await restored.story.enter();
  assert.equal(restored.story.nextClue, 1);
  await restored.story.readClue(1); await restored.story.inspectGeta(1);
  restored.state.geta = true;
  await restored.story.falseExit();
  assert.equal(restored.state.geta, true);
  assert.equal(restored.state.inside, true);
  await restored.story.leave();
  assert.equal(restored.state.inside, false);
  assert.equal(restored.state.geta, true);
  assert.equal(restored.log.filter(x => x === 'farewell').length, 1);
  assert.equal(restored.evidence.has('graveyard:returned'), true);
  assert.equal(await restored.story.resumeFarewell(), false);
});

test('an interrupted return resumes the palm scene outside instead of losing it or replaying the puzzle', async () => {
  const t = setup(['graveyard:crossed', 'graveyard:hollow-matched', ...HOLLOW_CLUES.map(c => c.id)]);
  t.state.inside = true; t.state.geta = true;
  t.deps.farewell = async () => { throw Error('interrupted before palm'); };
  await assert.rejects(t.story.leave(), /interrupted/);
  assert.equal(t.story.busy, false);
  assert.equal(t.state.inside, false);
  assert.equal(t.story.needsFarewell, true);
  assert.equal(t.evidence.has('graveyard:returned'), false);
  const restored = setup([...t.evidence]); restored.state.geta = true;
  await restored.story.resumeFarewell();
  assert.equal(restored.story.matched, true);
  assert.equal(restored.evidence.has('graveyard:palm'), true);
  assert.equal(restored.evidence.has('graveyard:returned'), true);
});

test('travel owns interaction until arrival and existing palm saves retain pickup eligibility', async () => {
  const t = setup(); t.state.ready = true;
  let release;
  t.deps.travel = () => new Promise(resolve => { release = () => { t.state.inside = true; resolve(); }; });
  const pending = t.story.enter();
  assert.equal(t.story.busy, true);
  assert.equal(await t.story.enter(), false);
  assert.equal(t.evidence.has('graveyard:crossed'), false);
  release(); await pending;
  assert.equal(t.story.busy, false);
  const legacy = setup(['graveyard:palm']);
  assert.equal(legacy.story.matched, true);
  assert.equal(legacy.story.needsFarewell, false);
});

test('a save during the first arrival fade can still complete the farewell after finding the geta', async () => {
  const restored = setup(); restored.state.inside = true;
  assert.equal(restored.story.crossed, false, 'position was saved before the arrival record');
  await restored.story.readClue(0); await restored.story.readClue(1);
  await restored.story.inspectGeta(1); restored.state.geta = true;
  await restored.story.leave();
  assert.equal(restored.evidence.has('graveyard:palm'), true);
  assert.equal(restored.evidence.has('graveyard:returned'), true);
});
