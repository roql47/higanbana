import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';
import { clamp, damp } from '@/core/math';

/**
 * 3인칭 스프링암 카메라.
 * - 피벗(캐릭터 머리 근처)을 감쇠 추적, yaw/pitch 는 마우스, 거리는 휠
 * - 피벗→카메라 방향으로 구(球) 캐스트해 벽에 막히면 당겨짐 (빠르게 당기고 천천히 풀림)
 * - 속도에 따라 FOV 소폭 증가
 */
export class ThirdPersonCamera {
  yaw = Math.PI; // 시작: 캐릭터 뒤(+Z)에서 -Z 를 바라봄 → yaw=0 이 그 상태. (초기값은 main에서 세팅)
  pitch = 0.32;
  private targetDistance = settings.camera.distance;
  private distance = settings.camera.distance;
  private pivot = new THREE.Vector3();
  private pivotInit = false;
  private fov = settings.camera.baseFov;
  private ball: RAPIER.Ball;
  private tmpDir = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  private tmpPivot = new THREE.Vector3();
  private tmpPos = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private physics: Physics,
    private excludeBody: RAPIER.RigidBody,
  ) {
    this.yaw = 0;
    this.ball = new physics.R.Ball(settings.camera.collisionRadius);
  }

  /** 카메라가 바라보는 수평 방향(yaw) — 캐릭터 이동 기준 */
  get headingYaw() { return this.yaw; }
  /** 현재 피벗-카메라 거리 (캐릭터 페이드 판단용) */
  get currentDistance() { return this.distance; }

  // --- 시네마틱 진입: 높고 먼 곳에서 천천히 돌며 내려와 3인칭 위치로 ---
  private introT = 0;
  private introDur = 0;
  private introYaw0 = 0;
  startIntro(duration = 3.2) { this.introDur = duration; this.introT = duration; this.introYaw0 = this.yaw; }
  get inIntro() { return this.introT > 0; }

  /** 좁은 통로에서 바깥이 눌러주는 최대 거리(m). null 이면 사용자 줌 값 그대로 */
  constrainDistance: number | null = null;
  /** 좁은 통로에서 바깥이 눌러주는 최대 피치(rad, 위로 보는 각). null 이면 제한 없음 */
  constrainPitch: number | null = null;

  // --- 카메라 흔들림(타격 피드백) ---
  private shakeAmt = 0;
  shake(intensity: number) { this.shakeAmt = Math.min(1, this.shakeAmt + intensity); }

  update(
    dt: number,
    mouse: { x: number; y: number },
    wheel: number,
    targetPos: THREE.Vector3,
    speed: number,
    grounded: boolean,
  ) {
    const c = settings.camera;

    // --- 입력 (인트로 중엔 무시) ---
    if (this.introT <= 0) {
      this.yaw -= mouse.x * c.sensitivity;
      this.pitch = clamp(this.pitch + mouse.y * c.sensitivity, c.minPitch, c.maxPitch);
      if (wheel !== 0) this.targetDistance = clamp(this.targetDistance + wheel * 0.0035, c.minDistance, c.maxDistance);
    }
    if (this.constrainPitch !== null) this.pitch = Math.min(this.pitch, this.constrainPitch);
    const wanted = this.constrainDistance !== null ? Math.min(this.targetDistance, this.constrainDistance) : this.targetDistance;

    // --- 피벗 추적 ---
    this.tmpPivot.set(targetPos.x, targetPos.y + c.pivotHeight, targetPos.z);
    if (!this.pivotInit) { this.pivot.copy(this.tmpPivot); this.pivotInit = true; }
    const lagY = grounded ? c.followLag : c.followLag * 0.55; // 공중에선 수직 추적을 느슨하게
    this.pivot.x = damp(this.pivot.x, this.tmpPivot.x, c.followLag, dt);
    this.pivot.z = damp(this.pivot.z, this.tmpPivot.z, c.followLag, dt);
    this.pivot.y = damp(this.pivot.y, this.tmpPivot.y, lagY, dt);

    // 어깨 오프셋(카메라 우측 방향으로 피벗을 살짝 이동)
    this.tmpRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const pivotOff = this.tmpPos.copy(this.pivot).addScaledVector(this.tmpRight, c.shoulderOffset);

    // --- 카메라 방향 & 충돌 ---
    const cp = Math.cos(this.pitch);
    this.tmpDir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    let allowed = wanted;
    const hit = this.physics.world.castShape(
      pivotOff, { x: 0, y: 0, z: 0, w: 1 }, this.tmpDir, this.ball,
      0, wanted, true,
      undefined, undefined, undefined, this.excludeBody,
    );
    if (hit) allowed = Math.max(c.minCollisionDistance, hit.time_of_impact - 0.05);
    const lambda = allowed < this.distance ? c.collisionPullSpeed : c.collisionReleaseSpeed;
    this.distance = damp(this.distance, allowed, Math.max(lambda, c.zoomLag), dt);

    this.camera.position.copy(pivotOff).addScaledVector(this.tmpDir, this.distance);
    if (this.introT > 0) {
      // 진입 연출: t=1(시작) → 0(끝). 시작점은 반대편·높은 곳·먼 거리, ease-out 으로 수렴
      this.introT = Math.max(0, this.introT - dt);
      const u = this.introT / this.introDur; // 1 → 0
      const e = u * u * (3 - 2 * u); // smoothstep
      const yaw = this.introYaw0 + Math.PI * 0.9 * e; // 반 바퀴 돌아 들어옴
      const pitch = this.pitch + 0.55 * e;
      const dist = this.distance + 9 * e;
      const cp2 = Math.cos(pitch);
      this.tmpDir.set(Math.sin(yaw) * cp2, Math.sin(pitch), Math.cos(yaw) * cp2);
      this.camera.position.copy(pivotOff).addScaledVector(this.tmpDir, dist);
    }
    this.camera.lookAt(pivotOff);
    if (this.shakeAmt > 0.001) {
      const a = this.shakeAmt * 0.06;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotation.z += (Math.random() - 0.5) * a * 0.3;
      this.shakeAmt = damp(this.shakeAmt, 0, 14, dt);
    }

    // --- FOV: 속도에 따라 소폭 확대 ---
    const m = settings.movement;
    const t = clamp((speed - m.walkSpeed) / Math.max(0.01, m.runSpeed - m.walkSpeed), 0, 1);
    const targetFov = c.baseFov + c.runFovBoost * t * t;
    this.fov = damp(this.fov, targetFov, c.fovLag, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
