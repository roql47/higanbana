import * as THREE from 'three';
import { CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS, type CharacterController } from './controller';
import { settings } from '@/core/settings';
import { damp } from '@/core/math';

/**
 * Phase 1 플레이스홀더: 캡슐 + 방향 표시. 착지 스쿼시·가속 기울임으로 조작감 피드백.
 * Phase 3에서 Tripo GLB(SkinnedMesh)로 교체 — 인터페이스(update(dt, ctrl))는 유지.
 */
export class PlaceholderCharacter {
  readonly root = new THREE.Group(); // 발바닥 기준, yaw 회전
  private squash = 0; // 0 = 원형, + = 납작, - = 늘어남
  private squashVel = 0;
  private leanX = 0;
  private leanZ = 0;
  private bodyMesh: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const height = CAPSULE_HALF_HEIGHT * 2 + CAPSULE_RADIUS * 2;
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x2f5c5a,
      roughness: 0.35,
      metalness: 0.0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      sheen: 0.4,
      sheenColor: new THREE.Color(0xe8dfc9),
    });
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 8, 24), bodyMat);
    capsule.position.y = height / 2;
    capsule.castShadow = true;
    capsule.receiveShadow = true;

    // 얼굴/방향 표시: 앞면(+Z)에 크림색 원반 + 눈
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xe8dfc9, roughness: 0.6 });
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), faceMat);
    face.rotation.x = Math.PI / 2;
    face.position.set(0, height - 0.45, CAPSULE_RADIUS - 0.005);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x12110f, roughness: 0.4 });
    const eyeGeo = new THREE.SphereGeometry(0.03, 12, 12);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.06, height - 0.42, CAPSULE_RADIUS + 0.02);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.06, height - 0.42, CAPSULE_RADIUS + 0.02);
    // 가죽색 벨트
    const belt = new THREE.Mesh(
      new THREE.TorusGeometry(CAPSULE_RADIUS + 0.01, 0.035, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x5a3e2b, roughness: 0.55 }),
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = height * 0.52;
    belt.castShadow = true;

    this.bodyMesh = capsule;
    const visual = new THREE.Group();
    visual.add(capsule, face, eyeL, eyeR, belt);
    visual.name = 'placeholder-visual';
    this.root.add(visual);
    scene.add(this.root);
  }

  /** 카메라가 너무 가까울 때 0..1 (1 = 완전 표시) */
  setVisibility(v: number) {
    const vis = THREE.MathUtils.clamp(v, 0, 1);
    this.root.visible = vis > 0.02;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const mat = mesh.material as THREE.Material | undefined;
      if (!mat || !mesh.isMesh) return;
      mat.transparent = vis < 0.999;
      mat.opacity = vis;
      mat.depthWrite = true; // CharacterModel.setVisibility 주석 참고 — 끄면 자기 삼각형끼리 뒤집힌다
    });
  }

  update(dt: number, ctrl: CharacterController) {
    const m = settings.movement;
    this.root.position.copy(ctrl.position);
    this.root.rotation.y = ctrl.yaw;

    // 착지 스쿼시(스프링), 점프 스트레치
    if (ctrl.justLanded) this.squashVel += Math.min(1, ctrl.landImpact / 12) * m.squashOnLand * 40;
    if (ctrl.justJumped) this.squashVel -= 0.12 * 40;
    const k = 220, c = 14; // 스프링 상수/감쇠
    this.squashVel += (-k * this.squash - c * this.squashVel) * dt;
    this.squash += this.squashVel * dt;
    const s = THREE.MathUtils.clamp(this.squash, -0.35, 0.45);
    this.bodyMesh.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
    this.bodyMesh.position.y = (CAPSULE_HALF_HEIGHT * 2 + CAPSULE_RADIUS * 2) / 2 * (1 - s);

    // 가속 방향으로 기울임 (로컬 축으로 변환)
    const cy = Math.cos(-ctrl.yaw), sy = Math.sin(-ctrl.yaw);
    const ax = ctrl.accel.x * cy - ctrl.accel.z * sy; // 로컬 x
    const az = ctrl.accel.x * sy + ctrl.accel.z * cy; // 로컬 z
    const targetLeanX = THREE.MathUtils.clamp(az / 30, -1, 1) * m.leanAmount; // 앞으로 가속 → 앞으로 숙임(x축 회전)
    const targetLeanZ = THREE.MathUtils.clamp(-ax / 30, -1, 1) * m.leanAmount;
    this.leanX = damp(this.leanX, targetLeanX, 10, dt);
    this.leanZ = damp(this.leanZ, targetLeanZ, 10, dt);
    const visual = this.root.children[0]!;
    visual.rotation.set(this.leanX, 0, this.leanZ);
  }
}
