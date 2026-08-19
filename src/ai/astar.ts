import * as THREE from 'three';
import type { NavGrid } from './navgrid';

/** 8방향 A*. 대각선은 양 옆이 모두 뚫려 있어야 통과(모서리 끼임 방지). */
export function findPath(grid: NavGrid, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
  const [sx, sz] = grid.toCell(from.x, from.z);
  const start = grid.nearestWalkable(sx, sz);
  const [gx, gz] = grid.toCell(to.x, to.z);
  const goal = grid.nearestWalkable(gx, gz);
  if (!start || !goal) return null;

  const { nx } = grid;
  const idx = (x: number, z: number) => z * nx + x;
  const startI = idx(start[0], start[1]);
  const goalI = idx(goal[0], goal[1]);
  if (startI === goalI) return [grid.toWorld(goal[0], goal[1])];

  const gScore = new Map<number, number>([[startI, 0]]);
  const came = new Map<number, number>();
  // 단순 이진 힙
  const heap: [number, number][] = [[heuristic(start[0], start[1], goal[0], goal[1]), startI]];
  const inOpen = new Set<number>([startI]);
  const DIRS: [number, number, number][] = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  let iter = 0;
  while (heap.length && iter++ < 20000) {
    // pop min
    let mi = 0;
    for (let i = 1; i < heap.length; i++) if (heap[i]![0] < heap[mi]![0]) mi = i;
    const [, cur] = heap.splice(mi, 1)[0]!;
    inOpen.delete(cur);
    if (cur === goalI) return reconstruct(grid, came, cur);
    const cx = cur % nx, cz = Math.floor(cur / nx);
    for (const [dx, dz, cost] of DIRS) {
      const nxc = cx + dx, nzc = cz + dz;
      if (!grid.isWalkable(nxc, nzc)) continue;
      if (dx !== 0 && dz !== 0 && (!grid.isWalkable(cx + dx, cz) || !grid.isWalkable(cx, cz + dz))) continue;
      const ni = idx(nxc, nzc);
      const g = gScore.get(cur)! + cost;
      if (g < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, g);
        came.set(ni, cur);
        if (!inOpen.has(ni)) { heap.push([g + heuristic(nxc, nzc, goal[0], goal[1]), ni]); inOpen.add(ni); }
      }
    }
  }
  return null;
}

function heuristic(x0: number, z0: number, x1: number, z1: number) {
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

function reconstruct(grid: NavGrid, came: Map<number, number>, cur: number): THREE.Vector3[] {
  const cells: number[] = [cur];
  while (came.has(cur)) { cur = came.get(cur)!; cells.push(cur); }
  cells.reverse();
  // 일직선 셀 병합 (간단한 스무딩)
  const pts: THREE.Vector3[] = [];
  let lastDx = 99, lastDz = 99;
  for (let i = 0; i < cells.length; i++) {
    const x = cells[i]! % grid.nx, z = Math.floor(cells[i]! / grid.nx);
    if (i > 0) {
      const px = cells[i - 1]! % grid.nx, pz = Math.floor(cells[i - 1]! / grid.nx);
      const dx = x - px, dz = z - pz;
      if (dx === lastDx && dz === lastDz) pts.pop();
      lastDx = dx; lastDz = dz;
    }
    pts.push(grid.toWorld(x, z));
  }
  return pts;
}
