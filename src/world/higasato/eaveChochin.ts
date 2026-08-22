import * as THREE from 'three';
import { makeLantern } from '@/light/chochin';
import type { HigasatoGround } from './ground';
import type { Hamlet, MinkaSpec } from './minka';

/**
 * 처마의 초칭 — **플레이어가 처음 빛을 얻는 자리** (각색 6 C안, PLAN-STORY P1-2)
 *
 * 각색 6 은 손전등 대신 초칭 하나로 간다. 다만 **처음부터 들고 시작하지는 않는다** —
 * 광원을 얻는 순간이 공짜로 굴러다니는데 안 쓰면 아깝고, 무엇보다
 * `Q`(빛 3단)를 가르칠 자리가 그때 생긴다.
 *
 * ## 왜 광장의 초칭 줄이 아니라 처마인가
 * 축제 초칭 줄(`village/matsuri.ts`)은 **광장**이라 한참 안쪽이고, 줄에서 하나를 빼면
 * 「축제 장식을 뜯었다」가 된다. 처마 등불은 다르다 —
 *   ① 마을 초입, 방송을 듣고 공고판을 읽은 **바로 그 자리**
 *   ② 손이 닿는 높이에 걸린 **남의 집 물건**이다. 그래서 「빌릴게요」가 성립한다
 *   ③ 폐허의 처마에 불이 켜져 있다는 것 자체가 ACT 4 의 생활 흔적과 같은 말을 한다
 *
 * ## 떼기 전과 든 뒤가 같은 물건이어야 한다
 * `makeLantern()` 을 `light/chochin.ts` 에서 그대로 가져온다. 다른 메시를 걸어 두면
 * 획득이 **교환**으로 읽힌다 — 처마의 그것을 든 게 아니라 다른 걸 받은 것처럼.
 *
 * 떼어낸 뒤에는 **고리만 남긴다.** 빈 고리가 보여야 「내가 가져갔다」가 자국으로 남는다.
 */
export class EaveChochin {
  readonly group = new THREE.Group();
  /** 조사 지점(월드) — 등불 바로 아래, 사람이 서는 자리 */
  readonly pos = new THREE.Vector3();
  private lantern: THREE.Group | null = null;
  private light: THREE.PointLight | null = null;
  private paperMats: THREE.MeshStandardMaterial[] = [];
  private taken = false;
  private t = 0;

  /** @param near 이 점에 가장 가까운 집을 고른다 (마을 초입 공고판 자리) */
  constructor(scene: THREE.Scene, ground: HigasatoGround, hamlet: Hamlet, near: THREE.Vector3) {
    /**
     * **상시 등불이 걸린 집 중에서** 고르고, 그 등불을 걷어 자리를 물려받는다.
     *
     * 처음엔 반대로 했다 — 등불 없는 집을 골랐더니 겹치지는 않는데 참배로에서 **13 m 옆**으로
     * 밀려났다(실측 x −10, 길은 x 0~3). 상시 등불은 마을에 다섯 개뿐이고 길가에 놓이므로,
     * 피하지 말고 **물려받는 게** 맞다:
     *   ① 반드시 지나치는 자리에 걸린다
     *   ② 떼면 그 집이 **정말로 어두워진다** — 「내가 가져갔다」가 자국으로 남는다
     */
    let host: MinkaSpec | null = null, bd = Infinity;
    for (const [h] of hamlet.lanternHosts) {
      if (h.floor === undefined) continue;
      const d = Math.hypot(h.x - near.x, h.z - near.z);
      if (d < bd) { bd = d; host = h; }
    }
    // 상시 등불이 하나도 없는 구성이면 툇마루 있는 집으로 폴백
    if (!host) {
      for (const h of hamlet.houses) {
        if (!h.engawa || h.floor === undefined) continue;
        const d = Math.hypot(h.x - near.x, h.z - near.z);
        if (d < bd) { bd = d; host = h; }
      }
    } else {
      hamlet.dropLantern(host);
    }

    const size = 0.34;
    // `makeLantern` 은 { paper: 등불 그룹, mat: 종이 재질 } 을 돌려준다.
    // **재질 인스턴스가 따로**여야 한다 — 미오가 든 초칭과 공유하면 획득 뒤에도
    // 여기 불꽃이 저기 밝기를 흔든다
    const { paper: lantern, mat } = makeLantern(size);
    this.lantern = lantern;
    this.paperMats.push(mat);

    if (host) {
      // 집 정면(+Z 로컬) 바깥으로 살짝. 처마 밑에 매달리므로 깊이 절반 + 내밀기만큼 앞이다
      const fx = Math.sin(host.yaw), fz = Math.cos(host.yaw);
      const out = host.d / 2 + (host.eave ?? 0.5) * 0.6;
      const gy = host.gy ?? ground.heightAt(host.x, host.z);
      // 높이 1.95 m — 열여섯이 팔을 뻗어 고리를 벗길 수 있는 선.
      // minka 의 상시 처마 등불(2.25 m)보다 낮게 둔다. 손이 안 닿는 물건은 「든다」가 아니라 「본다」다
      this.pos.set(host.x + fx * out, gy, host.z + fz * out);
      lantern.position.set(this.pos.x, gy + 1.95, this.pos.z);
      // 고리(못) — 떼어낸 뒤에도 남는다
      const peg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.11, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.85 }),
      );
      peg.rotation.z = Math.PI / 2;
      peg.position.set(this.pos.x, gy + 2.10, this.pos.z);
      this.group.add(peg);
    } else {
      // 집을 못 찾으면 공고판 옆에 세워 둔다 — 획득 자체가 막히는 것보다 낫다
      const gy = ground.heightAt(near.x, near.z);
      this.pos.set(near.x + 1.2, gy, near.z);
      lantern.position.set(this.pos.x, gy + 1.35, this.pos.z);
      console.warn('[eaveChochin] 툇마루 있는 집을 못 찾음 — 공고판 옆 폴백');
    }

    // 멀리서도 보이는 표식. 거리 6 m 는 골목 하나 — 이 등불이 마을 전체를 밝히면
    // 「내가 든 뒤로 어두워졌다」가 안 생긴다
    const l = new THREE.PointLight(0xffb063, 1.35, 6.5, 2);
    l.castShadow = false;
    l.position.copy(lantern.position).add(new THREE.Vector3(0, -0.02, 0));
    this.light = l;

    this.group.add(lantern, l);
    this.group.name = 'eave-chochin';
    scene.add(this.group);
  }

  get available() { return !this.taken; }

  /** 떼어낸다 — 등불과 빛이 사라지고 고리만 남는다 */
  take() {
    if (this.taken) return;
    this.taken = true;
    if (this.lantern) { this.group.remove(this.lantern); this.lantern = null; }
    if (this.light) { this.group.remove(this.light); this.light.dispose(); this.light = null; }
    this.paperMats.length = 0;
  }

  update(dt: number) {
    if (this.taken || !this.light) return;
    this.t += dt;
    // 불꽃은 사인파가 아니다 — 두 주기를 곱해 규칙이 안 읽히게 (lifesigns 의 TV 와 같은 이유)
    const f = 0.84 + 0.16 * Math.sin(this.t * 5.3) * Math.sin(this.t * 2.7);
    this.light.intensity = 1.35 * f;
    for (const m of this.paperMats) m.emissiveIntensity = 1.6 * f;
  }
}
