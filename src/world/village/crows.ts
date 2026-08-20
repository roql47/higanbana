import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Props } from '@/world/props';
import { toFloatGeometry } from '@/core/geom';
import type { Perch } from './trees';
import type { Sfx } from '@/audio/sfx';

/**
 * 삼나무에 앉아 있다가 다가가면 날아오르는 까마귀(烏).
 *
 * 공포 연출로서 값이 싼 장치다 — 플레이어가 **자기 발로** 방아쇠를 당기고, 놀란 뒤에는
 * "내가 건드린 것"임을 안다. 요괴가 아니라는 안도와 "무언가 있었다"는 잔상이 같이 남는다.
 *
 * ## 모델: Tripo 두 벌 + 어깨에서 자르기
 *
 * Tripo(text-to-model) 로 **앉은 자세**와 **날개 편 자세**를 따로 뽑았다. 왜 두 벌인가:
 *  · 접힌 날개는 못 편다 — 날개가 몸통에 붙어 조각돼 있어서 뼈를 돌려도 막대가 될 뿐이다
 *  · rig-check 는 `rig_type: avian` 을 추천하지만 **rig v1.0 은 조류 토폴로지를 거부한다**
 *    (1004 Unsupported topology). `--rig-model v2.5-20260210` 이어야 통과한다
 *  · 통과해도 자동 리그가 **좌우 비대칭**으로 나왔다 — 왼쪽 체인이 날개끝에서 몸통 쪽으로
 *    역방향이라(bone_1 → … → Spine_0) 왼쪽을 돌리면 몸이 돌아간다. 대칭 퍼덕임이 불가능
 *  · `preset:fly` 같은 조류 프리셋 클립도 없다 (프리셋은 사람용뿐)
 *
 * 그래서 **스킨을 버리고 지오메트리만 쓴다.** 날개 편 모델을 어깨 평면에서 좌/우/몸통으로
 * 잘라 세 조각으로 만들고, 날개 조각을 어깨 축으로 돌려 퍼덕인다. 덤으로 스킨드가 아니게 되어
 * **InstancedMesh 4장(앉음·몸통·좌날개·우날개) = 드로우콜 4개**로 돌아온다.
 *
 * 그림자는 만들지 않는다(삼나무와 같은 이유 — 초칭 큐브 그림자에 쓸 값이 없다).
 * **한 마리가 날면 옆 나무도 같이 난다.** 실제로도 그렇고, 한 마리만 날면 놀랍지가 않다.
 */

type State = 'perch' | 'takeoff' | 'fly' | 'gone';

interface Crow {
  state: State;
  perch: number;              // perches 인덱스 (-1 = 없음)
  pos: THREE.Vector3;
  yaw: number; pitch: number; roll: number;
  t: number;                  // 상태 경과
  phase: number;              // 개체별 위상 (숨쉬기·흔들림이 겹치지 않게)
  flap: number;               // 날갯짓 위상
  speed: number;
  climb: number;
  turn: number;               // 선회 각속도 (뱅크각의 근거)
  twitchT: number;            // 다음 고갯짓까지
  twitch: number;             // 현재 고갯짓 오프셋
  restless: number;           // 0..1 — 가까울수록 안절부절
  pending: number;            // >0 이면 그만큼 뒤에 날아오른다 (연쇄 이륙 지연)
  wait: number;               // gone 상태에서 다시 앉기까지
}

export interface CrowOptions {
  /** 마리 수 (앉을 자리가 모자라면 자동으로 줄인다) */
  count?: number;
  /** 이 거리 안이면 안절부절 못한다(경고 단계) */
  alertRadius?: number;
  /** 이 거리 안이면 날아오른다 */
  fleeRadius?: number;
}

/** 까마귀 전장(부리~꼬리). 실제 큰부리까마귀가 50 cm 안팎이다 */
const LEN = 0.50;
/**
 * 어깨 절단면 — 몸통 중심에서 이만큼 바깥(로컬 ±X)을 날개로 뗀다.
 * 주의: 정규화에서 `rotateY(-π/2)` 로 Tripo 의 +X(앞)를 +Z 로 돌리므로,
 * 그 뒤 **좌우 축은 Z 가 아니라 X 다**. 여기서 축을 틀리면 한쪽 날개가 10 삼각형만 잘려 나온다.
 */
const SHOULDER = 0.052;
/** 접은 날개 자세(라디안). 편 모델을 접는 것이므로 크게 젖혀야 한다 */
const FOLD_FLAP = -0.30, FOLD_SWEEP = 1.30;

export class Crows {
  private crows: Crow[] = [];
  private perches: Perch[];
  private used = new Set<number>();
  private want = 22;
  private alertR: number;
  private fleeR: number;
  private cawCd = 0;
  private burst = 0;
  private burstDist = 0;
  private rng: () => number;
  /** 앉은 개체 / 나는 개체의 몸통·좌우 날개 */
  private mPerch!: THREE.InstancedMesh;
  private mBody!: THREE.InstancedMesh;
  private mWingL!: THREE.InstancedMesh;
  private mWingR!: THREE.InstancedMesh;
  // 행렬 계산용 스크래치 (씬에 넣지 않는다 — matrixWorld 가 곧 local matrix 다)
  private root = new THREE.Object3D();
  private jointL = new THREE.Object3D();
  private jointR = new THREE.Object3D();
  private hidden = new THREE.Matrix4().makeTranslation(0, -800, 0);

  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, perches: Perch[], private sfx: Sfx, opts: CrowOptions = {}) {
    this.perches = perches;
    this.alertR = opts.alertRadius ?? 12;
    this.fleeR = opts.fleeRadius ?? 8.5;
    this.rng = seeded(4471);
    this.want = opts.count ?? 22;
    this.group.name = 'crows';
    scene.add(this.group);
  }

  /** 모델 로드 — 생성자 밖에서 await (지장·석등과 같은 방식) */
  async load(perchedUrl = '/models/props/crow-perched.glb', flyingUrl = '/models/props/crow-flying.glb') {
    const loader = Props.loader();
    const [pg, fg] = await Promise.all([loader.loadAsync(perchedUrl), loader.loadAsync(flyingUrl)]);
    // 두 모델의 정면 축이 다르다 — Tripo 는 포즈마다 방향이 제각각이라 모델별로 지정한다.
    //  · 앉은 모델: 정면이 이미 +Z (yaw 0), 길이는 Z 축
    //  · 나는 모델: 정면이 +X (yaw −90°), 길이는 날개폭이라 **날개폭 기준**으로 맞춘다.
    //    날개폭 : 몸길이 ≈ 1 : 0.45 이므로 몸이 앉은 모델과 같아지려면 날개폭을 LEN/0.45 로
    const perched = bake(pg.scene, LEN, 0, 'z');
    const flying = bake(fg.scene, LEN / 0.45, -Math.PI / 2, 'max');
    const parts = splitWings(flying.geo, SHOULDER);

    const n = Math.max(1, Math.min(this.want, Math.floor(this.perches.length / 2)));
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const im = new THREE.InstancedMesh(geo, mat, n);
      im.castShadow = false;
      im.receiveShadow = true;
      im.frustumCulled = false;   // 인스턴스가 맵 전역에 흩어져 있어 공통 바운딩이 의미 없다
      this.group.add(im);
      return im;
    };
    this.mPerch = mk(perched.geo, perched.mat);
    this.mBody = mk(parts.body, flying.mat);
    this.mWingL = mk(parts.wingL, flying.mat);
    this.mWingR = mk(parts.wingR, flying.mat);

    this.jointL.position.set(-SHOULDER, parts.shoulderY, 0);
    this.jointR.position.set(SHOULDER, parts.shoulderY, 0);
    this.root.add(this.jointL, this.jointR);

    for (let i = 0; i < n; i++) {
      const c: Crow = {
        state: 'perch', perch: -1, pos: new THREE.Vector3(),
        yaw: 0, pitch: 0, roll: 0, t: 0, phase: this.rng() * 6.28, flap: 0,
        speed: 0, climb: 0, turn: 0,
        twitchT: 0.5 + this.rng() * 2, twitch: 0, restless: 0, pending: -1, wait: 0,
      };
      this.crows.push(c);
      this.sit(c, null);
    }
    console.info(`[crows] ${n} 마리 · 앉을 자리 ${this.perches.length} · ${perched.tris + parts.tris} tri/마리`);
  }

  get count() { return this.crows.length; }

  /** 놀래키기 — 돌이 떨어졌거나 요괴가 지나갔을 때 밖에서 부를 수 있다 */
  startle(at: THREE.Vector3, radius = 9) {
    for (const c of this.crows) {
      if (c.state !== 'perch' || c.pending >= 0) continue;
      const p = this.perches[c.perch]!;
      if ((p.x - at.x) ** 2 + (p.z - at.z) ** 2 < radius * radius) this.flush(c, this.rng() * 0.18);
    }
  }

  update(dt: number, player: THREE.Vector3) {
    if (!this.mPerch) return;
    this.cawCd -= dt;
    for (const c of this.crows) this.step(c, dt, player);

    // 이번 프레임에 시작된 이륙들을 소리 한 번으로 묶는다 (연쇄를 개별 재생하면 뭉개진다)
    if (this.burst > 0 && this.cawCd <= 0) {
      this.sfx.crowFlush(this.burstDist, this.burst);
      this.cawCd = 0.5;
    }
    this.burst = 0;

    this.write();
  }

  // ---------------------------------------------------------------- 개체

  private step(c: Crow, dt: number, player: THREE.Vector3) {
    c.t += dt;
    if (c.pending >= 0) {
      c.pending -= dt;
      if (c.pending <= 0) { c.pending = -1; this.takeoff(c, player); }
    }

    switch (c.state) {
      case 'perch': {
        const p = this.perches[c.perch]!;
        const d = Math.hypot(p.x - player.x, p.z - player.z);
        const target = 1 - THREE.MathUtils.clamp((d - this.fleeR) / (this.alertR - this.fleeR), 0, 1);
        c.restless += (target - c.restless) * Math.min(1, dt * 3);

        // 고갯짓 — 가까울수록 잦고 크다. 이 "안절부절"이 날아오르기 전의 경고다
        c.twitchT -= dt * (1 + c.restless * 2.2);
        if (c.twitchT <= 0) {
          c.twitchT = 0.55 + this.rng() * 2.1;
          c.twitch = (this.rng() - 0.5) * (0.8 + c.restless * 1.4);
        }
        c.twitch *= Math.exp(-dt * 4.5);

        const bob = Math.sin(c.t * 1.9 + c.phase) * 0.006 + c.restless * Math.sin(c.t * 11 + c.phase) * 0.012;
        c.pos.set(p.x, p.y + bob, p.z);
        c.yaw = p.yaw + c.twitch;
        c.pitch = -0.06 - c.restless * 0.12;   // 긴장하면 몸을 앞으로 기울인다
        c.roll = 0;
        c.flap = 0;
        if (d < this.fleeR && c.pending < 0) this.flush(c, 0, player);
        break;
      }
      case 'takeoff': {
        const T = 0.42, u = THREE.MathUtils.clamp(c.t / T, 0, 1);
        const p = this.perches[c.perch]!;
        // 살짝 웅크렸다가 튀어오른다
        const lift = u < 0.18 ? -0.035 * (u / 0.18) : 1.35 * ease(( u - 0.18) / 0.82);
        c.pos.set(
          p.x + Math.sin(c.yaw) * u * u * 1.1,
          p.y + lift,
          p.z + Math.cos(c.yaw) * u * u * 1.1,
        );
        c.pitch = -0.55 * (1 - u) - 0.12;
        c.flap += dt * 11 * Math.PI * 2;
        if (u >= 1) { c.state = 'fly'; c.t = 0; c.speed = 5.6; c.climb = 2.4; }
        break;
      }
      case 'fly': {
        c.speed = Math.min(9.2, c.speed + dt * 3.2);
        c.climb = Math.max(-0.35, c.climb - dt * 1.35);
        c.yaw += c.turn * dt;
        c.turn *= Math.exp(-dt * 0.5);
        c.pos.x += Math.sin(c.yaw) * c.speed * dt;
        c.pos.z += Math.cos(c.yaw) * c.speed * dt;
        c.pos.y += c.climb * dt;
        // 날갯짓은 일정하지 않다 — 몇 번 치고 활공한다
        const amp = 0.42 + 0.58 * Math.max(0, Math.sin(c.t * 0.85 + c.phase));
        c.flap += dt * (4.2 + amp * 3.4) * Math.PI * 2;
        c.roll = THREE.MathUtils.clamp(-c.turn * 1.7, -0.8, 0.8);
        c.pitch = Math.atan2(c.climb, c.speed) * 0.7;
        if (c.t > 8 + this.rng() * 4 || c.pos.y > 34) {
          c.state = 'gone';
          c.wait = 9 + this.rng() * 18;
          this.used.delete(c.perch);
          c.perch = -1;
        }
        break;
      }
      case 'gone': {
        c.wait -= dt;
        if (c.wait <= 0) this.sit(c, player);
        break;
      }
    }
  }

  /** 한 마리가 날면 옆에 있던 것들도 조금씩 늦게 따라 난다 */
  private flush(c: Crow, delay: number, player?: THREE.Vector3) {
    if (c.state !== 'perch' || c.pending >= 0) return;
    if (delay > 0) { c.pending = delay; return; }
    this.takeoff(c, player);
    const p = this.perches[c.perch]!;
    for (const o of this.crows) {
      if (o === c || o.state !== 'perch' || o.pending >= 0) continue;
      const q = this.perches[o.perch]!;
      const d2 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d2 < 90) o.pending = 0.04 + this.rng() * 0.28;
    }
  }

  private takeoff(c: Crow, player?: THREE.Vector3) {
    if (c.perch < 0) return;
    const p = this.perches[c.perch]!;
    // 플레이어 반대쪽으로, 다만 제각각 흩어지게 ±55°
    let away = p.yaw;
    if (player) away = Math.atan2(p.x - player.x, p.z - player.z);
    c.yaw = away + (this.rng() - 0.5) * 1.9;
    c.turn = (this.rng() - 0.5) * 0.7;
    c.state = 'takeoff';
    c.t = 0;
    c.roll = 0;
    this.burst++;
    if (player) {
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      this.burstDist = this.burst === 1 ? d : Math.min(this.burstDist, d);
    } else if (this.burst === 1) {
      this.burstDist = 12;
    }
  }

  /** 빈 가지에 앉힌다. 플레이어 근처는 피한다 — 눈앞에서 나타나면 안 된다 */
  private sit(c: Crow, player: THREE.Vector3 | null) {
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(this.rng() * this.perches.length);
      if (this.used.has(i)) continue;
      const p = this.perches[i]!;
      if (player && Math.hypot(p.x - player.x, p.z - player.z) < 32) continue;
      this.used.add(i);
      c.perch = i;
      c.state = 'perch';
      c.t = this.rng() * 4;
      c.twitchT = 0.4 + this.rng() * 2;
      c.restless = 0;
      c.pos.set(p.x, p.y, p.z);
      c.yaw = p.yaw;
      return;
    }
    c.wait = 4 + this.rng() * 6;   // 자리가 없으면 조금 뒤에 다시 시도
  }

  // ---------------------------------------------------------------- 행렬

  private write() {
    const root = this.root, jl = this.jointL, jr = this.jointR;
    for (let i = 0; i < this.crows.length; i++) {
      const c = this.crows[i]!;
      if (c.state === 'gone') {
        this.mPerch.setMatrixAt(i, this.hidden);
        this.mBody.setMatrixAt(i, this.hidden);
        this.mWingL.setMatrixAt(i, this.hidden);
        this.mWingR.setMatrixAt(i, this.hidden);
        continue;
      }
      root.position.copy(c.pos);
      root.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
      root.updateMatrixWorld(true);

      // 앉은 자세는 **별도 모델**이다. 이륙 0.12 s 지점에서 바꿔치기 하는데,
      // 그 순간은 몸이 튀어오르고 날개가 벌어지는 중이라 전환이 안 보인다
      const flying = c.state !== 'perch' && !(c.state === 'takeoff' && c.t < 0.12);
      if (!flying) {
        this.mPerch.setMatrixAt(i, root.matrixWorld);
        this.mBody.setMatrixAt(i, this.hidden);
        this.mWingL.setMatrixAt(i, this.hidden);
        this.mWingR.setMatrixAt(i, this.hidden);
        continue;
      }
      this.mPerch.setMatrixAt(i, this.hidden);

      // 날개: 이륙 직후엔 접힘에서 풀리고, 비행 중엔 활공을 섞어 퍼덕인다
      const open = c.state === 'takeoff' ? THREE.MathUtils.clamp((c.t - 0.12) / 0.22, 0, 1) : 1;
      const amp = c.state === 'fly' ? 0.42 + 0.58 * Math.max(0, Math.sin(c.t * 0.85 + c.phase)) : 1;
      const beat = Math.sin(c.flap) * 0.95 * amp;
      const flap = THREE.MathUtils.lerp(FOLD_FLAP, beat, open);
      const sweep = THREE.MathUtils.lerp(FOLD_SWEEP, 0.12 - Math.max(0, beat) * 0.18, open);
      jr.rotation.set(0, sweep, flap);
      jl.rotation.set(0, -sweep, -flap);
      root.updateMatrixWorld(true);
      this.mBody.setMatrixAt(i, root.matrixWorld);
      this.mWingL.setMatrixAt(i, jl.matrixWorld);
      this.mWingR.setMatrixAt(i, jr.matrixWorld);
    }
    for (const m of [this.mPerch, this.mBody, this.mWingL, this.mWingR]) m.instanceMatrix.needsUpdate = true;
  }
}

const ease = (u: number) => 1 - (1 - THREE.MathUtils.clamp(u, 0, 1)) ** 2;

/**
 * Tripo GLB → 정적 지오메트리 한 덩이.
 * 스킨은 버린다(위 주석 참조 — 자동 리그가 대칭 퍼덕임에 못 쓴다). 바인드 포즈 = 만들어진 포즈라
 * 스킨 어트리뷰트만 떼면 그대로 쓸 수 있다.
 * 정규화: 전장 `targetLen`, 원점은 발밑·좌우 중앙, 정면은 Tripo +X → +Z.
 */
function bake(src: THREE.Object3D, targetLen: number, yaw: number, mode: 'z' | 'max') {
  src.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  let mat: THREE.Material = new THREE.MeshStandardMaterial();
  src.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = toFloatGeometry(m.geometry, m.matrixWorld);
    for (const k of ['skinIndex', 'skinWeight', 'color', 'tangent']) g.deleteAttribute(k);
    geos.push(g);
    mat = Array.isArray(m.material) ? m.material[0]! : m.material;
  });
  const geo = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false)!;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const ref = mode === 'z' ? size.z : Math.max(size.x, size.z);
  const s = targetLen / Math.max(1e-4, ref);
  geo.scale(s, s, s);
  if (yaw) geo.rotateY(yaw);
  geo.computeBoundingBox();
  const b2 = geo.boundingBox!;
  geo.translate(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.metalness = Math.min(mat.metalness, 0.15);   // 근접 조명 포화 방지 (2026-08-19 교훈)
    mat.roughness = Math.max(mat.roughness, 0.42);
  }
  const tris = geo.index ? geo.index.count / 3 : geo.attributes['position']!.count / 3;
  return { geo, mat, tris };
}

/**
 * 날개 편 지오메트리를 어깨 평면(±cut)에서 셋으로 자른다.
 * 삼각형은 **정점 다수결**로 배정한다 — 걸친 삼각형은 양쪽에 조금씩 남아 이음매를 메운다.
 * 날개 조각은 원점을 어깨로 옮겨 회전축이 어깨가 되게 한다.
 */
function splitWings(src: THREE.BufferGeometry, cut: number) {
  const geo = src.index ? src.toNonIndexed() : src;
  const pos = geo.attributes['position'] as THREE.BufferAttribute;
  const tri = pos.count / 3;
  const pick: number[][] = [[], [], []];   // 0 = 몸통, 1 = 왼쪽(−X), 2 = 오른쪽(+X)
  for (let t = 0; t < tri; t++) {
    let l = 0, r = 0;
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(t * 3 + k);
      if (x < -cut) l++; else if (x > cut) r++;
    }
    pick[l >= 2 ? 1 : r >= 2 ? 2 : 0]!.push(t);
    // 걸친 삼각형은 몸통에도 남겨 틈을 막는다
    if (l === 1 || r === 1) pick[0]!.push(t);
  }
  const take = (list: number[], shiftX: number, shiftY: number) => {
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) {
      const a = geo.attributes[name] as THREE.BufferAttribute;
      const out = new Float32Array(list.length * 3 * a.itemSize);
      let o = 0;
      for (const t of list) for (let k = 0; k < 3; k++) for (let c = 0; c < a.itemSize; c++) out[o++] = a.getComponent(t * 3 + k, c);
      g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
    }
    if (shiftX || shiftY) g.translate(-shiftX, -shiftY, 0);
    return g;
  };
  // 어깨 높이 = 날개 조각의 무게중심 높이. 여기를 축으로 삼아야 어깨에서 꺾인다
  const tmp = take(pick[2]!, 0, 0);
  tmp.computeBoundingBox();
  const shoulderY = (tmp.boundingBox!.min.y + tmp.boundingBox!.max.y) / 2;
  tmp.dispose();

  const body = take(pick[0]!, 0, 0);
  const wingL = take(pick[1]!, -cut, shoulderY);
  const wingR = take(pick[2]!, cut, shoulderY);
  for (const g of [body, wingL, wingR]) g.computeVertexNormals();
  return { body, wingL, wingR, shoulderY, tris: tri };
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
