import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { findPath } from '../src/ai/astar.ts';
import { gridFromRows, randomGrid, pathLength, shortestDistance } from './nav-fixture.mjs';

test('A* never cuts blocked corners', () => {
  const grid = gridFromRows(['.#', '#.']);
  assert.equal(findPath(grid, new Vector3(0.5, 0, 0.5), new Vector3(1.5, 0, 1.5)), null);
});

test('A* matches Dijkstra on seeded obstacle maps, including repeated searches', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const grid = randomGrid(20, seed);
    const from = new Vector3(0.5, 0, 0.5), to = new Vector3(19.5, 0, 19.5);
    for (const [a, b] of [[from, to], [to, from], [from, from]]) {
      const expected = shortestDistance(grid, a, b);
      const actual = pathLength(findPath(grid, a, b));
      assert.ok(actual === expected || Math.abs(actual - expected) < 1e-8, `seed ${seed}: ${actual} vs ${expected}`);
    }
  }
});

test('A* does not abort a valid long corridor at 20,000 expanded cells', () => {
  const size = 205;
  const rows = Array.from({ length: size }, (_, z) => z % 2 === 0 ? '.'.repeat(size)
    : (z % 4 === 1 ? '#'.repeat(size - 1) + '.' : '.' + '#'.repeat(size - 1)));
  const grid = gridFromRows(rows);
  const path = findPath(grid, new Vector3(0.5, 0, 0.5), new Vector3(204.5, 0, 204.5));
  assert.ok(path, 'reachable serpentine corridor must return a path');
  assert.equal(pathLength(path), 21216);
});

test('A* returns null for entirely blocked maps and clamps outside endpoints', () => {
  assert.equal(findPath(gridFromRows(['##', '##']), new Vector3(), new Vector3(1, 0, 1)), null);
  const grid = gridFromRows(['...', '...', '...']);
  assert.equal(pathLength(findPath(grid, new Vector3(-50, 0, -50), new Vector3(50, 0, 50))), 2 * Math.SQRT2);
});
