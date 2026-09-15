import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import { Props } from '@/world/props';
import type { HigasatoGround } from './ground';
import { PartsBuilder } from './kit';
import { makeHiganbanaFlower } from '@/world/village/higanbana';

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
  /** 일곱째 받침대만 물건 자국 대신 작은 맨발 자국이 남는다. */
  private humanFootprints = new THREE.Group();
  /** 제단 전체를 밝히는 광원 하나. 봉납이 쌓일수록 밝아진다 */
  private altarLight: THREE.PointLight;
  /** 봉납할 때마다 돌 틈에서 순차적으로 솟는 피안화 6송이 × 7단계. */
  private sprouts: THREE.InstancedMesh;
  /** ACT 11부터 이미 놓은 세 공물을 돌과 한 덩어리로 붙드는 검은 뿌리. */
  private lockRoots: THREE.Mesh;
  private sproutData: { x: number; y: number; z: number; yaw: number; scale: number; stage: number; delay: number }[] = [];
  private sproutStarted = Array<number>(8).fill(Number.POSITIVE_INFINITY);
  private sproutDummy = new THREE.Object3D();
  private lit = 0;
  private t = 0;
  private placed = Array.from({ length: 7 }, () => false);
  private relocated = false;

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

    const proc = b.build('pedestals');
    this.group.add(proc);

    // 상판에 거의 스며든 맨발 두 짝. 가까이 오기 전에는 젖은 돌 얼룩처럼 보인다.
    const footMat = new THREE.MeshStandardMaterial({
      color: 0x171814, transparent: true, opacity: 0.48, roughness: 1,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (const side of [-1, 1]) {
      for (const [z, rx, rz] of [[-0.055, 0.064, 0.105], [0.075, 0.052, 0.062]] as const) {
        const geo = new THREE.CircleGeometry(1, 14);
        geo.scale(rx, rz, 1);
        geo.rotateX(-Math.PI / 2);
        const part = new THREE.Mesh(geo, footMat);
        part.position.set(side * 0.13, 0, z);
        part.rotation.y = side * 0.06;
        this.humanFootprints.add(part);
      }
    }
    const humanSlot = this.slots[6]!;
    this.humanFootprints.position.copy(humanSlot).add(new THREE.Vector3(0, 0.006, 0));
    this.humanFootprints.rotation.y = Math.atan2(C.x - humanSlot.x, C.z - humanSlot.z);
    this.group.add(this.humanFootprints);

    /**
     * 풍화 받침대·석판 (Tripo `prop-pedestal`/`prop-slab`) — 도착하면 박스들을 통째로 감춘다.
     * 콜라이더·표식·제단 광원은 그대로. 슬롯 높이만 **실제 모델 상판**에서 다시 잰다 —
     * 공물이 뜨거나 파묻히면 안 된다 (게다 30 cm 사건과 같은 계열의 함정).
     */
    void Promise.all([
      Props.loadNormalized('/models/props/pedestal.glb', 0.695, 0.45),
      Props.loadNormalized('/models/props/slab.glb', 1, 0.45),
    ]).then(([ped, slabM]) => {
      // 받침대가 높이 기준 정규화로 지나치게 퍼졌으면 반원 간격(약 1.8 m)을 침범한다 — 발자국을 자른다
      const pb = new THREE.Box3().setFromObject(ped);
      const ps = pb.getSize(new THREE.Vector3());
      const clamp = Math.min(1, 0.64 / Math.max(ps.x, ps.z));
      const topH = 0.695 * clamp;
      this.slots.forEach((s, i) => {
        const m = ped.clone(true);
        // 일곱 번째(동쪽 끝)만 넓고 낮다 — 「자리가 넓다. 사람 하나 설 만큼.」 (스토리보드 v2 ACT 5,
        // 공물 7 = 사람 복선 · 엔딩 B 에서 미오가 서는 곳). 여섯과 같은 돌인데 쓰임이 다르게 깎였다
        const wide = i === 6;
        if (wide) m.scale.set(clamp * 1.65, clamp * 0.55, clamp * 1.65);
        else m.scale.setScalar(clamp);
        m.position.set(s.x, s.y - 0.72 - 0.02, s.z);   // 슬롯은 상판 위 2.5 cm — 바닥 원점으로 환산, 2 cm 묻기
        m.rotation.y = i * 2.399;                       // 황금각 — 일곱이 같은 얼굴이 아니게
        this.group.add(m);
        s.y = s.y - 0.72 + topH * (wide ? 0.55 : 1) + 0.025;  // 실제 상판 기준으로 재산정
        const mk = this.marks[i];
        if (mk) mk.position.copy(s).add(new THREE.Vector3(0, 0.22, 0));
        if (wide) this.humanFootprints.position.copy(s).add(new THREE.Vector3(0, 0.006, 0));
      });

      // 석판 — 가장 얇은 축을 세로로 눕히고, 발자국(가로 최장변)을 절차판(1.0 m)에 맞춘다.
      // 높이 기준 정규화를 그대로 믿으면 "누운 판"은 길이가 30 cm 가 된다
      let sb = new THREE.Box3().setFromObject(slabM);
      let ss = sb.getSize(new THREE.Vector3());
      if (ss.y >= ss.x || ss.y >= ss.z) {
        slabM.rotation.x = -Math.PI / 2;                // 세워 만든 판 → 눕힌다
        slabM.updateMatrixWorld(true);
        sb = new THREE.Box3().setFromObject(slabM);
        ss = sb.getSize(new THREE.Vector3());
      }
      if (ss.z > ss.x) { slabM.rotation.y = Math.PI / 2; slabM.updateMatrixWorld(true); sb = new THREE.Box3().setFromObject(slabM); ss = sb.getSize(new THREE.Vector3()); }
      const sScale = 1.06 / Math.max(ss.x, ss.z);
      slabM.scale.multiplyScalar(sScale);
      slabM.updateMatrixWorld(true);
      sb = new THREE.Box3().setFromObject(slabM);
      // 파인 면(테두리 안쪽)이 위를 봐야 한다 — 한가운데를 위에서 쏘아 보면 안다:
      // 위가 파여 있으면 명중점이 윗면보다 한참 아래다. 아니면 뒤집는다
      const down = new THREE.Raycaster(new THREE.Vector3((sb.min.x + sb.max.x) / 2, sb.max.y + 0.5, (sb.min.z + sb.max.z) / 2), new THREE.Vector3(0, -1, 0), 0, 2);
      const hd = down.intersectObject(slabM, true)[0];
      if (hd && sb.max.y - hd.point.y < (sb.max.y - sb.min.y) * 0.25) {
        slabM.rotateX(Math.PI);
        slabM.updateMatrixWorld(true);
        sb = new THREE.Box3().setFromObject(slabM);
      }
      slabM.position.y += -sb.min.y - 0.02;             // 바닥 맞추고 2 cm 묻기
      slabM.rotation.x += -0.1;                         // 남쪽(플레이어가 오는 쪽)으로 살짝 기운 서판
      const holder = new THREE.Group();
      holder.add(slabM);
      holder.position.copy(this.slabPos);
      this.group.add(holder);
      proc.visible = false;
    }).catch((e) => console.warn('[pedestals] 모델 로드 실패 — 절차적 받침대 유지:', e));

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

    // 첫 봉납 한 번으로 끝내지 않고, 이후 공양도 같은 문법으로 마을 중심을 잠식한다.
    // 꽃 하나는 시그니처 피안화 메시를 인스턴싱하므로 42송이가 늘어도 드로우콜은 하나다.
    const sproutMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      emissive: new THREE.Color(0xff2638),
      emissiveIntensity: 0.78,
      roughness: 0.66,
      side: THREE.DoubleSide,
    });
    for (let stage = 1; stage <= 7; stage++) {
      const slot = this.slots[stage - 1]!;
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3 + stage * 1.37;
        const radius = 0.47 + ((j + stage) % 3) * 0.13;
        const x = slot.x + Math.cos(a) * radius;
        const z = slot.z + Math.sin(a) * radius;
        this.sproutData.push({
          x, y: ground.heightAt(x, z) - 0.025, z,
          yaw: a * 2.17,
          scale: 0.72 + ((j * 7 + stage * 3) % 5) * 0.07,
          stage,
          delay: j * 0.09,
        });
      }
    }
    this.sprouts = new THREE.InstancedMesh(makeHiganbanaFlower(), sproutMat, this.sproutData.length);
    this.sprouts.name = 'offering-higanbana-sprouts';
    this.sprouts.castShadow = false;
    this.sprouts.receiveShadow = true;
    this.sprouts.frustumCulled = false;
    this.sprouts.visible = false;
    this.group.add(this.sprouts);
    this.updateSprouts();

    const rootGeos: THREE.BufferGeometry[] = [];
    for (let slotI = 0; slotI < 3; slotI++) {
      const slot = this.slots[slotI]!;
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3 + slotI * 0.71;
        const start = new THREE.Vector3(slot.x + Math.cos(a) * 0.72, ground.heightAt(slot.x + Math.cos(a) * 0.72, slot.z + Math.sin(a) * 0.72) + 0.01, slot.z + Math.sin(a) * 0.72);
        const end = slot.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, 0.15 + (j % 2) * 0.08, Math.sin(a) * 0.12));
        const mid = start.clone().lerp(end, 0.55).add(new THREE.Vector3(Math.sin(a) * 0.08, 0.08, -Math.cos(a) * 0.08));
        rootGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, mid, end]), 7, 0.014 + (j % 3) * 0.004, 5, false));
      }
    }
    this.lockRoots = new THREE.Mesh(
      mergeGeometries(rootGeos, false)!,
      new THREE.MeshStandardMaterial({ color: 0x070608, roughness: 0.9, metalness: 0.08 }),
    );
    this.lockRoots.name = 'offering-lock-roots';
    this.lockRoots.visible = false;
    this.group.add(this.lockRoots);

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
      mk.visible = !this.relocated;
    }
    if (model) {
      // 저장 복원은 자리표시자를 먼저 놓고 모델 로드 뒤 같은 슬롯을 갱신한다.
      // 그때 광원·새싹 수가 두 번 증가하지 않도록 기존 슬롯 실물만 교체한다.
      for (const c of [...this.group.children]) {
        if (c.name === 'offered' && c.userData['offeringSlot'] === i) c.removeFromParent();
      }
      model.position.copy(s).add(new THREE.Vector3(0, 0.02, 0));
      model.name = 'offered';
      model.userData['offeringSlot'] = i;
      model.visible = !this.relocated;
      model.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
      this.group.add(model);  // clone(true) 은 재질을 공유하므로 새 프로그램이 안 생긴다
    }
    // 제단이 밝아진다 — 라이트를 **추가하는 게 아니라 상주 광원의 강도만** 올린다
    if (!this.placed[i]) {
      this.placed[i] = true;
      this.lit = Math.min(7, this.lit + 1);
      this.sproutStarted[this.lit] = this.t;
    }
    this.altarLight.intensity = 0.001 + this.lit * 0.42;
  }

  /** 리셋 — 놓인 공물 제거. **라이트와 표식은 상주시킨 것이므로 지우지 않고 끈다** */
  clear() {
    this.relocated = false;
    for (const c of [...this.group.children]) {
      if (c.name === 'offered') c.removeFromParent();
    }
    for (const m of this.marks) m.visible = false;
    this.lit = 0;
    this.placed.fill(false);
    this.sproutStarted.fill(Number.POSITIVE_INFINITY);
    this.updateSprouts();
    this.lockRoots.visible = false;
    this.altarLight.intensity = 0.001;
  }

  setRootsLocked(locked: boolean) { this.lockRoots.visible = locked; }

  /** Keep logical offerings intact while their physical objects travel to the crypt. */
  setRelocated(relocated: boolean) {
    this.relocated = relocated;
    for (let i = 0; i < this.marks.length; i++) this.marks[i]!.visible = !relocated && this.placed[i]!;
    for (const child of this.group.children) if (child.name === 'offered') child.visible = !relocated;
  }

  update(dt: number) {
    this.t += dt;
    this.updateSprouts();
    if (this.lit === 0) return;
    const e = 1.0 + 0.25 * Math.sin(this.t * 2.7);
    for (let i = 0; i < this.lit; i++) this.markMats[i]!.emissiveIntensity = e;
    // 제단 광원도 같이 숨쉰다 — 봉납이 쌓일수록 진폭이 커진다
    this.altarLight.intensity = 0.001 + this.lit * 0.42 * (0.94 + 0.06 * Math.sin(this.t * 2.7));
  }

  private updateSprouts() {
    // 아직 봉납이 없을 때는 땅속으로 0.001만 축소한 42송이를 GPU에 보낼 이유가 없다.
    // 첫 봉납부터 같은 성장 행렬을 그대로 사용하므로 화면 결과는 바뀌지 않는다.
    this.sprouts.visible = this.lit > 0;
    if (!this.sprouts.visible) return;
    for (let i = 0; i < this.sproutData.length; i++) {
      const s = this.sproutData[i]!;
      const elapsed = this.t - this.sproutStarted[s.stage]! - s.delay;
      const u = Number.isFinite(elapsed) ? THREE.MathUtils.clamp(elapsed / 1.15, 0, 1) : 0;
      const grow = u * u * (3 - 2 * u);
      this.sproutDummy.position.set(s.x, s.y, s.z);
      this.sproutDummy.rotation.set(0, s.yaw, 0);
      // 땅을 뚫고 올라오는 동안 세로축이 먼저 자라고, 마지막 20%에 꽃잎이 펼쳐진다.
      const crown = 0.2 + grow * 0.8;
      this.sproutDummy.scale.set(s.scale * crown, Math.max(0.001, s.scale * grow), s.scale * crown);
      this.sproutDummy.updateMatrix();
      this.sprouts.setMatrixAt(i, this.sproutDummy.matrix);
    }
    this.sprouts.instanceMatrix.needsUpdate = true;
  }

  /** 로딩 프리워밍 동안만 숨은 재질을 컴파일한다. 종료 시 실제 봉납 상태로 되돌린다. */
  setHiddenEffectPrewarm(on: boolean) {
    this.sprouts.visible = on || this.lit > 0;
  }
}
