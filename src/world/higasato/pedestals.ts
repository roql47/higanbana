import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import type { HigasatoGround } from './ground';
import { PartsBuilder } from './kit';

/**
 * 봉납 받침대 7 + 중앙 석판 — **마을 정 가운데**의 제단 (ACT 5, PLAN-STORY §2.3)
 *
 * 원래 신사 앞마당에 있었다. 그런데 공물 7개가 갈래길 5개의 **끝**에 흩어져 있어서,
 * 하나 주울 때마다 마을 북쪽 끝까지 왕복해야 했다 — 채집 게임이 아니라 심부름이 된다.
 * 제단을 마을 한복판(참배로 동편 7 m)으로 내리면 어느 길에서 돌아와도 거리가 절반이다.
 * **신사와 금줄 게이트(출구)는 그대로 둔다** — 지도의 양 끝은 이야기가 쓰는 자리다.
 *
 * 반원은 참배로 남쪽(플레이어가 오는 쪽)을 향해 열려 있다.
 * 받침대는 번호 순(서→동)으로 채워지고, 일곱 번째는 끝까지 빈다 — 그 공백이 복선이다.
 * 석판 조사가 메인 퀘스트 「7개의 공물을 찾아라」의 개시 지점.
 */
export class Pedestals {
  readonly group = new THREE.Group();
  /** 석판 조사 지점(월드) */
  readonly slabPos: THREE.Vector3;
  /** 받침대 상판 위치 7개 (서→동) */
  readonly slots: THREE.Vector3[] = [];
  /** 받침대 표식 7개 — **미리 만들어 두고 켜고 끄기만 한다** (아래 ⚠️ 참조) */
  private marks: THREE.Mesh[] = [];
  private markMats: THREE.MeshStandardMaterial[] = [];
  /** 제단 전체를 밝히는 광원 하나. 봉납이 쌓일수록 밝아진다 */
  private altarLight: THREE.PointLight;
  private lit = 0;
  private t = 0;

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround, center: THREE.Vector3) {
    const C = center.clone();
    const b = new PartsBuilder(physics);
    const mStone = b.mat(0x5a5f57, 1.0);
    const mBase = b.mat(0x42463f, 1.0);

    const R = 3.6;
    for (let i = 0; i < 7; i++) {
      // 서쪽(π)에서 동쪽(0)으로 반원 — 배전을 등지고 참배로를 향해 열린다
      const a = Math.PI - (Math.PI * i) / 6;
      const x = C.x + Math.cos(a) * R;
      const z = C.z - Math.sin(a) * R * 0.72; // 남북으로 살짝 눌러 배전 앞이 답답하지 않게
      const y = ground.heightAt(x, z);
      b.cyl(0.3, 0.36, 0.62, x, y + 0.31, z, mStone);
      b.box(0.56, 0.07, 0.56, x, y + 0.66, z, mBase);
      b.collide(x, y + 0.35, z, 0.3, 0.35, 0.3);
      this.slots.push(new THREE.Vector3(x, y + 0.72, z));
    }

    // 중앙 석판 — 낮게 기운 서판
    const sy = ground.heightAt(C.x, C.z);
    b.box(1.0, 0.18, 0.7, C.x, sy + 0.09, C.z, mBase);
    const top = new THREE.BoxGeometry(0.86, 0.07, 0.56);
    top.rotateX(-0.28);
    top.translate(C.x, sy + 0.26, C.z);
    b.add(top, mStone);
    b.collide(C.x, sy + 0.15, C.z, 0.5, 0.15, 0.35);
    this.slabPos = new THREE.Vector3(C.x, sy, C.z);

    this.group.add(b.build('pedestals'));

    /**
     * ⚠️ **런타임에 라이트를 씬에 넣으면 안 된다.**
     * 예전엔 봉납할 때마다 받침대 옆에 `PointLight` 를 하나씩 새로 만들어 붙였다. 그런데 라이트 개수가
     * 바뀌면 `NUM_POINT_LIGHTS` 가 달라져 **씬의 재질 185 개가 전부 셰이더 재컴파일**된다 —
     * 실측 한 프레임 **8561 ms**(평소 3.2 ms). 공물이 7개라 그게 일곱 번 났다.
     * `game/rules.ts` 도 `story/pursuers.ts` 도 이미 같은 이유로 "라이트는 미리 전부 만들어 상주시킨다" 였는데
     * 여기만 규칙을 어기고 있었다.
     *
     * 고치면서 **halo 7개 → 제단 광원 1개**로 줄였다. 사거리 2.2 m 짜리 halo 는 어차피 받침대 밖을
     * 못 비춰서 "멀리서 세는" 역할을 못 했다. 그 역할은 발광 표식(아래)이 블룸을 타고 대신하고,
     * 빛은 **제단 전체가 밝아지는 것**으로 통합한다 — 봉납이 쌓일수록 한복판이 환해지는 게 더 나은 연출이다.
     */
    this.altarLight = new THREE.PointLight(0xffb27a, 0.001, 9, 2);
    this.altarLight.castShadow = false;
    this.altarLight.position.set(C.x, sy + 1.6, C.z);
    this.group.add(this.altarLight);

    // 표식도 미리 7개 만들어 둔다 — 재질을 런타임에 새로 만들면 그것도 프로그램 컴파일이다(라이트만큼은 아니지만)
    const markGeo = new THREE.IcosahedronGeometry(0.055, 1);
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 1.1, roughness: 0.5 });
      const m = new THREE.Mesh(markGeo, mat);
      m.position.copy(this.slots[i]!).add(new THREE.Vector3(0, 0.22, 0));
      m.visible = false;
      this.marks.push(m);
      this.markMats.push(mat);
      this.group.add(m);
    }

    scene.add(this.group);
  }

  /**
   * i 번째 받침대에 공물이 놓인다 (0-기준, 서→동).
   * @param model 있으면 실물을, 없으면 자리표시자(발광 구슬)를 올린다
   */
  place(i: number, color: number, model?: THREE.Object3D | null) {
    const s = this.slots[i];
    if (!s) return;
    // 표식 — 몇 개를 바쳤는지 멀리서 세는 건 이쪽 몫이다. 발광이라 블룸을 타고 안개 너머로도 보인다
    const mk = this.marks[i], mat = this.markMats[i];
    if (mk && mat) {
      mat.color.setHex(color);
      mat.emissive.setHex(color);
      // 실물이 올라가면 표식은 그 위에 작게, 자리표시자면 표식 자체가 공물 노릇을 한다
      mk.scale.setScalar(model ? 1 : 2);
      mk.position.copy(s).add(new THREE.Vector3(0, model ? 0.22 : 0.1, 0));
      mk.visible = true;
    }
    if (model) {
      model.position.copy(s).add(new THREE.Vector3(0, 0.02, 0));
      model.name = 'offered';
      model.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
      this.group.add(model);  // clone(true) 은 재질을 공유하므로 새 프로그램이 안 생긴다
    }
    // 제단이 밝아진다 — 라이트를 **추가하는 게 아니라 상주 광원의 강도만** 올린다
    this.lit = Math.min(7, this.lit + 1);
    this.altarLight.intensity = 0.001 + this.lit * 0.42;
  }

  /** 리셋 — 놓인 공물 제거. **라이트와 표식은 상주시킨 것이므로 지우지 않고 끈다** */
  clear() {
    for (const c of [...this.group.children]) {
      if (c.name === 'offered') c.removeFromParent();
    }
    for (const m of this.marks) m.visible = false;
    this.lit = 0;
    this.altarLight.intensity = 0.001;
  }

  update(dt: number) {
    this.t += dt;
    if (this.lit === 0) return;
    const e = 1.0 + 0.25 * Math.sin(this.t * 2.7);
    for (let i = 0; i < this.lit; i++) this.markMats[i]!.emissiveIntensity = e;
    // 제단 광원도 같이 숨쉰다 — 봉납이 쌓일수록 진폭이 커진다
    this.altarLight.intensity = 0.001 + this.lit * 0.42 * (0.94 + 0.06 * Math.sin(this.t * 2.7));
  }
}
