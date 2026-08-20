import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Perch } from './trees';
import type { Sfx } from '@/audio/sfx';

/**
 * 삼나무에 앉아 있다가 다가가면 날아오르는 까마귀(烏).
 *
 * 공포 연출로서 값이 싼 장치다 — 플레이어가 **자기 발로** 방아쇠를 당기고, 놀란 뒤에는
 * "내가 건드린 것"임을 안다. 요괴가 아니라는 안도와 "무언가 있었다"는 잔상이 같이 남는다.
 *
 * 구현 요점
 *  · 드로우콜 3개. 몸통·왼날개·오른날개를 각각 InstancedMesh 로 굽고 행렬만 매 프레임 쓴다.
 *    (날개를 따로 두는 이유는 하나뿐 — 퍼덕여야 하기 때문이다)
 *  · 그림자는 만들지 않는다. 삼나무와 같은 이유로, 초칭 큐브 그림자 6면에 다시 그릴 값이 없다.
 *  · **한 마리가 날면 옆 나무도 같이 난다.** 실제로도 그렇고, 한 마리만 날면 놀랍지가 않다.
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

// 접은 날개 자세. Y 회전은 **뒤로 젖히는** 쪽이어야 한다 —
// +Y 회전이 오른날개(+X)의 끝을 −Z(뒤)로 보낸다. 부호를 뒤집으면 앞으로 접혀 가슴을 뚫는다.
const FOLD_Z = -0.06, FOLD_Y = 1.05;

export class Crows {
  private crows: Crow[] = [];
  private perches: Perch[];
  private used = new Set<number>();
  private body: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private alertR: number;
  private fleeR: number;
  private cawCd = 0;
  private burst = 0;
  private burstDist = 0;
  // 행렬 계산용 스크래치 (씬에 넣지 않는다 — matrixWorld 가 곧 local matrix 다)
  private root = new THREE.Object3D();
  private jointL = new THREE.Object3D();
  private jointR = new THREE.Object3D();
  private rng: () => number;

  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene, perches: Perch[], private sfx: Sfx, opts: CrowOptions = {}) {
    this.perches = perches;
    this.alertR = opts.alertRadius ?? 12;
    this.fleeR = opts.fleeRadius ?? 8.5;
    this.rng = seeded(4471);

    const want = opts.count ?? 22;
    const n = Math.max(0, Math.min(want, Math.floor(perches.length / 2)));

    const mat = new THREE.MeshStandardMaterial({
      color: 0x0b0b10, roughness: 0.42, metalness: 0.18, // 깃털의 푸른 광택 — 달빛이 등에 걸린다
    });
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x090910, roughness: 0.5, metalness: 0.14, side: THREE.DoubleSide,
    });

    const mk = (geo: THREE.BufferGeometry, m: THREE.Material, c: number) => {
      const im = new THREE.InstancedMesh(geo, m, Math.max(1, c));
      im.castShadow = false;
      im.receiveShadow = false;
      im.frustumCulled = false;   // 인스턴스가 맵 전역에 흩어져 있어 공통 바운딩이 의미 없다
      im.count = c;
      this.group.add(im);
      return im;
    };
    this.body = mk(makeBody(), mat, n);
    this.wingL = mk(makeWing(-1), wingMat, n);
    this.wingR = mk(makeWing(1), wingMat, n);

    this.jointL.position.set(-0.046, 0.114, 0.014);
    this.jointR.position.set(0.046, 0.114, 0.014);
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
    this.group.name = 'crows';
    scene.add(this.group);
    console.info(`[crows] ${n} 마리 · 앉을 자리 ${perches.length}`);
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
        // 화면 밖으로 치운다 (count 를 줄이면 인덱스가 어긋난다)
        root.position.set(0, -500, 0);
        root.rotation.set(0, 0, 0);
      } else {
        root.position.copy(c.pos);
        root.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
      }
      // 접힘 ↔ 퍼덕임을 상태로 섞는다
      const open = c.state === 'perch' ? 0 : c.state === 'takeoff' ? THREE.MathUtils.clamp(c.t / 0.18, 0, 1) : 1;
      const beat = Math.sin(c.flap) * 1.05;
      const shuffle = c.restless > 0.5 ? Math.sin(c.t * 13 + c.phase) * 0.12 * (c.restless - 0.5) * 2 : 0;
      const rz = THREE.MathUtils.lerp(FOLD_Z + shuffle, beat, open);
      const ry = THREE.MathUtils.lerp(FOLD_Y, 0.20, open);   // 펼쳐도 약간 뒤로 젖혀 있다
      jr.rotation.set(0, ry, rz);
      jl.rotation.set(0, -ry, -rz);
      root.updateMatrixWorld(true);
      this.body.setMatrixAt(i, root.matrixWorld);
      this.wingL.setMatrixAt(i, jl.matrixWorld);
      this.wingR.setMatrixAt(i, jr.matrixWorld);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.wingL.instanceMatrix.needsUpdate = true;
    this.wingR.instanceMatrix.needsUpdate = true;
  }
}

const ease = (u: number) => 1 - (1 - THREE.MathUtils.clamp(u, 0, 1)) ** 2;

/** 몸통 — 원점은 발밑, +Z 가 부리 방향 */
function makeBody(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.SphereGeometry(1, 8, 5);
  body.scale(0.075, 0.070, 0.135);
  body.translate(0, 0.086, -0.012);
  parts.push(body);

  const head = new THREE.SphereGeometry(1, 6, 4);
  head.scale(0.042, 0.044, 0.048);
  head.translate(0, 0.152, 0.078);
  parts.push(head);

  const beak = new THREE.ConeGeometry(0.019, 0.064, 5);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.148, 0.138);
  parts.push(beak);

  // 꼬리 — 까마귀는 꼬리가 길고 끝이 쐐기다. 실루엣의 절반이 여기서 나온다
  const tail = new THREE.BoxGeometry(0.064, 0.012, 0.135);
  tail.rotateX(-0.20);
  tail.translate(0, 0.094, -0.178);
  parts.push(tail);

  for (const sx of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4, 1, true);
    leg.translate(sx * 0.021, 0.026, 0.006);
    parts.push(leg);
  }

  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('까마귀 지오메트리 병합 실패');
  g.computeVertexNormals();
  return g;
}

/** 날개 한 짝 — 원점이 어깨. side −1 = 왼쪽 */
function makeWing(side: 1 | -1): THREE.BufferGeometry {
  // (x = 바깥, z = 앞뒤). 앞전은 곧고 뒷전은 파여 있다.
  // 까마귀는 **날개가 몸통보다 길다** — 한 짝 34 cm 대 몸통 35 cm. 짧게 만들면 비둘기가 된다.
  // 접으면(FOLD_Y) 끝이 꼬리 끝에 닿는데, 그것도 실제 비율이다.
  const lead: [number, number][] = [[0, 0.050], [0.110, 0.044], [0.222, 0.019], [0.340, -0.030]];
  const trail: [number, number][] = [[0, -0.064], [0.104, -0.106], [0.213, -0.114], [0.325, -0.076]];
  const pos: number[] = [], idx: number[] = [];
  const put = (x: number, z: number, y: number) => { pos.push(x * side, y, z); return pos.length / 3 - 1; };
  const a: number[] = [], b: number[] = [];
  for (let i = 0; i < lead.length; i++) {
    // 끝으로 갈수록 아래로 조금 처진다 (실제 날개의 캠버)
    const drop = -0.004 - i * 0.006;
    a.push(put(lead[i]![0], lead[i]![1], drop));
    b.push(put(trail[i]![0], trail[i]![1], drop - 0.002));
  }
  for (let i = 0; i < lead.length - 1; i++) {
    const s = side > 0 ? [a[i]!, b[i]!, b[i + 1]!, a[i]!, b[i + 1]!, a[i + 1]!] : [a[i]!, b[i + 1]!, b[i]!, a[i]!, a[i + 1]!, b[i + 1]!];
    idx.push(...s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
