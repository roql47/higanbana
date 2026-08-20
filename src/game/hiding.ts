import * as THREE from 'three';
import type { Village } from '@/world/village';
import type { Hunter } from '@/ai/hunter';

/**
 * 은신 3종 (기획 3.7) — 전부 "웅크린 채 그 자리에 있으면" 성립. 별도 조작 없음.
 *  - 노점(屋台) 아래: 광장 노점 반경 1.3 m
 *  - 논의 벼 사이: 논 안 + **정지해 있을 때만** (움직이면 벼가 흔들려 무효)
 *  - 폐가 벽장(押入れ)
 *
 * 핵심 규칙: **은신은 도망의 마무리이지 시작이 아니다** — 추격 중 시야가 이어진 채(1 s 이내 목격)
 * 숨으면 그 요괴에게는 보인다. 시야를 먼저 끊고 숨어야 성립한다.
 */
export type HideSpot = 'stall' | 'rice' | 'closet' | null;

export class Hiding {
  spot: HideSpot = null;
  private wasHidden = false;

  constructor(private village: Village) {}

  /** 이번 프레임의 은신 장소 판정 (요괴 무관 — 장소+자세만) */
  evaluate(playerPos: THREE.Vector3, crouching: boolean, speed: number): HideSpot {
    if (!crouching) { this.spot = null; return null; }
    // 벽장
    if (this.village.house.isInCloset(playerPos)) { this.spot = 'closet'; return this.spot; }
    // 노점 아래
    for (const s of this.village.square.stalls) {
      if (s.pos.distanceTo(playerPos) < 1.3) { this.spot = 'stall'; return this.spot; }
    }
    // 벼 사이 — 정지 필수
    if (speed < 0.25 && this.village.ground.paddyMask(playerPos.x, playerPos.z) > 0.2) { this.spot = 'rice'; return this.spot; }
    this.spot = null;
    return null;
  }

  /** 이 요괴 기준으로 숨었는가 — 추격 중 시야가 이어져 있으면(최근 1 s 내 목격) 무효 */
  hiddenFor(h: Hunter): boolean {
    if (!this.spot) return false;
    if (h.state === 'CHASE' && h.loseTime < 1.0) return false;
    return true;
  }

  /** 진입/이탈 전이 감지 (사운드용). 반환: 'in' | 'out' | null */
  transition(): 'in' | 'out' | null {
    const now = this.spot !== null;
    const t = now === this.wasHidden ? null : now ? 'in' : 'out';
    this.wasHidden = now;
    return t;
  }
}
