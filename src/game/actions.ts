import * as THREE from 'three';
import { settings } from '@/core/settings';
import type { Senses } from '@/ai/senses';
import type { Hunter } from '@/ai/hunter';
import type { Sfx, Surface } from '@/audio/sfx';
import type { VillageGround } from '@/world/village/ground';

/**
 * 능동 수단 두 가지 (기획 3.5) — 무력감이 절망이 되지 않게 하는 최소한의 손.
 *  - 돌 던지기(좌클릭): 무제한. 포물선 → 착지 지점에 소음 이벤트(20 m) = 유인
 *  - 소금 뿌리기(G): 3회. 전방 부채꼴 3.5 m 의 요괴를 6 s 정지(STUN)
 */
export class Actions {
  salt = 3;
  private stones: { mesh: THREE.Mesh; vel: THREE.Vector3; alive: boolean }[] = [];
  private saltFx: { pts: THREE.Points; t: number } | null = null;
  private stoneGeo = new THREE.SphereGeometry(0.05, 8, 6);
  private stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.95 });
  private throwCd = 0;

  constructor(
    private scene: THREE.Scene,
    private ground: VillageGround,
    private senses: Senses,
    private sfx: Sfx,
  ) {}

  /** 좌클릭 — 카메라가 보는 방향으로 돌을 던진다 */
  throwStone(origin: THREE.Vector3, camera: THREE.Camera) {
    if (this.throwCd > 0) return false;
    this.throwCd = 0.6;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    dir.y = Math.max(dir.y, -0.2) + 0.25; // 살짝 위로 띄운 포물선
    dir.normalize();
    const mesh = new THREE.Mesh(this.stoneGeo, this.stoneMat);
    mesh.castShadow = true;
    mesh.position.copy(origin).add(new THREE.Vector3(0, 1.35, 0)).addScaledVector(dir, 0.5);
    this.scene.add(mesh);
    this.stones.push({ mesh, vel: dir.multiplyScalar(13), alive: true });
    this.sfx.throw();
    return true;
  }

  /**
   * G — 소금. 전방 부채꼴 안의 요괴를 STUN.
   * @returns 맞은 요괴 수, 소금이 없으면 -1
   */
  throwSalt(origin: THREE.Vector3, yaw: number, hunters: Hunter[]): number {
    if (this.salt <= 0) return -1;
    this.salt--;
    this.sfx.throw();
    this.sfx.saltHit();
    // 시각: 흰 입자 부채꼴로 흩뿌림 (0.6 s)
    const N = 60;
    const pos = new Float32Array(N * 3), vel: THREE.Vector3[] = [];
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y + 1.3; pos[i * 3 + 2] = origin.z;
      const a = yaw + (Math.random() - 0.5) * 1.2;
      const sp = 3 + Math.random() * 3;
      vel.push(new THREE.Vector3(Math.sin(a) * sp, 0.5 + Math.random() * 1.5, Math.cos(a) * sp));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf2f0e8, size: 0.05, transparent: true, opacity: 0.95 }));
    pts.userData['vel'] = vel;
    this.scene.add(pts);
    if (this.saltFx) this.saltFx.pts.removeFromParent();
    this.saltFx = { pts, t: 0.6 };
    // 판정: 전방 ±35°, 3.5 m
    let hit = 0;
    for (const h of hunters) {
      const dx = h.position.x - origin.x, dz = h.position.z - origin.z;
      const d = Math.hypot(dx, dz);
      if (d > 3.5) continue;
      let da = Math.atan2(dx, dz) - yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 0.61 && d > 1.2) continue;
      h.stun(); hit++;
    }
    return hit;
  }

  update(dt: number, surfaceAt: (p: THREE.Vector3) => Surface) {
    this.throwCd -= dt;
    // 돌 비행
    for (const s of this.stones) {
      if (!s.alive) continue;
      s.vel.y -= 22 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const gy = this.ground.heightAt(s.mesh.position.x, s.mesh.position.z);
      if (s.mesh.position.y <= gy + 0.05) {
        s.alive = false;
        s.mesh.position.y = gy + 0.04;
        const surf = surfaceAt(s.mesh.position);
        this.sfx.stoneLand(surf);
        this.senses.emitNoise(s.mesh.position, 20, 1.2); // 유인 — 발소리보다 강하게
        // 돌은 3 s 뒤 사라진다
        const m = s.mesh;
        setTimeout(() => m.removeFromParent(), 3000);
      }
    }
    this.stones = this.stones.filter((s) => s.alive || s.mesh.parent);
    // 소금 입자
    if (this.saltFx) {
      this.saltFx.t -= dt;
      const pts = this.saltFx.pts;
      const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const vel = pts.userData['vel'] as THREE.Vector3[];
      for (let i = 0; i < vel.length; i++) {
        vel[i]!.y -= 9 * dt;
        pos.setXYZ(i, pos.getX(i) + vel[i]!.x * dt, Math.max(0.02, pos.getY(i) + vel[i]!.y * dt), pos.getZ(i) + vel[i]!.z * dt);
      }
      pos.needsUpdate = true;
      (pts.material as THREE.PointsMaterial).opacity = Math.min(1, this.saltFx.t / 0.25);
      if (this.saltFx.t <= 0) { pts.removeFromParent(); this.saltFx = null; }
    }
  }

  reset() { this.salt = 3; }
}
