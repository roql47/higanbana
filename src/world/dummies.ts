import * as THREE from 'three';
import { toFloatGeometry } from '@/core/geom';
import type { Physics } from '@/core/physics';
import type { Island } from './terrain';
import { Props } from './props';
import { damp } from '@/core/math';

export interface Hittable {
  position: THREE.Vector3; // 월드 중심(대략 가슴 높이)
  radius: number;
  alive: boolean;
  hit(damage: number, from: THREE.Vector3): void;
}

/** 훈련용 허수아비: HP, 맞으면 흔들리고 쓰러졌다가 리스폰 */
export class Dummies {
  readonly list: Dummy[] = [];
  onHit?: (d: Dummy, damage: number, worldPos: THREE.Vector3, killed: boolean) => void;

  constructor(private scene: THREE.Scene, private physics: Physics, private island: Island | null) {}

  async spawn(url: string, positions: [number, number][], height = 1.9) {
    const gltf = await Props.loader().loadAsync(url);
    let geometry: THREE.BufferGeometry | null = null, material: THREE.Material | null = null;
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !geometry) { geometry = toFloatGeometry(m.geometry, m.matrixWorld); material = Array.isArray(m.material) ? m.material[0]! : m.material; } });
    if (!geometry || !material) return;
    const g = geometry as THREE.BufferGeometry;
    g.computeBoundingBox();
    const bb = g.boundingBox!, sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    g.translate(-c.x, -bb.min.y, -c.z); // 발밑 원점
    const s = height / sz.y;
    for (const [x, z] of positions) {
      const y = this.island ? this.island.heightAt(x, z) : 0;
      const d = new Dummy(this.scene, this.physics, g, material as THREE.Material, s, new THREE.Vector3(x, y, z), height);
      d.onHit = (dmg, pos, killed) => this.onHit?.(d, dmg, pos, killed);
      this.list.push(d);
    }
  }

  update(dt: number) { for (const d of this.list) d.update(dt); }
}

export class Dummy implements Hittable {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  radius = 0.45;
  alive = true;
  hp = 100;
  maxHp = 100;
  onHit?: (damage: number, worldPos: THREE.Vector3, killed: boolean) => void;
  private wobble = new THREE.Vector2(); // 기울기(rad)
  private wobbleVel = new THREE.Vector2();
  private fall = 0; // 0 서 있음 → 1 쓰러짐
  private fallTarget = 0;
  private respawnAt = 0;
  private time = 0;
  private flash = 0;
  private mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private base = new THREE.Vector3();
  private fallDir = new THREE.Vector3(0, 0, 1);

  constructor(scene: THREE.Scene, private physics: Physics, geo: THREE.BufferGeometry, mat: THREE.Material, scale: number, pos: THREE.Vector3, private height: number) {
    this.mat = (mat as THREE.MeshStandardMaterial).clone();
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.scale.setScalar(scale);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.root.add(this.mesh);
    this.root.position.copy(pos);
    this.base.copy(pos);
    scene.add(this.root);
    this.position.copy(pos).setY(pos.y + height * 0.55);
    const R = physics.R;
    const body = physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y + height * 0.5, pos.z));
    physics.world.createCollider(R.ColliderDesc.cylinder(height * 0.5, 0.3).setFriction(0.8), body);
  }

  hit(damage: number, from: THREE.Vector3) {
    if (!this.alive) return;
    this.hp -= damage;
    // 맞은 방향 반대로 기울기 충격
    const dir = new THREE.Vector3().subVectors(this.root.position, from).setY(0).normalize();
    this.wobbleVel.x += dir.z * 6; // z 방향 밀림 → x축 회전
    this.wobbleVel.y += -dir.x * 6;
    this.flash = 1;
    const killed = this.hp <= 0;
    if (killed) {
      this.alive = false;
      this.fallTarget = 1;
      this.fallDir.copy(dir);
      this.respawnAt = this.time + 4.5;
    }
    this.onHit?.(damage, this.position.clone().setY(this.position.y + 0.35), killed);
  }

  update(dt: number) {
    this.time += dt;
    // 흔들림 스프링
    const k = 60, c = 5;
    this.wobbleVel.x += (-k * this.wobble.x - c * this.wobbleVel.x) * dt;
    this.wobbleVel.y += (-k * this.wobble.y - c * this.wobbleVel.y) * dt;
    this.wobble.x += this.wobbleVel.x * dt; this.wobble.y += this.wobbleVel.y * dt;
    // 쓰러짐
    this.fall = damp(this.fall, this.fallTarget, this.fallTarget ? 6 : 4, dt);
    if (!this.alive && this.time > this.respawnAt) { this.alive = true; this.hp = this.maxHp; this.fallTarget = 0; }
    const fallAngle = this.fall * 1.45;
    // 회전 합성: 쓰러짐(밀린 방향으로) + 흔들림
    const q = new THREE.Quaternion();
    const axis = new THREE.Vector3(this.fallDir.z, 0, -this.fallDir.x).normalize();
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    q.setFromAxisAngle(axis, fallAngle);
    const qw = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.wobble.x * 0.08, 0, this.wobble.y * 0.08));
    this.root.quaternion.copy(q).multiply(qw);
    // 피격 플래시
    this.flash = Math.max(0, this.flash - dt * 6);
    this.mat.emissive.setRGB(this.flash * 0.6, this.flash * 0.35, this.flash * 0.15);
    // 쓰러져 있는 동안 반투명
    this.mat.transparent = this.fall > 0.02;
    this.mat.opacity = 1 - this.fall * 0.5;
  }
}
