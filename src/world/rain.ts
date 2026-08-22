import * as THREE from 'three';

/**
 * 비 — 프롤로그(ACT 1) 전용. 카메라를 따라다니는 원통 안에서 줄 조각이 떨어진다.
 * LineSegments 하나(드로우콜 1), CPU 갱신 650방울. 프롤로그가 끝나면 통째로 꺼진다.
 */
export class Rain {
  readonly group = new THREE.Group();
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private drop: Float32Array; // x,y,z,speed × n
  private n = 650;
  private enabled = false;
  /** 낙하 방향 (바람에 살짝 기울어짐) */
  private dir = new THREE.Vector3(0.09, -1, 0.03).normalize();

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.n * 6);
    this.drop = new Float32Array(this.n * 4);
    for (let i = 0; i < this.n; i++) this.respawn(i, new THREE.Vector3(), true);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x9db1c6, transparent: true, opacity: 0.3, depthWrite: false });
    const lines = new THREE.LineSegments(this.geo, mat);
    lines.frustumCulled = false;
    this.group.add(lines);
    this.group.visible = false;
    scene.add(this.group);
  }

  setEnabled(v: boolean) { this.enabled = v; this.group.visible = v; }

  private respawn(i: number, center: THREE.Vector3, anywhere = false) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 9;
    this.drop[i * 4] = center.x + Math.cos(a) * r;
    this.drop[i * 4 + 1] = center.y + (anywhere ? Math.random() * 12 : 8 + Math.random() * 4);
    this.drop[i * 4 + 2] = center.z + Math.sin(a) * r;
    this.drop[i * 4 + 3] = 8.5 + Math.random() * 3.5;
  }

  update(dt: number, center: THREE.Vector3) {
    if (!this.enabled) return;
    const d = this.dir;
    for (let i = 0; i < this.n; i++) {
      const s = this.drop[i * 4 + 3]!;
      this.drop[i * 4] = this.drop[i * 4]! + d.x * s * dt;
      this.drop[i * 4 + 1] = this.drop[i * 4 + 1]! + d.y * s * dt;
      this.drop[i * 4 + 2] = this.drop[i * 4 + 2]! + d.z * s * dt;
      // 카메라 아래로 지나갔거나 너무 멀어지면 재생성
      const dx = this.drop[i * 4]! - center.x, dz = this.drop[i * 4 + 2]! - center.z;
      if (this.drop[i * 4 + 1]! < center.y - 2.5 || dx * dx + dz * dz > 144) this.respawn(i, center);
      const x = this.drop[i * 4]!, y = this.drop[i * 4 + 1]!, z = this.drop[i * 4 + 2]!;
      const len = 0.22 + s * 0.014;
      this.pos[i * 6] = x; this.pos[i * 6 + 1] = y; this.pos[i * 6 + 2] = z;
      this.pos[i * 6 + 3] = x - d.x * len; this.pos[i * 6 + 4] = y - d.y * len; this.pos[i * 6 + 5] = z - d.z * len;
    }
    (this.geo.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
  }
}
