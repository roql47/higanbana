import * as THREE from 'three';
import { settings } from '@/core/settings';

/**
 * 한 타(Move)의 절차적 모션 파라미터. 각도는 도(°): `a0 → a1` 은 되감기 끝값 → 스윙 끝값.
 * 축은 캐릭터 기준: X = 왼쪽(오른쪽이 −X), Y = 위, Z = 앞.
 */
export interface AttackMove {
  name: string;
  windup: number; hold: number; swing: number; recover: number;
  spineTwist: [number, number]; // Y축 (− 오른쪽으로 비틀기)
  spinePitch: [number, number]; // X축 (+ 앞으로 숙임)
  raise: [number, number]; // 오른팔 옆으로 들기 (앞축 Z, 양수 = 오른쪽으로 들어올림)
  sweep: [number, number]; // 오른팔 수평 스윕 (Y축, − 뒤 / + 앞·왼쪽)
  armPitch: [number, number]; // 오른팔 앞/위로 들기 (X축, − 위로)
  elbow: [number, number]; // 전완 (Y축, − 뒤로 코킹)
  wrist: [number, number];
  leftRaise: [number, number]; leftPitch: [number, number]; leftSweep: [number, number]; // 왼팔
  hipTwist: [number, number]; // 골반 Y축
  lunge: [number, number]; // 런지: 앞다리/뒷다리 벌림(X축) — 양수면 왼발 앞
  crouch: [number, number]; // 무릎 굽힘(전완처럼 종아리 X축)
  step: number; // 시작 시 앞으로 튀어나가는 속도(m/s)
  dmg: number; // 데미지 배율
  hitFrom: number; hitTo: number; // 판정 구간(초)
  shake: number; hitstop: number;
}

const D = Math.PI / 180;

/** 3타 콤보 프리셋 (settings.attack 의 시간 배율이 곱해짐) */
export const COMBO: AttackMove[] = [
  { // 1타: 수평 베기 (오른쪽 뒤 → 앞 → 왼쪽), 왼발 내딛기
    name: 'slash-h', windup: 0.16, hold: 0.03, swing: 0.15, recover: 0.30,
    spineTwist: [-28, 28], spinePitch: [-2, 8], raise: [78, 68], sweep: [-50, 125], armPitch: [0, 0], elbow: [-45, 0], wrist: [-8, 18],
    leftRaise: [10, 6], leftPitch: [10, -25], leftSweep: [12, -30], hipTwist: [-10, 10], lunge: [18, 26], crouch: [10, 22],
    step: 2.6, dmg: 1.0, hitFrom: 0.19, hitTo: 0.36, shake: 0.35, hitstop: 0.06,
  },
  { // 2타: 백핸드 (왼쪽 앞 → 오른쪽), 오른발 내딛기
    name: 'slash-back', windup: 0.14, hold: 0.02, swing: 0.14, recover: 0.30,
    spineTwist: [30, -30], spinePitch: [0, 8], raise: [72, 66], sweep: [125, -45], armPitch: [-8, 0], elbow: [-30, 0], wrist: [18, -12],
    leftRaise: [12, 8], leftPitch: [-20, 15], leftSweep: [-30, 15], hipTwist: [10, -10], lunge: [-18, -26], crouch: [10, 22],
    step: 2.6, dmg: 1.2, hitFrom: 0.16, hitTo: 0.32, shake: 0.45, hitstop: 0.07,
  },
  { // 3타: 두 손 머리 위 내려찍기 피니셔, 크게 내딛고 상체 숙임
    name: 'overhead', windup: 0.24, hold: 0.04, swing: 0.13, recover: 0.46,
    spineTwist: [-12, 10], spinePitch: [-14, 30], raise: [26, 12], sweep: [-8, 12], armPitch: [-165, -35], elbow: [-55, 0], wrist: [0, 10],
    leftRaise: [-14, -8], leftPitch: [-150, -30], leftSweep: [8, -8], hipTwist: [-6, 6], lunge: [22, 34], crouch: [12, 34],
    step: 4.2, dmg: 1.6, hitFrom: 0.28, hitTo: 0.44, shake: 0.8, hitstop: 0.11,
  },
];

/**
 * 절차적 전신 공격 레이어. 믹서(이동 애니) 위에 척추·골반·다리·양팔 회전을 얹는다.
 */
export class ProceduralAttack {
  t = -1;
  move: AttackMove | null = null;
  private bones: Record<string, THREE.Object3D | null> = {};
  private qTmp = new THREE.Quaternion();
  private qChar = new THREE.Quaternion();
  private qCI = new THREE.Quaternion();
  private qParent = new THREE.Quaternion();
  private qParentInv = new THREE.Quaternion();
  private AX = new THREE.Vector3(1, 0, 0);
  private AY = new THREE.Vector3(0, 1, 0);
  private AZ = new THREE.Vector3(0, 0, 1);

  constructor(root: THREE.Object3D) {
    const want = ['Hip', 'Pelvis', 'Waist', 'Spine01', 'Spine02', 'Head', 'R_Clavicle', 'R_Upperarm', 'R_Forearm', 'R_Hand', 'L_Clavicle', 'L_Upperarm', 'L_Forearm', 'L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf'];
    root.traverse((o) => { if (want.includes(o.name)) this.bones[o.name] = o; });
  }

  get active() { return this.t >= 0; }
  /** 현재 타의 전체 길이(시간 배율 반영) */
  duration(m = this.move) { const k = settings.attack.speed; return m ? (m.windup + m.hold + m.swing + m.recover) / k : 0; }
  recoverStart(m = this.move) { const k = settings.attack.speed; return m ? (m.windup + m.hold + m.swing) / k : 0; }
  start(move: AttackMove) { this.move = move; this.t = 0; }
  stop() { this.t = -1; }

  private phase(t: number, m: AttackMove) {
    const k = settings.attack.speed;
    const tt = t * k;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const c01 = (x: number) => Math.min(1, Math.max(0, x));
    const windup = easeOut(c01(tt / m.windup));
    const swing = easeInOut(c01((tt - m.windup - m.hold) / m.swing));
    const rs = m.windup + m.hold + m.swing;
    const weight = tt < rs ? 1 : 1 - easeInOut(c01((tt - rs) / m.recover));
    return { windup, swing, weight };
  }

  apply(dt: number, yaw: number) {
    if (this.t < 0 || !this.move) return;
    const m = this.move;
    this.t += dt;
    if (this.t > this.duration(m)) { this.t = -1; return; }
    const { windup, swing, weight } = this.phase(this.t, m);
    if (weight <= 0.001) return;
    const amp = settings.attack.amplitude;
    const v = (p: [number, number]) => (p[0] * windup + (p[1] - p[0]) * swing) * D * weight * amp;
    this.qChar.setFromAxisAngle(this.AY, yaw);
    this.qCI.copy(this.qChar).invert();

    // 골반·런지·무릎 (다리)
    this.rot('Hip', this.AY, v(m.hipTwist));
    const lunge = v(m.lunge);
    this.rot('L_Thigh', this.AX, -lunge); // 왼다리 앞(−X 회전 = 앞으로)
    this.rot('R_Thigh', this.AX, lunge * 0.8);
    const crouch = v(m.crouch);
    this.rot(lunge >= 0 ? 'L_Calf' : 'R_Calf', this.AX, crouch); // 앞다리 무릎 굽힘
    // 척추 비틀기·숙임 (골반 회전 일부 상쇄해 상체가 과회전하지 않게)
    const twist = v(m.spineTwist) - v(m.hipTwist) * 0.5;
    this.rot('Spine01', this.AY, twist * 0.45);
    this.rot('Spine02', this.AY, twist * 0.55);
    this.rot('Spine01', this.AX, v(m.spinePitch) * 0.4);
    this.rot('Spine02', this.AX, v(m.spinePitch) * 0.6);
    this.rot('Head', this.AY, -twist * 0.7);
    this.rot('Head', this.AX, -v(m.spinePitch) * 0.6);
    // 오른팔
    const raise = -v(m.raise);
    this.rot('R_Clavicle', this.AZ, raise * 0.15);
    this.rot('R_Upperarm', this.AZ, raise * 0.85);
    this.rot('R_Upperarm', this.AX, v(m.armPitch));
    this.rot('R_Upperarm', this.AY, v(m.sweep));
    this.rot('R_Forearm', this.AY, v(m.elbow));
    this.rot('R_Hand', this.AY, v(m.wrist));
    // 왼팔
    this.rot('L_Upperarm', this.AZ, v(m.leftRaise));
    this.rot('L_Upperarm', this.AX, v(m.leftPitch));
    this.rot('L_Upperarm', this.AY, v(m.leftSweep));
    this.rot('L_Forearm', this.AY, v(m.elbow) * 0.5);
  }

  /** 캐릭터 기준 축으로 본을 회전 (부모 월드 회전 보정) */
  private rot(name: string, axisChar: THREE.Vector3, angle: number) {
    const b = this.bones[name];
    if (!b || Math.abs(angle) < 1e-6) return;
    const qw = this.qTmp.setFromAxisAngle(axisChar, angle).premultiply(this.qChar).multiply(this.qCI);
    b.parent!.getWorldQuaternion(this.qParent);
    this.qParentInv.copy(this.qParent).invert();
    const local = this.qParentInv.multiply(qw).multiply(this.qParent);
    b.quaternion.premultiply(local);
  }
}
