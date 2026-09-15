import test from 'node:test';
import assert from 'node:assert/strict';
import { Act17Conclusion } from '../src/story/act17.ts';
import { GameClock } from '../src/core/gameClock.ts';

function fixture() {
  const events = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const act = new Act17Conclusion({
    dialogue: { say: async () => { events.push('dialogue'); await gate; } },
    quests: { glitchTo: async () => { events.push('glitch'); } },
    wait: async () => { events.push('wait'); },
    checkpoint: () => { events.push(`save:${act.state}`); },
    onComplete: () => { events.push('ending'); },
  });
  return { act, events, release };
}

test('pending/legacy ACT 17 resumes once and saves completion before entering the next chapter', async () => {
  for (const state of [undefined, 'pending']) {
    const { act, events, release } = fixture();
    act.restore(state, true);
    assert.equal(act.state, 'pending');
    const run = act.resume();
    assert.equal(act.running, true);
    assert.equal(act.play(), run, 'duplicate triggers must share one sequence');
    release();
    await run;
    assert.equal(act.state, 'complete');
    assert.equal(act.running, false);
    assert.deepEqual(events, ['save:pending', 'dialogue', 'glitch', 'wait', 'glitch', 'wait', 'glitch', 'dialogue', 'save:complete', 'ending']);
  }
});

test('a completed ACT 17 continues directly; earlier chapters do not start it', async () => {
  const { act, events } = fixture();
  act.restore(undefined, false);
  await act.resume();
  assert.deepEqual(events, []);
  act.restore('complete', true);
  await act.resume();
  assert.deepEqual(events, ['ending']);
});

test('story waits advance only with the game clock, preserving a pause between dialogue beats', async () => {
  const clock = new GameClock();
  let complete = false;
  const waiting = clock.wait(700).then(() => { complete = true; });
  clock.update(0.3);
  await Promise.resolve();
  assert.equal(complete, false);
  // During pause no update is delivered, including while microtasks/UI events continue.
  await Promise.resolve();
  assert.equal(complete, false);
  clock.update(0.41);
  await waiting;
  assert.equal(complete, true);
});
