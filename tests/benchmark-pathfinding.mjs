import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { Vector3 } from 'three';
import { findPath } from '../src/ai/astar.ts';
import { randomGrid, pathLength } from './nav-fixture.mjs';

// Optional baseline: git show HEAD:src/ai/astar.ts > artifacts/review/astar-before.ts
// node --import ./tests/register.mjs tests/benchmark-pathfinding.mjs artifacts/review/astar-before.ts
const baseline = process.argv[2] ? (await import(pathToFileURL(resolve(process.argv[2])).href)).findPath : null;
const cases = Array.from({ length: 30 }, (_, i) => ({
  grid: randomGrid(120, i + 1, 0.18),
  from: new Vector3(0.5, 0, 0.5), to: new Vector3(119.5, 0, 119.5),
}));

function run(fn) {
  const start = performance.now();
  const lengths = cases.map(({ grid, from, to }) => pathLength(fn(grid, from, to)));
  return { ms: performance.now() - start, lengths };
}

for (const fn of [baseline, findPath].filter(Boolean)) run(fn); // warmup
const results = [];
for (let i = 0; i < 7; i++) {
  // Alternate order to reduce systematic JIT/thermal bias.
  const row = {};
  for (const [name, fn] of (i % 2 ? [['after', findPath], ['before', baseline]] : [['before', baseline], ['after', findPath]])) {
    if (fn) row[name] = run(fn);
  }
  results.push(row);
}
const summary = {};
for (const name of ['before', 'after']) {
  const samples = results.map((r) => r[name]).filter(Boolean);
  if (!samples.length) continue;
  const times = samples.map((r) => r.ms).sort((a, b) => a - b);
  summary[name] = { medianBatchMs: +times[3].toFixed(2), meanSearchMs: +(times[3] / cases.length).toFixed(3),
    reachable: samples[0].lengths.filter(Number.isFinite).length };
}
if (baseline) summary.speedup = +(summary.before.medianBatchMs / summary.after.medianBatchMs).toFixed(2);
console.log(JSON.stringify({ gridSize: '120x120', searchesPerBatch: cases.length, batches: 7, ...summary }, null, 2));
