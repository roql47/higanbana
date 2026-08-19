import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export type Rapier = typeof RAPIER;

export class Physics {
  readonly R: Rapier;
  readonly world: RAPIER.World;
  private debugLines: THREE.LineSegments | null = null;

  private constructor(R: Rapier) {
    this.R = R;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 }); // 캐릭터는 자체 중력을 쓰므로 여기 값은 다이내믹 바디용
  }

  static async create() {
    await RAPIER.init();
    return new Physics(RAPIER);
  }

  /** 고정 박스 콜라이더 (중심 위치, 절반 크기, 회전) */
  addStaticBox(center: THREE.Vector3, halfExtents: THREE.Vector3, quat = new THREE.Quaternion()) {
    const R = this.R;
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z).setRotation(quat),
    );
    const col = this.world.createCollider(
      R.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setFriction(1.0),
      body,
    );
    return { body, col };
  }

  step(dt: number) {
    this.world.timestep = dt;
    this.world.step();
  }

  /** Rapier 디버그 와이어프레임을 씬에 표시/갱신 */
  updateDebug(scene: THREE.Scene, enabled: boolean) {
    if (!enabled) {
      if (this.debugLines) { this.debugLines.visible = false; }
      return;
    }
    if (!this.debugLines) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.8 });
      this.debugLines = new THREE.LineSegments(geo, mat);
      this.debugLines.frustumCulled = false;
      this.debugLines.renderOrder = 999;
      scene.add(this.debugLines);
    }
    this.debugLines.visible = true;
    const { vertices, colors } = this.world.debugRender();
    const geo = this.debugLines.geometry;
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
}
