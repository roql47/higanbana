import { NavGrid } from '../src/ai/navgrid.ts';

export function gridFromRows(rows) {
  return Object.assign(Object.create(NavGrid.prototype), {
    cell: 1, nx: rows[0].length, nz: rows.length, origin: { x: 0, z: 0 },
    walkable: Uint8Array.from(rows.join(''), (c) => c === '#' ? 0 : 1),
  });
}

export function randomGrid(size, seed, density = 0.25) {
  let state = seed;
  return gridFromRows(Array.from({ length: size }, () => Array.from({ length: size }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32 < density ? '#' : '.';
  }).join('')));
}

export function pathLength(path) {
  return path?.reduce((sum, p, i) => sum + (i ? p.distanceTo(path[i - 1]) : 0), 0) ?? Infinity;
}

// Independent Dijkstra oracle, intentionally simple; it does not share the A* queue or heuristic.
export function shortestDistance(grid, from, to) {
  const start = grid.nearestWalkable(...grid.toCell(from.x, from.z));
  const goal = grid.nearestWalkable(...grid.toCell(to.x, to.z));
  if (!start || !goal) return Infinity;
  const distances = new Map([[start.join(','), 0]]);
  const frontier = [[...start, 0]];
  while (frontier.length) {
    frontier.sort((a, b) => b[2] - a[2]);
    const [x, z, d] = frontier.pop();
    if (d !== distances.get(`${x},${z}`)) continue;
    if (x === goal[0] && z === goal[1]) return d;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if ((!dx && !dz) || !grid.isWalkable(x + dx, z + dz)) continue;
      if (dx && dz && (!grid.isWalkable(x + dx, z) || !grid.isWalkable(x, z + dz))) continue;
      const key = `${x + dx},${z + dz}`;
      const next = d + Math.hypot(dx, dz);
      if (next >= (distances.get(key) ?? Infinity)) continue;
      distances.set(key, next);
      frontier.push([x + dx, z + dz, next]);
    }
  }
  return Infinity;
}
