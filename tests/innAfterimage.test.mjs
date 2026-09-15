import test from 'node:test';
import assert from 'node:assert/strict';
import { INN_AFTERIMAGE_CASE as def, innAfterimageActive } from '../src/story/innAfterimage.ts';
import { InvestigationCase } from '../src/story/investigationCase.ts';
import { MirrorMemory } from '../src/story/mirrorMemory.ts';
import { visibleEvidence } from '../src/story/evidenceEntries.ts';

test('the second inn investigation starts after passage and never relocks a legacy mirror or offering', () => {
  assert.equal(innAfterimageActive(true, new Set()), false);
  assert.equal(innAfterimageActive(true, new Set(['inn:passage'])), true);
  for (const id of ['inn:mirror', `${def.id}:complete`]) {
    assert.equal(innAfterimageActive(true, new Set(['inn:passage', id])), false);
  }
  assert.equal(innAfterimageActive(false, new Set(['inn:passage'])), false);
});

test('all four waiting clues are needed; wrong choices preserve them and the screen decision', async () => {
  const found = new Set(['inn:passage']); let choice = 0, asked = 0;
  const story = new InvestigationCase(def, found, {
    say: async () => {}, choose: async () => { asked++; return choice; },
  }, id => found.add(id));
  for (const i of [0, 3, 2]) await story.read(i);
  assert.equal(await story.resolve(0), false); assert.equal(asked, 0);
  await story.read(1);
  for (let i = 0; i < def.steps.length; i++) {
    choice = (def.steps[i].answer + 1) % def.steps[i].options.length;
    assert.equal(await story.resolve(i), false);
    assert.equal(story.clueCount, 4); assert.equal(story.nextStep, i);
    choice = def.steps[i].answer; assert.equal(await story.resolve(i), true);
  }
  assert.equal(story.complete, true);
  assert.equal(innAfterimageActive(true, found), false);
  assert.equal(visibleEvidence(found).filter(e => e.id.startsWith(def.id)).length, 5);
});

test('interrupting the keepsake ending restores the last step without replaying the screen or clues', async () => {
  const found = new Set(['inn:passage', ...def.clues.map((_, i) => `${def.id}:clue-${i}`), `${def.id}:step-0`]);
  const story = new InvestigationCase(def, found, {
    say: async (...lines) => { if (lines.includes(def.ending[0])) throw Error('suspend'); },
    choose: async () => def.steps[1].answer,
  }, id => found.add(id));
  await assert.rejects(story.resolve(1), /suspend/);
  const restored = new Set(JSON.parse(JSON.stringify([...found])));
  const resumed = new InvestigationCase(def, restored, { say: async () => {}, choose: async () => 0 }, id => restored.add(id));
  assert.equal(resumed.nextStep, 1); assert.equal(resumed.clueCount, 4);
  assert.equal(innAfterimageActive(true, restored), true);
  assert.equal(await resumed.resolve(0), false);
  await resumed.resolve(1); assert.equal(resumed.complete, true);
});

test('ACT 14 recalls the inn hospitality only when discovered and retains the same memory outcome', async () => {
  const runs = [];
  for (const extra of [[], [`${def.id}:complete`]]) {
    const found = new Set(extra), shown = [];
    const scene = new MirrorMemory({ evidence: found, begin: () => {}, remember: id => found.add(id),
      dialogue: { say: async (...lines) => shown.push(...lines), choose: async () => 1 } });
    await scene.play(); assert.equal(found.has('memory:bell'), true);
    assert.equal(found.has('memory:bell-focus-1'), true);
    runs.push(shown);
  }
  assert.equal(runs[1].length - runs[0].length, 2);
});
