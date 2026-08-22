import * as THREE from 'three';
import type { Physics } from '@/core/physics';
import { SITES, type HigasatoGround } from './ground';
import { PartsBuilder } from './kit';

/**
 * 오래된 사당(祠) — 공물 1 「붉은 방울」의 무대 (ACT 6, PLAN-STORY §2.3)
 *
 * 뒷산 오솔길 중턱, 산자락에 깎인 선반 위. 문(妻入り)이 동쪽 골짜기를 본다.
 * 실내 4×4 — 로쿠로쿠비 추격(§5.3.1)을 위해 대들보와 천장 높이를 확보해 둔다.
 * 끊어진 금줄·안의 촛불 하나 = 뒷산길에서 보이는 유일한 불빛(길 유도).
 */
export class Hokora {
  readonly group = new THREE.Group();
  /** 제단 위 — 방울이 놓이는 자리(월드) */
  readonly suzuPos: THREE.Vector3;
  /** 실내 중심(월드) */
  readonly center: THREE.Vector3;
  private candle: THREE.PointLight;
  private candleMat: THREE.MeshStandardMaterial;
  private t = 0;
  private bounds: { x0: number; z0: number; x1: number; z1: number };

  constructor(scene: THREE.Scene, physics: Physics, ground: HigasatoGround) {
    const s = SITES.hokora!;
    const cx = s.x, cz = s.z;
    const gy = ground.heightAt(cx, cz);
    this.center = new THREE.Vector3(cx, gy, cz);

    const b = new PartsBuilder(physics);
    const mTimber = b.mat(0x33271b, 0.9);
    const mWood = b.mat(0x241b12, 0.95);   // 비바람에 삭은 벽널
    const mRoof = b.mat(0x171310, 0.95);
    const mStone = b.mat(0x4e534b, 1.0);
    const mRope = b.mat(0xb5a074, 1.0);
    const mWhite = b.mat(0xd8d2c2, 0.95);

    const W = 4.2, D = 4.2, H = 2.15, FL = 0.32; // 실내 폭·깊이·벽 높이·마루 높이
    this.bounds = { x0: cx - W / 2 - 0.4, z0: cz - D / 2 - 0.4, x1: cx + W / 2 + 1.6, z1: cz + D / 2 + 0.4 };

    // 석단 + 마루
    b.box(W + 1.2, 0.3, D + 1.2, cx, gy + 0.15, cz, mStone);
    b.box(W, 0.14, D, cx, gy + FL, cz, mTimber);
    // 기둥 4 + 도리
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.2, H + FL + 0.2, 0.2, cx + sx * W / 2, gy + (H + FL) / 2 + 0.1, cz + sz * D / 2, mTimber);
    for (const sz of [-1, 1]) b.box(W + 0.2, 0.16, 0.16, cx, gy + FL + H, cz + sz * D / 2, mTimber);
    // 벽 3면 (동쪽 = 문)
    b.box(0.1, H, D - 0.2, cx - W / 2 + 0.05, gy + FL + H / 2, cz, mWood);            // 서쪽(제단 뒤)
    for (const sz of [-1, 1]) b.box(W - 0.2, H, 0.1, cx, gy + FL + H / 2, cz + sz * (D / 2 - 0.05), mWood); // 남북
    // 동쪽 문틀: 좌우 널판 + 인방 (개구 폭 1.3)
    for (const sz of [-1, 1]) b.box(0.1, H, (D - 1.3) / 2, cx + W / 2 - 0.05, gy + FL + H / 2, cz + sz * (D / 4 + 1.3 / 4), mWood);
    b.box(0.1, 0.5, 1.4, cx + W / 2 - 0.05, gy + FL + H - 0.25, cz, mWood);
    // 대들보 — 로쿠로쿠비의 길 (§5.3.1). 실내를 동서로 가로지른다
    b.box(W - 0.1, 0.18, 0.22, cx, gy + FL + H - 0.12, cz, mTimber);
    // 지붕: 용마루가 z 축(문이 x+ 를 보므로 박공면이 동서) → yaw 90°
    b.gable(cx, cz, D / 2 + 1.0, W / 2 + 1.1, gy + FL + H + 0.18, 1.5, mRoof, Math.PI / 2);
    // 제단 (서쪽 벽 앞)
    b.box(1.3, 0.62, 0.55, cx - W / 2 + 0.75, gy + FL + 0.31, cz, mWood);
    b.box(1.1, 0.08, 0.45, cx - W / 2 + 0.75, gy + FL + 0.66, cz, mTimber);
    this.suzuPos = new THREE.Vector3(cx - W / 2 + 0.75, gy + FL + 0.7, cz);
    // 툇마루 계단 (동쪽)
    for (let i = 0; i < 2; i++) b.box(1.6, 0.16, 0.36, cx + W / 2 + 0.45 + i * -0.18, gy + 0.1 + i * 0.16, cz, mStone);
    // 끊어진 금줄: 문 위에 늘어진 밧줄 반쪽 + 시데 하나
    const rope = new THREE.CylinderGeometry(0.045, 0.045, 1.1, 6);
    rope.rotateZ(0.9); rope.translate(cx + W / 2 + 0.1, gy + FL + H - 0.45, cz - 0.5);
    b.add(rope, mRope);
    b.box(0.14, 0.4, 0.02, cx + W / 2 + 0.12, gy + FL + H - 0.95, cz - 0.75, mWhite);

    // 콜라이더: 벽 3면 + 문틀 + 제단 + 기단 (지붕은 없음 — 목이 지나는 공간)
    b.collide(cx - W / 2 + 0.05, gy + FL + H / 2, cz, 0.1, H / 2, D / 2);
    for (const sz of [-1, 1]) b.collide(cx, gy + FL + H / 2, cz + sz * (D / 2 - 0.05), W / 2, H / 2, 0.1);
    for (const sz of [-1, 1]) b.collide(cx + W / 2 - 0.05, gy + FL + H / 2, cz + sz * (D / 4 + 1.3 / 4), 0.1, H / 2, (D - 1.3) / 4);
    b.collide(cx - W / 2 + 0.75, gy + FL + 0.31, cz, 0.65, 0.31, 0.28);
    b.collide(cx, gy + 0.15, cz, W / 2 + 0.6, 0.16, D / 2 + 0.6);

    this.group.add(b.build('hokora'));

    // 촛불 — 뒷산길에서 보이는 유일한 불빛. 문틈으로 새 나온다
    this.candleMat = new THREE.MeshStandardMaterial({ color: 0xf6e3bf, emissive: new THREE.Color(0xffa040), emissiveIntensity: 0.9, roughness: 0.95 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.18, 8), this.candleMat);
    c.position.set(this.suzuPos.x + 0.35, this.suzuPos.y + 0.09, this.suzuPos.z - 0.32);
    this.group.add(c);
    this.candle = new THREE.PointLight(0xffa040, 1.0, 6.5, 2);
    this.candle.position.copy(c.position).add(new THREE.Vector3(0, 0.18, 0));
    this.candle.castShadow = false;
    this.group.add(this.candle);

    scene.add(this.group);
  }

  /** 실내 판정 — 카메라 조임·안개 끄기용 */
  contains(p: THREE.Vector3): boolean {
    return p.x > this.bounds.x0 && p.x < this.bounds.x1 && p.z > this.bounds.z0 && p.z < this.bounds.z1 && p.y < this.center.y + 3;
  }

  update(dt: number) {
    this.t += dt;
    const f = 0.8 + 0.2 * Math.sin(this.t * 5.3) * Math.sin(this.t * 1.7);
    this.candleMat.emissiveIntensity = 0.9 * f;
    this.candle.intensity = 1.0 * f;
  }
}
