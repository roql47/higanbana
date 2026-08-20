import * as THREE from 'three';
import type { CharacterModel } from './model';

const D = 1; // rad

/**
 * 웅크림 절차 자세 — 믹서가 적용된 걷기/서기 클립 **위에** 매 프레임 얹는다 (model.postPose).
 * proceduralAttack 과 같은 캐릭터 공간 축 회전(rot)을 쓴다 — 본 로컬 축을 추측하지 않는다.
 *
 * 두 자세를 속도로 블렌드:
 *  - 정지: 깊은 쪼그림 — 무릎 크게, 등 둥글게, 팔은 무릎 앞에 모음
 *  - 이동: 스토킹 보행 — 얕은 무릎, 보폭에 맞춘 상하 바운스, 좌우 체중 이동, 팔 웅크림
 */
export class CrouchPose {
  private bones: Record<string, THREE.Object3D> = {};
  private target = 0;
  private amount = 0;
  private moveBlend = 0;
  private phase = 0; // 보폭 위상 (0..1)
  private qChar = new THREE.Quaternion();
  private qCI = new THREE.Quaternion();
  private qParent = new THREE.Quaternion();
  private qParentInv = new THREE.Quaternion();
  private qTmp = new THREE.Quaternion();
  private AX = new THREE.Vector3(1, 0, 0);
  private AY = new THREE.Vector3(0, 1, 0);
  private AZ = new THREE.Vector3(0, 0, 1);

  constructor(private model: CharacterModel) {
    const want = ['Hip', 'Waist', 'Spine01', 'Spine02', 'NeckTwist01', 'Head',
      'L_Clavicle', 'R_Clavicle', 'L_Upperarm', 'R_Upperarm', 'L_Forearm', 'R_Forearm',
      'L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'L_Foot', 'R_Foot'];
    model.root.traverse((o) => { if (want.includes(o.name)) this.bones[o.name] = o; });
  }

  setTarget(v: number) { this.target = v; }
  get active() { return this.amount > 0.01; }

  /** model.postPose 에서 호출 — 믹서·기존 보정 뒤에 얹는다 */
  apply(dt: number, yaw: number, speed: number) {
    this.amount += (this.target - this.amount) * Math.min(1, dt * 9);
    if (this.amount < 0.01) { this.model.setPoseDrop(0); return; }
    const k = this.amount;
    const mv = Math.min(1, speed / 0.45);
    this.moveBlend += (mv - this.moveBlend) * Math.min(1, dt * 8);
    const m = this.moveBlend;
    // 보폭 위상: 웅크림 보폭 ~0.85 m
    this.phase = (this.phase + (speed / 0.85) * dt) % 1;
    const sin1 = Math.sin(this.phase * Math.PI * 2);       // 좌우 (한 걸음 주기)
    const bob = Math.sin(this.phase * Math.PI * 4);        // 상하 (반 걸음 주기)

    this.qChar.setFromAxisAngle(this.AY, yaw);
    this.qCI.copy(this.qChar).invert();

    // --- 하체 ---
    const thigh = -(0.82 - 0.34 * m) * k;   // 정지 -0.82 / 이동 -0.48
    const calf = (1.12 - 0.44 * m) * k;     // 정지 +1.12 / 이동 +0.68
    const foot = -(0.34 - 0.14 * m) * k;
    this.rot('L_Thigh', this.AX, thigh + m * k * sin1 * 0.10);
    this.rot('R_Thigh', this.AX, thigh - m * k * sin1 * 0.10);
    this.rot('L_Calf', this.AX, calf);
    this.rot('R_Calf', this.AX, calf);
    this.rot('L_Foot', this.AX, foot);
    this.rot('R_Foot', this.AX, foot);

    // --- 몸통: 둥근 등 + 이동 시 좌우 체중 이동 ---
    this.rot('Waist', this.AX, 0.16 * k);
    this.rot('Spine01', this.AX, 0.22 * k);
    this.rot('Spine02', this.AX, 0.27 * k);
    const sway = m * k * sin1 * 0.05;
    this.rot('Hip', this.AZ, sway);
    this.rot('Spine02', this.AZ, -sway * 0.7);
    // 고개: 시선은 정면을 유지
    this.rot('NeckTwist01', this.AX, -0.22 * k);
    this.rot('Head', this.AX, -0.34 * k);

    // --- 팔: 앞으로 모아 웅크림 (초칭 든 왼손도 자연히 몸 앞으로) ---
    const armF = 0.24 * k * (1 - m * 0.3);
    this.rot('L_Clavicle', this.AX, 0.10 * k);
    this.rot('R_Clavicle', this.AX, 0.10 * k);
    this.rot('L_Upperarm', this.AX, armF);
    this.rot('R_Upperarm', this.AX, armF);
    this.rot('L_Forearm', this.AY, -0.58 * k);
    this.rot('R_Forearm', this.AY, 0.58 * k);

    // --- 몸 낮추기: 정지 0.34 / 이동 0.25 + 보행 바운스 ---
    const drop = (0.34 - 0.09 * m) * k + m * k * bob * 0.022;
    this.model.setPoseDrop(drop);
  }

  /** 캐릭터 기준 축으로 본 회전 (proceduralAttack 과 동일한 수법) */
  private rot(name: string, axisChar: THREE.Vector3, angle: number) {
    const b = this.bones[name];
    if (!b || Math.abs(angle) < 1e-6) return;
    const qw = this.qTmp.setFromAxisAngle(axisChar, angle * D).premultiply(this.qChar).multiply(this.qCI);
    b.parent!.getWorldQuaternion(this.qParent);
    this.qParentInv.copy(this.qParent).invert();
    const local = this.qParentInv.multiply(qw).multiply(this.qParent);
    b.quaternion.premultiply(local);
  }
}
