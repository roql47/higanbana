import test from 'node:test';
import assert from 'node:assert/strict';
import { ManorDispatch, DISPATCH_CLUES, DISPATCH_DIALS, DISPATCH_SETTING, readDispatchSetting, dispatchIsAligned, dispatchRequired } from '../src/story/manorDispatch.ts';
import { visibleEvidence } from '../src/story/evidenceEntries.ts';
import { TruthReconstruction } from '../src/story/truthReconstruction.ts';

function setup(found = new Set(), say = async () => {}) {
  const proofs = []; let allowed = true;
  const story = new ManorDispatch({ evidence: found, dialogue: { say }, remember: id => found.add(id),
    canUse: () => allowed && dispatchRequired(true, found),
    saveSetting: code => { for (const id of found) if (id.startsWith(DISPATCH_SETTING)) found.delete(id); found.add(DISPATCH_SETTING + code); },
    proof: (values, matches) => proofs.push({ values: [...values], matches }),
  });
  return { story, found, proofs, disable: () => { allowed = false; } };
}

test('the dispatch box requires three readings, an aligned press, the key and the altar unlock in order', async () => {
  const { story, found, proofs } = setup();
  assert.equal(await story.takeKey(), false); assert.equal(await story.unlock(), false);
  await story.press(); assert.equal(story.printed, false); assert.equal(proofs.length, 0);
  for (const i of [2, 0, 1]) await story.read(i);
  await story.press(); assert.equal(proofs.at(-1).matches, false); assert.equal(story.clueCount, 3);
  for (let i = 0; i < 3; i++) for (let n = 0; n < DISPATCH_DIALS[i].answer; n++) story.rotate(i);
  assert.equal(dispatchIsAligned(story.setting), true);
  assert.equal(story.printed, false, 'alignment alone does not open the drawer');
  await story.press(); assert.equal(story.printed, true); assert.equal(story.complete, false);
  assert.equal(story.rotate(0), false, 'the successful proof and its setting remain paired');
  await story.takeKey(); assert.equal(story.hasKey, true); assert.equal(story.complete, false);
  await story.unlock(); assert.equal(story.complete, true);
  assert.equal(visibleEvidence(found).filter(e => e.id.startsWith('manor:dispatch')).length, 6);
  assert.equal(found.size, 7, 'only one internal setting key plus six discoveries');
});

test('rotating a plate cycles in four steps and a saved partial combination restores after evidence replacement', () => {
  const { story, found } = setup();
  for (let i = 0; i < 4; i++) story.rotate(0);
  assert.deepEqual(story.setting, [0, 0, 0]);
  story.rotate(1); story.rotate(1); story.rotate(2);
  assert.deepEqual(readDispatchSetting(found), [0, 2, 1]);
  const resumed = setup(new Set(JSON.parse(JSON.stringify([...found])))).story;
  assert.deepEqual(resumed.setting, [0, 2, 1]);
  found.clear(); found.add(DISPATCH_SETTING + 57); story.restoreSetting();
  assert.deepEqual(story.setting, [1, 2, 3]);
  assert.equal(dispatchIsAligned([1, 2, 3, 0]), false);
  assert.deepEqual(readDispatchSetting(new Set([DISPATCH_SETTING + '-1', DISPATCH_SETTING + 'NaN', DISPATCH_SETTING + '64', DISPATCH_SETTING + '02'])), [0, 0, 0]);
});

test('a pending reading or press owns input and interrupted proofs can be retried without lost clues', async () => {
  let release;
  const first = setup(new Set(), () => new Promise(resolve => { release = resolve; }));
  const read = first.story.read(0);
  assert.equal(first.story.rotate(1), false); assert.equal(await first.story.press(), false);
  release(); await read;
  const found = new Set([...DISPATCH_CLUES.map(c => c.id), DISPATCH_SETTING + 57]);
  const failed = setup(found, async () => { throw Error('interrupted'); });
  await assert.rejects(failed.story.press(), /interrupted/);
  assert.equal(failed.story.busy, false); assert.equal(failed.story.printed, false);
  assert.deepEqual(failed.story.setting, [1, 2, 3]);
  const resumed = setup(new Set(found)); await resumed.story.press(); await resumed.story.takeKey();
  assert.equal(resumed.story.hasKey, true);
});

test('legacy carried/offered fuda and unavailable areas do not acquire a new gate', async () => {
  assert.equal(dispatchRequired(false, new Set()), false);
  assert.equal(dispatchRequired(true, new Set(['manor:dispatch-unlocked'])), false);
  assert.equal(dispatchRequired(true, new Set(['manor:dispatch-legacy'])), false, 'legacy fuda remains collectible after a death drop');
  assert.equal(visibleEvidence(new Set(['manor:dispatch-legacy'])).length, 0, 'compatibility never pretends the puzzle was solved');
  const t = setup(); t.disable();
  assert.equal(t.story.rotate(0), false); assert.equal(await t.story.read(0), false); assert.equal(await t.story.press(), false);
});

test('ACT 16 uses dispatch discoveries without requiring them for legacy memory completion', async () => {
  const runs = [];
  for (const extra of [[], ['manor:dispatch-unlocked']]) {
    const found = new Set(['truth:school', ...extra]), lines = [];
    const truth = new TruthReconstruction(found, { say: async (...part) => lines.push(...part), choose: async () => 0 }, id => found.add(id));
    await truth.read(1); await truth.read(2); assert.equal(truth.complete, true); runs.push(lines);
  }
  assert.equal(runs[1].length - runs[0].length, 3);
});
