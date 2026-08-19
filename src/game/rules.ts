import * as THREE from 'three';
import { settings } from '@/core/settings';
import { Props } from '@/world/props';

/**
 * 게임 규칙 — 공물 5개를 모아 배전 앞에 봉납하면 축제가 끝나고 마을을 나간다.
 *
 *   수집 수 = 난이도 다이얼 (기획 3.2): 요괴 속도·감지 거리·두 번째 요괴 활성화가 여기 걸린다.
 *   마지막 공물을 줍는 순간이 가장 무섭고, 봉납하러 가는 참배로가 클라이맥스.
 */
export type OfferingId = 'sake' | 'rice' | 'salt' | 'water' | 'sakaki';

export interface OfferingDef {
  id: OfferingId;
  name: string;
  desc: string;
  color: number;        // 발광 색(픽업 표식)
  pos: THREE.Vector3;   // 월드
}

export interface RulesEvents {
  onPickup?: (o: OfferingDef, count: number) => void;
  onOffer?: () => void;      // 봉납 완료
  onEscape?: () => void;     // 탈출 = 클리어
  onPrompt?: (text: string | null) => void;
}

export class Rules {
  readonly collected = new Set<OfferingId>();
  offered = false;
  escaped = false;
  private pickups = new Map<OfferingId, THREE.Object3D>();
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private t = 0;
  private altarGlow: THREE.PointLight | null = null;
  private gate: THREE.Group | null = null;
  private lastPrompt: string | null = null;
  /** 봉납 시 물리 게이트 제거 콜백 (main 이 설정) */
  onGateOpen: (() => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    readonly offerings: OfferingDef[],
    readonly altar: THREE.Vector3,
    readonly exit: THREE.Vector3,
    private events: RulesEvents = {},
  ) {
    for (const o of offerings) this.spawnPickup(o);
    this.buildGate();
  }

  get count() { return this.collected.size; }
  get total() { return this.offerings.length; }
  get allCollected() { return this.collected.size >= this.offerings.length; }

  /** 0..1 — 수집 진행도 (난이도 곡선의 입력) */
  get progress() { return this.collected.size / Math.max(1, this.offerings.length); }

  /** 기획 3.2 긴장 곡선 */
  get hunterSpeed() {
    const n = this.collected.size;
    return n >= 4 ? 3.9 : n >= 2 ? 3.6 : 3.2;
  }
  get detectionMul() { return this.collected.size >= 3 ? 1.3 : 1.0; }
  /** 두 번째 추격자(여우)가 마을로 내려오는가 */
  get secondHunterRoams() { return this.collected.size >= 2; }

  private spawnPickup(o: OfferingDef) {
    // 공물 표식: 작은 받침 + 발광 구체 + 위아래로 떠오르는 빛. 모델은 단순 — 어둠 속에서 "거기 있다"만 읽히면 된다
    const g = new THREE.Group();
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0x3a2f25, roughness: 0.9 }));
    pedestal.position.y = 0.09; pedestal.castShadow = true; g.add(pedestal);
    const mat = new THREE.MeshStandardMaterial({ color: o.color, emissive: new THREE.Color(o.color), emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.1 });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), mat);
    orb.position.y = 0.55; orb.name = 'orb'; g.add(orb);
    const l = new THREE.PointLight(o.color, 1.1, 4.5, 2); l.position.y = 0.6; l.castShadow = false; g.add(l);
    g.position.copy(o.pos);
    g.name = `offering-${o.id}`;
    g.userData['light'] = l;
    this.glowMats.push(mat);
    this.scene.add(g);
    this.pickups.set(o.id, g);
  }

  /** 출구: 마을 남쪽, 참배로 시작점 너머의 다리. 봉납 전엔 안개 벽 + 금줄로 막혀 있다(= 전승 "같은 다리로 돌아온다") */
  private buildGate() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 });
    // 금줄(시메나와) 양쪽 기둥 + 줄 + 시데
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a1f16 }));
      post.position.set(sx * 2.2, 1.1, 0); g.add(post);
    }
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 8), mat);
    rope.rotation.z = Math.PI / 2; rope.position.y = 1.95; g.add(rope);
    for (let i = -1; i <= 1; i++) {
      const shide = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.55), new THREE.MeshStandardMaterial({ color: 0xf2ede0, side: THREE.DoubleSide }));
      shide.position.set(i * 1.3, 1.6, 0.02); g.add(shide);
    }
    // 보이지 않는 벽(물리) 은 main 이 달아준다(Physics 필요) — 여기선 비주얼만
    g.position.copy(this.exit);
    g.name = 'exit-gate';
    this.scene.add(g);
    this.gate = g;
  }

  get gateGroup() { return this.gate; }

  /** 봉납 뒤 금줄이 끊어져 내려앉는다 */
  private openGate() {
    if (!this.gate) return;
    const rope = this.gate.children.find((c) => (c as THREE.Mesh).geometry instanceof THREE.CylinderGeometry && c.rotation.z !== 0) as THREE.Mesh | undefined;
    if (rope) { rope.rotation.z = Math.PI / 2 + 0.55; rope.position.y = 0.9; rope.position.x = -0.9; }
    for (const c of this.gate.children) if ((c as THREE.Mesh).geometry instanceof THREE.PlaneGeometry) c.visible = false;
  }

  private tmp = new THREE.Vector3();
  /**
   * @returns 상호작용 프롬프트 텍스트(없으면 null). E 키 처리는 `interact()`
   */
  update(dt: number, playerPos: THREE.Vector3) {
    this.t += dt;
    // 픽업 표식 애니
    const bob = Math.sin(this.t * 2.2) * 0.06;
    for (const [, g] of this.pickups) {
      const orb = g.getObjectByName('orb'); if (orb) { orb.position.y = 0.55 + bob; orb.rotation.y += dt * 0.8; }
    }
    for (const m of this.glowMats) m.emissiveIntensity = 1.2 + 0.4 * Math.sin(this.t * 3.1);
    if (this.altarGlow) this.altarGlow.intensity = 2.2 + 0.5 * Math.sin(this.t * 4.3);

    // 프롬프트 판정
    let prompt: string | null = null;
    this.nearPickup = null;
    for (const [id, g] of this.pickups) {
      if (g.position.distanceTo(playerPos) < 1.9) { this.nearPickup = id; const def = this.offerings.find((o) => o.id === id)!; prompt = `[E] ${def.name} 줍기`; break; }
    }
    if (!prompt && !this.offered && this.altar.distanceTo(playerPos) < 2.4) {
      prompt = this.allCollected ? '[E] 공물을 봉납한다' : `공물 ${this.count}/${this.total} — 아직 부족하다`;
    }
    if (!prompt && this.offered && !this.escaped && this.exit.distanceTo(playerPos) < 3.0) {
      prompt = '[E] 마을을 나간다';
    }
    if (prompt !== this.lastPrompt) { this.lastPrompt = prompt; this.events.onPrompt?.(prompt); }
  }
  private nearPickup: OfferingId | null = null;

  /** E 키 */
  interact(playerPos: THREE.Vector3): boolean {
    if (this.nearPickup) {
      const id = this.nearPickup;
      const g = this.pickups.get(id)!;
      g.removeFromParent();
      this.pickups.delete(id);
      this.collected.add(id);
      const def = this.offerings.find((o) => o.id === id)!;
      this.events.onPickup?.(def, this.collected.size);
      this.nearPickup = null;
      return true;
    }
    if (!this.offered && this.allCollected && this.altar.distanceTo(playerPos) < 2.4) {
      this.offered = true;
      // 제단에 공물 5개 놓임 + 빛
      const l = new THREE.PointLight(0xfff0c8, 2.2, 9, 2);
      l.position.copy(this.altar).add(new THREE.Vector3(0, 1.0, -0.6));
      this.scene.add(l); this.altarGlow = l;
      let i = 0;
      for (const o of this.offerings) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), new THREE.MeshStandardMaterial({ color: o.color, emissive: new THREE.Color(o.color), emissiveIntensity: 1.5 }));
        m.position.copy(this.altar).add(new THREE.Vector3(-0.6 + i * 0.3, 1.25, -1.2));
        this.scene.add(m); i++;
      }
      this.openGate();
      this.onGateOpen?.();
      this.events.onOffer?.();
      return true;
    }
    if (this.offered && !this.escaped && this.exit.distanceTo(playerPos) < 3.0) {
      this.escaped = true;
      this.events.onEscape?.();
      return true;
    }
    return false;
  }

  /** 사망 후 재시작 — 수집물 초기화(기획 D8) */
  reset() {
    for (const [, g] of this.pickups) g.removeFromParent();
    this.pickups.clear();
    this.glowMats.length = 0;
    this.collected.clear();
    this.offered = false; this.escaped = false;
    if (this.altarGlow) { this.altarGlow.removeFromParent(); this.altarGlow = null; }
    for (const o of this.offerings) this.spawnPickup(o);
    // 게이트 복구
    if (this.gate) { this.gate.removeFromParent(); this.gate = null; this.buildGate(); }
  }
}
