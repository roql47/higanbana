import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { VillageGround } from '@/world/village/ground';

/**
 * 요괴 길찾기용 격자. 지형 높이 함수 + Rapier 정적 콜라이더 검사로 통행 가능 셀을 굽는다.
 *
 * 셀 1.5 m. 판정:
 *  - 경사 > 0.85 (산자락·계곡 사면) → 차단
 *  - 셀 중심 h+0.9 에 세운 캡슐이 정적 콜라이더(나무·토리이 기둥·집 벽)와 교차 → 차단
 *    (캡슐 바닥이 h+0.15 라 지형 하이트필드와는 안 닿는다)
 */
export class NavGrid {
  readonly cell: number;
  readonly nx: number;
  readonly nz: number;
  readonly origin: { x: number; z: number };
  /** 1 = 통행 가능 */
  readonly walkable: Uint8Array;

  constructor(physics: Physics, ground: VillageGround, cell = 1.5) {
    this.cell = cell;
    const half = ground.size / 2 - 2;
    this.origin = { x: -half, z: -half };
    this.nx = Math.floor((half * 2) / cell);
    this.nz = this.nx;
    this.walkable = new Uint8Array(this.nx * this.nz);

    const R = physics.R;
    const shape = new R.Capsule(0.35, 0.35);
    const rot = { x: 0, y: 0, z: 0, w: 1 };
    let open = 0;
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.origin.x + (ix + 0.5) * cell;
        const z = this.origin.z + (iz + 0.5) * cell;
        if (ground.slopeAt(x, z) > 0.85) continue;
        const h = ground.heightAt(x, z);
        let blocked = false;
        physics.world.intersectionsWithShape({ x, y: h + 0.9, z }, rot, shape, (col) => {
          // 다이내믹(밀 수 있는 소품)은 무시, 고정만 차단
          if (col.parent()?.isFixed()) { blocked = true; return false; }
          return true;
        });
        if (!blocked) { this.walkable[iz * this.nx + ix] = 1; open++; }
      }
    }
    console.info(`[navgrid] ${this.nx}×${this.nz} cells, walkable ${open} (${((open / (this.nx * this.nz)) * 100).toFixed(0)}%)`);
  }

  toCell(x: number, z: number): [number, number] {
    return [
      Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.origin.x) / this.cell))),
      Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.origin.z) / this.cell))),
    ];
  }

  toWorld(ix: number, iz: number, out = new THREE.Vector3()) {
    out.x = this.origin.x + (ix + 0.5) * this.cell;
    out.z = this.origin.z + (iz + 0.5) * this.cell;
    return out;
  }

  isWalkable(ix: number, iz: number) {
    return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz && this.walkable[iz * this.nx + ix] === 1;
  }

  /** 목표 셀이 막혔으면 주변 나선으로 가장 가까운 통행 셀 */
  nearestWalkable(ix: number, iz: number): [number, number] | null {
    if (this.isWalkable(ix, iz)) return [ix, iz];
    for (let r = 1; r <= 6; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (this.isWalkable(ix + dx, iz + dz)) return [ix + dx, iz + dz];
      }
    }
    return null;
  }
}
