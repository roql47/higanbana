import * as THREE from 'three';
import { Props } from '@/world/props';
import type { Landmarks } from './landmarks';
import type { MatsuriSquare } from './matsuri';
import type { Chochin } from '@/light/chochin';
import type { Sfx } from '@/audio/sfx';

/**
 * 연출형 요괴 — 추격 AI 없이 1회성/상시 스크립트로 공포를 만든다.
 *  1) 움직이는 지장: 플레이어가 여섯 지장을 **안 볼 때만** 한 구가 미묘하게 돌아가거나 한 걸음 옮겨 있다
 *  2) 놋페라보: 노점 뒤에 등 돌린 채 서 있다 → 3.5 m 안으로 다가가면 돌아본다 → 얼굴이 없다 → 1.2 s 뒤 사라짐. 1회성
 *  3) 초칭오바케: 위협 근접 중(요괴 8 m 이내) 무작위로 내 초칭에 0.45 s 동안 눈이 뜬다. 쿨다운 40 s
 */
export class Scares {
  private noppera: THREE.Object3D | null = null;
  private nopperaStall: { pos: THREE.Vector3; yaw: number } | null = null;
  private nopperaState: 'waiting' | 'turning' | 'gone' = 'waiting';
  private nopperaT = 0;
  private nopperaYaw0 = 0;
  private jizoT = 0;
  private eyeMat: THREE.MeshStandardMaterial | null = null;
  private eyeMesh: THREE.Mesh | null = null;
  private eyeT = 0;
  private eyeCooldown = 25;
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private landmarks: Landmarks,
    private square: MatsuriSquare,
    private chochin: Chochin | null,
    private sfx: Sfx,
  ) {}

  async load() {
    // 놋페라보: 노점 중 하나의 카운터 뒤, 광장 중심을 등진 채
    const stall = this.square.stalls[2] ?? this.square.stalls[0];
    if (stall) {
      const g = await Props.loader().loadAsync('/models/yokai-noppera.glb');
      const root = g.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const s = 1.6 / Math.max(0.01, size.y);
      root.scale.setScalar(s);
      root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
      const wrap = new THREE.Group();
      const inner = new THREE.Group();
      inner.rotation.y = -Math.PI / 2; // Tripo 정면 +X → +Z
      inner.add(root);
      wrap.add(inner);
      root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      // 달걀 얼굴: Tripo 가 "사람 얼굴"로 보정해 희미한 눈코입을 그려넣었다 → 머리 앞면에
      // 매끈한 살색 타원체를 덮어 지운다 (정면 +Z 기준, 키 1.6 m 에서 얼굴 중심 ≈ 1.47 m)
      const egg = new THREE.Mesh(
        new THREE.SphereGeometry(0.085, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xe9cdb2, roughness: 0.55, metalness: 0 }),
      );
      egg.scale.set(1.0, 1.32, 0.62);
      egg.position.set(0, 1.47, 0.06);
      egg.castShadow = false;
      wrap.add(egg);
      // 카운터 뒤(광장 반대쪽 0.9 m) — 등을 보인다 (yaw = 노점 yaw + π)
      const back = new THREE.Vector3(-Math.sin(stall.yaw), 0, -Math.cos(stall.yaw)).multiplyScalar(0.9);
      wrap.position.copy(stall.pos).add(back);
      wrap.rotation.y = stall.yaw + Math.PI;
      this.nopperaYaw0 = wrap.rotation.y;
      this.scene.add(wrap);
      this.noppera = wrap;
      this.nopperaStall = stall;
    }
    // 초칭오바케: 초칭 종이 위에 덮는 눈 데칼(작은 평면). 평소엔 투명
    if (this.chochin) {
      const tex = await new THREE.TextureLoader().loadAsync('/textures/chochin-eye.webp');
      tex.colorSpace = THREE.SRGBColorSpace;
      this.eyeMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0, emissive: new THREE.Color(0xffd090), emissiveIntensity: 0.35, emissiveMap: tex, depthWrite: false, side: THREE.DoubleSide });
      const size = 0.34;
      this.eyeMesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.46, size * 0.30), this.eyeMat);
      // 초칭 몸통 앞면(+Z 쪽, 플레이어 뒤에서 보는 카메라 기준 바깥)에 붙인다
      this.eyeMesh.position.set(0, 0.02, size * 0.31);
      this.eyeMesh.renderOrder = 5;
      this.chochin.body.add(this.eyeMesh);
    }
  }

  /**
   * @param playerPos   플레이어 위치
   * @param camera      시야 판정용
   * @param threat      0..1 위협 근접도 (초칭오바케 트리거)
   */
  update(dt: number, playerPos: THREE.Vector3, camera: THREE.Camera, threat: number) {
    this.updateJizo(dt, camera);
    this.updateNoppera(dt, playerPos, camera);
    this.updateEye(dt, threat);
  }

  // ---- 1) 움직이는 지장 ----
  private frustum = new THREE.Frustum();
  private projView = new THREE.Matrix4();
  private updateJizo(dt: number, camera: THREE.Camera) {
    this.jizoT -= dt;
    if (this.jizoT > 0 || this.landmarks.jizo.length === 0) return;
    this.jizoT = 6 + Math.random() * 10;
    // 지장 중 하나라도 화면 안이면 건드리지 않는다 — 보고 있을 땐 움직이지 않는다
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    for (const j of this.landmarks.jizo) {
      this.tmp.copy(j.base); this.tmp.y += 0.6;
      if (this.frustum.containsPoint(this.tmp)) return;
    }
    // 무작위 한 구: 30° 안팎 회전 또는 반 걸음 이동. 이따금 원위치 복구
    const j = this.landmarks.jizo[Math.floor(Math.random() * this.landmarks.jizo.length)]!;
    const r = Math.random();
    if (r < 0.45) j.obj.rotation.y = j.yaw + (Math.random() - 0.5) * 1.1;
    else if (r < 0.8) { j.obj.position.x = j.base.x + (Math.random() - 0.5) * 0.6; j.obj.position.z = j.base.z + (Math.random() - 0.5) * 0.6; }
    else { j.obj.rotation.y = j.yaw; j.obj.position.set(j.base.x, j.base.y - 0.02, j.base.z); }
  }

  // ---- 2) 놋페라보 ----
  private updateNoppera(dt: number, playerPos: THREE.Vector3, camera: THREE.Camera) {
    if (!this.noppera || this.nopperaState === 'gone') return;
    const d = this.noppera.position.distanceTo(playerPos);
    if (this.nopperaState === 'waiting') {
      if (d < 3.5) {
        this.nopperaState = 'turning';
        this.nopperaT = 0;
        this.sfx.nopperaTurn();
      }
      return;
    }
    // turning: 0.8 s 에 걸쳐 플레이어 쪽으로 돌아본다 → 0.9 s 정지 → 소멸
    this.nopperaT += dt;
    const target = Math.atan2(playerPos.x - this.noppera.position.x, playerPos.z - this.noppera.position.z);
    const k = THREE.MathUtils.smoothstep(this.nopperaT, 0, 0.8);
    let dy = target - this.nopperaYaw0;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.noppera.rotation.y = this.nopperaYaw0 + dy * k;
    if (this.nopperaT > 1.7) {
      // 플레이어가 잠깐 다른 곳을 볼 때 사라지면 더 무섭지만, 단순화: 페이드 없이 제거 + 소리
      this.noppera.removeFromParent();
      this.nopperaState = 'gone';
      this.sfx.nopperaVanish();
    }
  }

  // ---- 3) 초칭오바케 ----
  private updateEye(dt: number, threat: number) {
    if (!this.eyeMat) return;
    if (this.eyeT > 0) {
      this.eyeT -= dt;
      // 뜨는 순간 확, 감길 때 천천히
      const a = this.eyeT > 0.35 ? 1 : this.eyeT / 0.35;
      this.eyeMat.opacity = a * 0.95;
      if (this.eyeT <= 0) this.eyeMat.opacity = 0;
      return;
    }
    this.eyeCooldown -= dt;
    if (this.eyeCooldown > 0) return;
    // 위협이 높을 때(8 m 이내 ≈ threat > 0.8) 초당 약 8% 확률
    if (threat > 0.8 && Math.random() < dt * 0.08) {
      this.eyeT = 0.5;
      this.eyeCooldown = 40;
      this.sfx.eyeOpen();
    }
  }
}
