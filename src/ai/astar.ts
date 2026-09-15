import * as THREE from 'three';
import type { NavGrid } from './navgrid';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

/** 격자당 작업 메모리 한 벌. 여러 요괴의 연속 탐색에서 Map/Set과 노드 배열을 다시 만들지 않는다. */
class SearchWorkspace {
  readonly score: Float64Array;
  readonly came: Int32Array;
  readonly seen: Uint32Array;
  private readonly priority: Float64Array;
  private readonly heap: Int32Array;
  private readonly position: Int32Array;
  generation = 0;
  size = 0;

  constructor(cells: number) {
    this.score = new Float64Array(cells);
    this.came = new Int32Array(cells);
    this.seen = new Uint32Array(cells);
    this.priority = new Float64Array(cells);
    this.heap = new Int32Array(cells);
    this.position = new Int32Array(cells);
  }

  reset() {
    this.size = 0;
    this.generation = (this.generation + 1) >>> 0;
    if (this.generation === 0) { this.seen.fill(0); this.generation = 1; }
  }

  /** 기존 후보도 더 짧은 경로를 찾으면 우선순위를 갱신한다 (decrease-key). */
  offer(cell: number, g: number, parent: number, f: number) {
    let i = this.seen[cell] === this.generation ? this.position[cell]! : -1;
    this.seen[cell] = this.generation;
    this.score[cell] = g;
    this.came[cell] = parent;
    this.priority[cell] = f;
    if (i < 0) i = this.size++;
    while (i > 0) {
      const parentIndex = (i - 1) >>> 1;
      const other = this.heap[parentIndex]!;
      if (this.priority[other]! <= f) break;
      this.heap[i] = other;
      this.position[other] = i;
      i = parentIndex;
    }
    this.heap[i] = cell;
    this.position[cell] = i;
  }

  pop(): number {
    const result = this.heap[0]!;
    const last = this.heap[--this.size]!;
    this.position[result] = -1;
    if (this.size > 0) {
      let i = 0;
      while (i * 2 + 1 < this.size) {
        let child = i * 2 + 1;
        if (child + 1 < this.size && this.priority[this.heap[child + 1]!]! < this.priority[this.heap[child]!]!) child++;
        const other = this.heap[child]!;
        if (this.priority[last]! <= this.priority[other]!) break;
        this.heap[i] = other;
        this.position[other] = i;
        i = child;
      }
      this.heap[i] = last;
      this.position[last] = i;
    }
    return result;
  }
}

const workspaces = new WeakMap<NavGrid, SearchWorkspace>();

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

  let search = workspaces.get(grid);
  if (!search) { search = new SearchWorkspace(grid.nx * grid.nz); workspaces.set(grid, search); }
  search.reset();
  search.offer(startI, 0, -1, heuristic(start[0], start[1], goal[0], goal[1]));
  // 양의 비용과 일관된 octile 휴리스틱으로 유한 격자를 탐색한다. 고정 20,000회 제한은
  // 큰 맵의 도달 가능한 경로까지 끊었으므로 후보가 소진될 때 종료한다.
  while (search.size) {
    const cur = search.pop();
    if (cur === goalI) return reconstruct(grid, search.came, cur);
    const cx = cur % nx, cz = Math.floor(cur / nx);
    for (const [dx, dz, cost] of DIRS) {
      const nxc = cx + dx, nzc = cz + dz;
      if (!grid.isWalkable(nxc, nzc)) continue;
      if (dx !== 0 && dz !== 0 && (!grid.isWalkable(cx + dx, cz) || !grid.isWalkable(cx, cz + dz))) continue;
      const ni = idx(nxc, nzc);
      const g = search.score[cur]! + cost;
      if (search.seen[ni] === search.generation && g >= search.score[ni]!) continue;
      search.offer(ni, g, cur, g + heuristic(nxc, nzc, goal[0], goal[1]));
    }
  }
  return null;
}

function heuristic(x0: number, z0: number, x1: number, z1: number) {
  const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
  return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
}

function reconstruct(grid: NavGrid, came: Int32Array, cur: number): THREE.Vector3[] {
  const cells: number[] = [cur];
  while (came[cur] !== -1) { cur = came[cur]!; cells.push(cur); }
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
