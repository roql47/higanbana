import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';

export interface NoiseEvent {
  pos: THREE.Vector3;
  radius: number;
  strength: number;
  t: number; // 발생 시각(초)
}

/**
 * 요괴의 감각. **공정성 규칙: 플레이어 위치를 직접 주지 않는다** — 소음 이벤트와 시야 판정만.
 *
 * 시야: 거리 D = base(6 m) × 초칭 배율(0.6/1.4/3.0) × 이동중 1.2 — 빛이 곧 위험이다.
 * 차폐: 요괴 눈 → 플레이어 가슴 레이캐스트 (토리이 기둥·나무·집 벽이 시야를 끊는다).
 */
export class Senses {
  private noises: NoiseEvent[] = [];
  private time = 0;
  private ray: InstanceType<Physics['R']['Ray']>;

  constructor(private physics: Physics) {
    this.ray = new physics.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  }

  update(dt: number) {
    this.time += dt;
    // 4초 지난 소음은 잊는다
    let live = 0;
    for (const n of this.noises) if (this.time - n.t < 4) this.noises[live++] = n;
    this.noises.length = live;
  }

  /** 발소리·던진 돌 등 — main 루프가 밀어넣는다 */
  emitNoise(pos: THREE.Vector3, radius: number, strength = 1) {
    this.noises.push({ pos: pos.clone(), radius, strength, t: this.time });
  }

  /** earPos 에서 들리는 가장 강한 최근 소음 (radius 안에 있어야 들린다) */
  loudestNoise(earPos: THREE.Vector3): NoiseEvent | null {
    let best: NoiseEvent | null = null;
    let bestScore = 0;
    for (const n of this.noises) {
      const d2 = earPos.distanceToSquared(n.pos);
      if (n.radius <= 0 || d2 > n.radius * n.radius) continue;
      const d = Math.sqrt(d2);
      const score = n.strength * (1 - d / n.radius) * (1 - (this.time - n.t) / 4);
      if (score > bestScore) { bestScore = score; best = n; }
    }
    return best;
  }

  /** 현재 감지 거리(m) — 초칭 밝기가 다이얼이다 */
  detectionRange(playerMoving: boolean, extraMul = 1): number {
    const mul = settings.chochin.detectionMul[settings.chochin.level] ?? 1;
    return settings.ai.baseDetection * mul * (playerMoving ? 1.2 : 1) * extraMul;
  }

  private dir = new THREE.Vector3();
  /**
   * 시야 판정: 시야콘 + 감지 거리 + 레이캐스트 차폐.
   * @param eye     요괴 눈 위치(월드)
   * @param facing  요괴가 바라보는 방향(정규화, 수평)
   */
  canSee(eye: THREE.Vector3, facing: THREE.Vector3, playerPos: THREE.Vector3, playerMoving: boolean, extraMul = 1): boolean {
    this.dir.copy(playerPos).setY(playerPos.y + 1.2).sub(eye);
    const dist2 = this.dir.lengthSq();
    const range = this.detectionRange(playerMoving, extraMul);
    if (dist2 > range * range) return false;
    // 시야콘 90° (전방 ±45°) — 아주 가까우면(2 m) 뒤라도 알아챈다
    const fx = facing.x, fz = facing.x === 0 && facing.z === 0 ? 1 : facing.z;
    const dx = this.dir.x, dz = this.dir.x === 0 && this.dir.z === 0 ? 1 : this.dir.z;
    const dot = dx * fx + dz * fz;
    const h2 = dx * dx + dz * dz;
    if (dist2 > 4 && (dot < 0 || 2 * dot * dot < h2 * (fx * fx + fz * fz))) return false;
    const dist = Math.sqrt(dist2);
    if (dist <= 0.6) return true;
    this.dir.multiplyScalar(1 / dist);
    // 차폐
    this.ray.origin.x = eye.x; this.ray.origin.y = eye.y; this.ray.origin.z = eye.z;
    this.ray.dir.x = this.dir.x; this.ray.dir.y = this.dir.y; this.ray.dir.z = this.dir.z;
    const hit = this.physics.world.castRay(this.ray, dist - 0.6, true);
    return hit === null; // 플레이어(키네마틱)는 castRay(solid) 대상이지만 dist-0.6 로 제외
  }
}
