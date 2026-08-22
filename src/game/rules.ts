import * as THREE from 'three';
import { L } from '@/core/i18n';
import { Props } from '@/world/props';
import { normalize } from '@/world/village/landmarks';

/**
 * 게임 규칙 v2 — 스토리 7공물 (PLAN-STORY §1.2, §3, 각색 1·5)
 *
 * 히간누시의 가짜 퀘스트 「7개의 공물을 찾아라」. 실체는 봉인 해제다.
 *   · 순서 반고정(각색 5): 방울 → 머리빗 → 동전 → {게다·거울 자유} → 봉인패
 *   · 회마다 "탐색 → 획득 → **운반**(감지 ×1.5, 금기 一) → 봉납" 왕복이 게임이다 (§3.1~3.2)
 *   · 봉납 수 = 봉인 해제 단계 = 난이도 다이얼 (§1.2). v0.12 의 긴장 곡선 수치를 그대로 쓴다
 *   · 일곱 번째(사요)는 아이템이 아니다 — 받침대 하나가 끝까지 비어 있는 게 복선
 *   · 봉인패는 받침대가 받지 않는다 → ACT 17 의 UI 3단 변조로 이어진다 (onFudaRefused)
 */
export type OfferingId = 'suzu' | 'kushi' | 'coins' | 'geta' | 'kagami' | 'fuda' | 'sayo';

export interface OfferingDef {
  id: OfferingId;
  name: string;
  /** HUD 행에 뜨는 장소 힌트 */
  where: string;
  color: number;
  /** 월드 위치. sayo 는 null — 스폰되지 않는다 */
  pos: THREE.Vector3 | null;
  /** 소품 GLB. 없으면 자리표시자(발광 구슬)로 남는다 */
  model?: string;
  /** 놓였을 때의 **가장 긴 변**(m). 손에 드는 물건은 그게 곧 크기다 */
  size?: number;
}

/** 순서 게이팅 — 앞 그룹이 전부 **봉납**되어야 다음 그룹이 열린다 */
const GROUPS: OfferingId[][] = [['suzu'], ['kushi'], ['coins'], ['geta', 'kagami'], ['fuda']];

export interface RulesEvents {
  onPickup?: (o: OfferingDef, carriedCount: number) => void;
  /** slotIndex: 받침대 번호 (0-기준, 봉납 순) */
  onOffer?: (o: OfferingDef, offeredCount: number, slotIndex: number) => void;
  /** 봉인패를 받침대에 놓으려 함 — ACT 17 트리거. 1회만 */
  onFudaRefused?: () => void;
  onPrompt?: (text: string | null) => void;
}

export class Rules {
  /** 봉납된 공물 (난이도 입력) */
  readonly offeredSet = new Set<OfferingId>();
  /** 들고 있는 공물 (획득했지만 봉납 전 = 운반 상태) */
  readonly carried: OfferingId[] = [];
  /** 석판 조사 전에는 아무것도 스폰되지 않는다 */
  started = false;
  fudaRefused = false;

  private pickups = new Map<OfferingId, THREE.Object3D>();
  /** 표식 라이트 — 씬에 상주 (제거하면 라이트 수가 바뀌어 전 셰이더 재컴파일) */
  private pickupLights = new Map<OfferingId, THREE.PointLight>();
  private glowMats = new Map<OfferingId, THREE.MeshStandardMaterial>();
  /** 로드된 공물 소품 원본 (id → 정규화된 오브젝트). 획득 자리와 봉납 받침대가 같은 것을 복제해 쓴다 */
  private protos = new Map<OfferingId, THREE.Object3D>();
  private t = 0;
  private lastPrompt: string | null = null;
  private nearPickup: OfferingId | null = null;
  onChange: (() => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    readonly offerings: OfferingDef[],
    /** 봉납 판정 중심 — 받침대 반원의 석판 위치 */
    readonly altar: THREE.Vector3,
    private events: RulesEvents = {},
  ) {
    // 라이트는 미리 전부 만들어 상주시킨다 (켜고 끄기만)
    for (const o of offerings) {
      if (!o.pos) continue;
      const l = new THREE.PointLight(o.color, 0.001, 4.5, 2);
      l.castShadow = false;
      l.position.copy(o.pos).add(new THREE.Vector3(0, 0.6, 0));
      this.scene.add(l);
      this.pickupLights.set(o.id, l);
    }
  }

  get offered() { return this.offeredSet.size; }
  get total() { return this.offerings.length; } // 7 — sayo 포함
  get carrying() { return this.carried.length > 0; }

  /** 지금 주울 수 있는 공물 (게이팅 ∧ 미획득) */
  available(): OfferingId[] {
    const out: OfferingId[] = [];
    for (let g = 0; g < GROUPS.length; g++) {
      let prevDone = true;
      for (let i = 0; i < g; i++) for (const id of GROUPS[i]!) if (!this.offeredSet.has(id)) prevDone = false;
      if (!prevDone) break;
      for (const id of GROUPS[g]!) if (!this.offeredSet.has(id) && !this.carried.includes(id)) out.push(id);
      if (out.length) break; // 현재 그룹만 연다
    }
    return out;
  }

  /** 잠김/열림/운반/봉납 — HUD 행 상태 */
  stateOf(id: OfferingId): 'locked' | 'open' | 'carried' | 'offered' {
    if (this.offeredSet.has(id)) return 'offered';
    if (this.carried.includes(id)) return 'carried';
    return this.available().includes(id) ? 'open' : 'locked';
  }

  /** 긴장 곡선 (PLAN-STORY §1.2 — v0.12 수치 재사용, 봉납 수 기준) */
  get hunterSpeed() {
    const n = this.offered;
    return n >= 4 ? 3.9 : n >= 2 ? 3.6 : n >= 1 ? 3.4 : 3.2;
  }
  /** 감지 배율 — 운반 중(금기 一 위반)이면 ×1.5 (§3.2) */
  get detectionMul() { return (this.offered >= 3 ? 1.3 : 1.0) * (this.carrying ? 1.5 : 1.0); }
  /** 여우 요괴가 마을로 내려오는가 */
  get secondHunterRoams() { return this.offered >= 4; }

  /** 석판 조사 → 퀘스트 개시. 첫 공물이 스폰된다 */
  begin() {
    if (this.started) return;
    this.started = true;
    this.refresh();
    this.onChange?.();
  }

  private refresh() {
    if (!this.started) return;
    for (const id of this.available()) {
      if (this.pickups.has(id)) continue;
      const def = this.offerings.find((o) => o.id === id)!;
      if (def.pos) this.spawnPickup(def);
    }
  }

  /**
   * 공물 소품 원본을 한 번만 로드해 캐시한다. 획득 자리와 봉납 받침대가 **같은 것**을 복제해 쓴다.
   * 실패하면 null — 자리표시자(발광 구슬)가 그대로 남는다.
   */
  async prototype(o: OfferingDef): Promise<THREE.Object3D | null> {
    if (!o.model) return null;
    const hit = this.protos.get(o.id);
    if (hit) return hit;
    try {
      const g = await Props.loader().loadAsync(o.model);
      const n = normalize(g.scene, o.size ?? 0.16);
      /**
       * **가장 긴 변** 기준으로 다시 맞춘다. `normalize()` 는 **높이** 기준이라 눕는 물건이 커진다 —
       * 게다를 높이 17 cm 로 맞췄더니 길이가 **30 cm**, 빗은 **21 cm** 가 됐다(실측).
       * 손에 드는 물건은 "가장 긴 곳"이 곧 크기다. 원점이 바닥이라 스케일을 곱해도 바닥은 그대로다.
       */
      const bb = new THREE.Box3().setFromObject(n);
      const ext = bb.getSize(new THREE.Vector3());
      const longest = Math.max(ext.x, ext.y, ext.z);
      if (longest > 1e-4) n.scale.multiplyScalar((o.size ?? 0.16) / longest);
      this.protos.set(o.id, n);
      return n;
    } catch (e) {
      console.warn('[rules] 공물 모델 로드 실패 →', o.id, e);
      return null;
    }
  }
  /** 이미 로드된 원본의 복제 (없으면 null) — 봉납 받침대가 쓴다 */
  cloneModel(id: OfferingId): THREE.Object3D | null {
    const p = this.protos.get(id);
    return p ? p.clone(true) : null;
  }

  private spawnPickup(o: OfferingDef) {
    const g = new THREE.Group();
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x3a2f25, roughness: 0.9 }));
    pedestal.position.y = 0.08; pedestal.castShadow = true; g.add(pedestal);
    // 자리표시자 — 모델이 도착할 때까지, 혹은 없을 때 그대로 남는다
    const mat = new THREE.MeshStandardMaterial({ color: o.color, emissive: new THREE.Color(o.color), emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.1 });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 2), mat);
    orb.position.y = 0.5; orb.name = 'orb'; g.add(orb);
    g.position.copy(o.pos!);
    g.name = `offering-${o.id}`;
    this.glowMats.set(o.id, mat);
    this.scene.add(g);
    this.pickups.set(o.id, g);
    const l = this.pickupLights.get(o.id);
    if (l) l.intensity = 1.1;
    // 실물이 오면 구슬을 치운다. **떠서 도는 대신 받침대 위에 놓인다** —
    // 이 게임에서 공물은 전리품이 아니라 **누가 놓고 간 물건**이다. 찾게 만드는 건 옆의 불빛이다
    void this.prototype(o).then((proto) => {
      if (!proto || this.pickups.get(o.id) !== g) return;
      const item = proto.clone(true);
      item.name = 'item';
      item.position.y = 0.17;
      item.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
      g.add(item);
      orb.visible = false;
      this.glowMats.delete(o.id);
    });
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.t += dt;
    const bob = Math.sin(this.t * 2.2) * 0.06;
    for (const [id, g] of this.pickups) {
      const item = g.getObjectByName('item');
      if (item) {
        // 실물은 떠 있지 않는다 — 아주 느리게만 돈다(놓인 물건을 한 바퀴 보여주는 정도)
        item.rotation.y += dt * 0.35;
      } else {
        const orb = g.getObjectByName('orb');
        if (orb) { orb.position.y = 0.5 + bob; orb.rotation.y += dt * 0.8; }
      }
      // 표식 불빛이 대신 맥동한다 — 실물이 오면 자체 발광이 사라지므로 이게 유일한 눈길이다
      const l = this.pickupLights.get(id);
      if (l) l.intensity = 1.0 + 0.35 * Math.sin(this.t * 3.1);
    }
    for (const [, m] of this.glowMats) m.emissiveIntensity = 1.2 + 0.4 * Math.sin(this.t * 3.1);

    // 프롬프트
    let prompt: string | null = null;
    this.nearPickup = null;
    for (const [id, g] of this.pickups) {
      if (g.position.distanceTo(playerPos) < 1.9) {
        this.nearPickup = id;
        const def = this.offerings.find((o) => o.id === id)!;
        prompt = L(`[E] ${def.name} — 줍는다`, `[E] ${def.name} — 拾う`);
        break;
      }
    }
    if (!prompt && this.altar.distanceTo(playerPos) < 2.8 && this.carried.length > 0) {
      const first = this.carried.find((id) => id !== 'fuda');
      if (first) {
        const def = this.offerings.find((o) => o.id === first)!;
        prompt = L(`[E] ${def.name} — 받침대에 놓는다`, `[E] ${def.name} — 台座に置く`);
      } else if (!this.fudaRefused) {
        prompt = L('[E] 봉인패 — 받침대에 놓는다', '[E] 封印札 — 台座に置く');
      }
    }
    if (prompt !== this.lastPrompt) { this.lastPrompt = prompt; this.events.onPrompt?.(prompt); }
  }

  /** E 키 — 처리했으면 true */
  interact(playerPos: THREE.Vector3): boolean {
    // 줍기
    if (this.nearPickup) {
      const id = this.nearPickup;
      const g = this.pickups.get(id)!;
      g.removeFromParent(); // 메시만 — 라이트는 상주
      const l = this.pickupLights.get(id);
      if (l) l.intensity = 0.001;
      this.pickups.delete(id);
      this.glowMats.delete(id);
      this.carried.push(id);
      this.nearPickup = null;
      const def = this.offerings.find((o) => o.id === id)!;
      this.events.onPickup?.(def, this.carried.length);
      this.onChange?.();
      return true;
    }
    // 봉납
    if (this.altar.distanceTo(playerPos) < 2.8 && this.carried.length > 0) {
      const idx = this.carried.findIndex((id) => id !== 'fuda');
      if (idx >= 0) {
        const id = this.carried[idx]!;
        this.carried.splice(idx, 1);
        this.offeredSet.add(id);
        const def = this.offerings.find((o) => o.id === id)!;
        this.events.onOffer?.(def, this.offeredSet.size, this.offeredSet.size - 1);
        this.refresh(); // 다음 공물 스폰
        this.onChange?.();
        return true;
      }
      if (!this.fudaRefused) {
        // 받침대가 봉인패를 받지 않는다 — ACT 17
        this.fudaRefused = true;
        this.events.onFudaRefused?.();
        this.onChange?.();
        return true;
      }
    }
    return false;
  }

  /** 사망·R 리셋 — 스토리 진행(봉납)은 유지, 들고 있던 것만 원위치 (§3.2 강탈 규칙과 동일) */
  dropCarried() {
    for (const id of [...this.carried]) {
      const def = this.offerings.find((o) => o.id === id)!;
      if (def.pos) this.spawnPickup(def);
    }
    this.carried.length = 0;
    this.onChange?.();
  }

  /** 완전 리셋 (R) */
  reset() {
    for (const [, g] of this.pickups) g.removeFromParent();
    this.pickups.clear();
    this.glowMats.clear();
    this.carried.length = 0;
    this.offeredSet.clear();
    this.fudaRefused = false;
    for (const [, l] of this.pickupLights) l.intensity = 0.001;
    this.refresh();
    this.onChange?.();
  }
}
