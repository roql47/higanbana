import test from 'node:test';
import assert from 'node:assert/strict';
import { InvestigationCase } from '../src/story/investigationCase.ts';
import { ACT_INVESTIGATIONS } from '../src/story/actInvestigations.ts';
import { TruthReconstruction } from '../src/story/truthReconstruction.ts';
import { visibleEvidence } from '../src/story/evidenceEntries.ts';

test('each expanded act accepts free clue order and requires both deductions before completion', async () => {
  for (const def of ACT_INVESTIGATIONS) {
    const evidence = new Set();
    let choice = 0, choices = 0;
    const dialogue = { say: async () => {}, choose: async () => { choices++; return choice; } };
    const story = new InvestigationCase(def, evidence, dialogue, id => evidence.add(id));
    assert.equal(await story.resolve(0), false);
    assert.equal(choices, 0, 'deductions are unavailable before the evidence is gathered');
    for (const i of [2, 0, 1]) assert.equal(await story.read(i), true);
    assert.equal(await story.read(0), false);
    assert.equal(await story.resolve(1), false, 'second destination cannot skip the first deduction');
    for (let i = 0; i < def.steps.length; i++) {
      choice = def.steps[i].answer;
      assert.equal(await story.resolve(i), true);
    }
    assert.equal(story.complete, true);
    assert.equal(story.nextStep, -1);
    assert.equal(await story.resolve(0), false);
    assert.equal(visibleEvidence(evidence).length, 4, 'three clues and the outcome, without internal progress keys');
  }
});

test('wrong deductions explain the contradiction and keep clues and prior correct steps', async () => {
  for (const def of ACT_INVESTIGATIONS) {
    const evidence = new Set(def.clues.map((_, i) => `${def.id}:clue-${i}`));
    const shown = [];
    let choice = 0;
    const story = new InvestigationCase(def, evidence,
      { say: async (...lines) => shown.push(...lines), choose: async () => choice }, id => evidence.add(id));
    for (let i = 0; i < def.steps.length; i++) {
      const step = def.steps[i];
      for (let wrong = 0; wrong < step.options.length; wrong++) {
        if (wrong === step.answer) continue;
        choice = wrong;
        assert.equal(await story.resolve(i), false);
        assert.equal(shown.includes(step.responses[wrong][0]), true);
        assert.equal(story.nextStep, i);
        assert.equal(story.clueCount, 3);
      }
      choice = step.answer; await story.resolve(i);
    }
    assert.equal(story.complete, true);
  }
});

test('interrupting the final scene resumes at the final destination without losing discoveries', async () => {
  const def = ACT_INVESTIGATIONS[0];
  const evidence = new Set([...def.clues.map((_, i) => `${def.id}:clue-${i}`), `${def.id}:step-0`]);
  const story = new InvestigationCase(def, evidence, {
    choose: async () => def.steps[1].answer,
    say: async (...lines) => { if (lines.includes(def.ending[0])) throw Error('closed during ending'); },
  }, id => evidence.add(id));
  await assert.rejects(story.resolve(1), /closed during ending/);
  assert.equal(story.busy, false);
  assert.equal(story.complete, false);
  const restoredEvidence = new Set(JSON.parse(JSON.stringify([...evidence])));
  const restored = new InvestigationCase(def, restoredEvidence, {
    choose: async () => def.steps[1].answer, say: async () => {},
  }, id => restoredEvidence.add(id));
  assert.equal(restored.nextStep, 1);
  assert.equal(await restored.resolve(0), false);
  assert.equal(await restored.resolve(1), true);
  assert.equal(restored.complete, true);
  assert.equal(story.complete, false);
});

test('a clue commits only after reading and concurrent interactions cannot overwrite it', async () => {
  const def = ACT_INVESTIGATIONS[1], evidence = new Set();
  let release;
  const story = new InvestigationCase(def, evidence, {
    say: async () => new Promise(resolve => { release = resolve; }), choose: async () => 0,
  }, id => evidence.add(id));
  const reading = story.read(2);
  assert.equal(story.busy, true);
  assert.equal(story.hasClue(2), false);
  assert.equal(await story.read(1), false);
  assert.equal(await story.resolve(0), false);
  release(); await reading;
  assert.equal(story.hasClue(2), true);
  assert.equal(story.busy, false);
  assert.equal(await story.read(-1), false);
  assert.equal(await story.resolve(100), false);
});

test('the optional manor investigation adds corroboration to ACT 16 without becoming its gate', async () => {
  const runs = [];
  for (const extra of [[], ['case:manor:complete']]) {
    const evidence = new Set(['truth:school', 'truth:well', ...extra]), shown = [];
    const story = new TruthReconstruction(evidence,
      { say: async (...lines) => shown.push(...lines), choose: async () => 0 }, id => evidence.add(id));
    assert.equal(await story.read(2), true);
    assert.equal(story.complete, true);
    runs.push(shown);
  }
  assert.equal(runs[1].length - runs[0].length, 2);
});
