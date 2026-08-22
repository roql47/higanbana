import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export type Rapier = typeof RAPIER;

export class Physics {
  readonly R: Rapier;
  readonly world: RAPIER.World;
  private debugLines: THREE.LineSegments | null = null;
  private ray: RAPIER.Ray | null = null;

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

  /**
   * `from`→`to` 사이가 콜라이더로 막혀 있나.
   * 오디오 오클루전(벽 너머 소리)이 매 프레임 몇 번 부르므로 Ray 객체를 재사용한다.
   * 끝점 바로 앞(5 cm)에 맞는 건 음원 자신의 콜라이더일 수 있어 막힌 것으로 치지 않는다.
   */
  rayBlocked(from: THREE.Vector3, to: THREE.Vector3, exclude?: RAPIER.RigidBody): boolean {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return false;
    const ray = (this.ray ??= new this.R.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }));
    ray.origin.x = from.x; ray.origin.y = from.y; ray.origin.z = from.z;
    ray.dir.x = dx / len; ray.dir.y = dy / len; ray.dir.z = dz / len;
    // solid=false: 시작점이 도형 **안**일 때 toi 0 을 돌려주지 않고 반대편 표면까지 통과시킨다.
    // solid=true 로 두면 리스너가 캐릭터 캡슐/지형 안에 있을 때 모든 방향이 "막힘" 으로 나온다 (실제로 그랬다).
    // 추가로 시작점 5 cm 안의 히트는 자기 몸으로 보고 무시한다
    const hit = this.world.castRay(ray, len, false, undefined, undefined, undefined, exclude);
    return hit !== null && hit.timeOfImpact > 0.05 && hit.timeOfImpact < len - 0.05;
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
