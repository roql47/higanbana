import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';
import { clamp, damp } from '@/core/math';

export type GameplayCameraView = 'third' | 'first';

/**
 * 플레이 카메라.
 * - 3인칭: 피벗(캐릭터 머리 근처)을 감쇠 추적하는 충돌 대응 스프링암
 * - 1인칭: 같은 yaw/pitch 를 유지한 채 미오의 눈높이에 카메라를 둔다
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
  private viewMode: GameplayCameraView = 'third';

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
  get view() { return this.viewMode; }
  get isFirstPerson() { return this.viewMode === 'first'; }

  setView(view: GameplayCameraView) {
    if (this.viewMode === view) return view;
    this.viewMode = view;
    // 인트로 크레인과 1인칭은 동시에 성립하지 않는다. 사용자가 시점을 바꾸면 즉시 플레이 시점으로 간다.
    if (view === 'first') this.introT = 0;
    return view;
  }

  toggleView() { return this.setView(this.isFirstPerson ? 'third' : 'first'); }

  // --- 시네마틱 진입: 높고 먼 곳에서 천천히 돌며 내려와 3인칭 위치로 ---
  private introT = 0;
  private introDur = 0;
  private introYaw0 = 0;
  startIntro(duration = 3.2) { this.introDur = duration; this.introT = duration; this.introYaw0 = this.yaw; }
  get inIntro() { return this.introT > 0; }
  /** 진입 회전 진행률. 0=반대편 높은 카메라, 1=일반 3인칭 카메라. */
  get introProgress() { return this.introDur > 0 ? 1 - this.introT / this.introDur : 1; }

  /** 웅크림 시 피벗을 낮추는 양(m) — main 이 설정, 내부에서 감쇠 적용 */
  pivotDrop = 0;
  private curDrop = 0;
  /** 좁은 통로에서 바깥이 눌러주는 최대 거리(m). null 이면 사용자 줌 값 그대로 */
  constrainDistance: number | null = null;
  /** 좁은 통로에서 바깥이 눌러주는 최대 피치(rad, 위로 보는 각). null 이면 제한 없음 */
  constrainPitch: number | null = null;

  // --- 카메라 흔들림(타격 피드백) ---
  private shakeAmt = 0;
  private returnT = 0;
  private readonly returnPosition = new THREE.Vector3();
  private readonly returnRotation = new THREE.Quaternion();
  shake(intensity: number) { this.shakeAmt = Math.min(1, this.shakeAmt + intensity); }

  /**
   * 시퀀서가 놓고 간 마지막 카메라를 다음 3인칭 프레임의 시작점으로 받아들인다.
   * 이 동기화가 없으면 컷 종료 프레임에 예전 yaw·거리로 순간 복귀해 숏 전체가 점프컷처럼 보인다.
   */
  adoptCurrentView(targetPos: THREE.Vector3, previous?: { yaw: number; pitch: number; distance: number }) {
    this.returnPosition.copy(this.camera.position);
    this.returnRotation.copy(this.camera.quaternion);
    this.returnT = 0.55;
    const c = settings.camera;
    this.curDrop = this.pivotDrop;
    this.pivot.set(targetPos.x, targetPos.y + c.pivotHeight - this.curDrop, targetPos.z);
    this.pivotInit = true;
    const offset = this.camera.position.clone().sub(this.pivot);
    const len = Math.max(0.001, offset.length());
    this.yaw = previous?.yaw ?? Math.atan2(offset.x, offset.z);
    this.pitch = clamp(previous?.pitch ?? Math.asin(offset.y / len), c.minPitch, c.maxPitch);
    this.distance = clamp(previous?.distance ?? len, c.minDistance, c.maxDistance);
    this.targetDistance = this.distance;
    this.introT = 0;
  }

  /** 암전 텔레포트 뒤 새 위치에서 목표를 향한 정상 3인칭 구도로 즉시 재설정한다. */
  snapBehind(targetPos: THREE.Vector3, lookAt: THREE.Vector3) {
    this.returnT = 0;
    const c = settings.camera;
    this.curDrop = this.pivotDrop;
    this.pivot.set(targetPos.x, targetPos.y + c.pivotHeight - this.curDrop, targetPos.z);
    this.pivotInit = true;
    this.yaw = ThirdPersonCamera.yawToward(targetPos, lookAt);
    this.pitch = clamp(0.28, c.minPitch, c.maxPitch);
    this.distance = this.targetDistance = clamp(c.distance, c.minDistance, c.maxDistance);
    this.introT = 0;
  }

  /**
   * 시선을 목표 yaw 쪽으로 **끈다**. 조작을 뺏지 않고 무게만 준다 —
   * 마우스 입력은 그대로 더해지므로 플레이어가 버티면 안 돌아갈 수도 있다.
   * ACT 3 의 「멀리서 목소리가 들린다」가 이걸 쓴다 (ACT 1 의 시선 저항과 같은 문법).
   */
  pull(targetYaw: number, rate: number, dt: number) {
    let d = targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }
  /**
   * 위아래도 같이 끈다 — `pull` 의 상하판.
   * 비석의 각인처럼 **눈높이보다 낮은 것**을 볼 때, yaw 만 돌리면 글자는 화면 아래에 걸린다.
   * 사용자 조작 범위 안으로 잘라 둬야 그 뒤 마우스로 이어서 볼 수 있다.
   */
  pullPitch(targetPitch: number, rate: number, dt: number) {
    const c = settings.camera;
    const t = clamp(targetPitch, c.minPitch, c.maxPitch);
    this.pitch += (t - this.pitch) * (1 - Math.exp(-rate * dt));
  }
  /** 어떤 지점을 보려면 yaw 가 얼마여야 하는가 — 카메라 전방은 (−sin yaw, ·, −cos yaw) 다 */
  static yawToward(from: THREE.Vector3, to: THREE.Vector3) {
    return Math.atan2(-(to.x - from.x), -(to.z - from.z));
  }

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
      // 1인칭에서 굴린 휠이 나중에 돌아간 3인칭 거리를 몰래 바꾸지 않게 한다.
      if (!this.isFirstPerson && wheel !== 0) this.targetDistance = clamp(this.targetDistance + wheel * 0.0035, c.minDistance, c.maxDistance);
    }
    // 실내/토리이의 피치 제한은 스프링암이 천장에 걸리는 것을 막기 위한 3인칭 규칙이다.
    if (!this.isFirstPerson && this.constrainPitch !== null) this.pitch = Math.min(this.pitch, this.constrainPitch);
    const wanted = this.constrainDistance !== null ? Math.min(this.targetDistance, this.constrainDistance) : this.targetDistance;

    // --- 피벗 추적 ---
    this.curDrop = damp(this.curDrop, this.pivotDrop, 8, dt);
    this.tmpPivot.set(targetPos.x, targetPos.y + c.pivotHeight - this.curDrop, targetPos.z);
    if (!this.pivotInit) { this.pivot.copy(this.tmpPivot); this.pivotInit = true; }
    const lagY = grounded ? c.followLag : c.followLag * 0.55; // 공중에선 수직 추적을 느슨하게
    this.pivot.x = damp(this.pivot.x, this.tmpPivot.x, c.followLag, dt);
    this.pivot.z = damp(this.pivot.z, this.tmpPivot.z, c.followLag, dt);
    this.pivot.y = damp(this.pivot.y, this.tmpPivot.y, lagY, dt);

    // 카메라→등 뒤 방향. 3인칭에서는 피벗에서 카메라로, 1인칭에서는 이 벡터의 반대가 시선이다.
    const cp = Math.cos(this.pitch);
    this.tmpDir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    if (this.isFirstPerson) {
      // 미오(1.62 m)의 실제 눈높이. 웅크리면 3인칭 피벗과 같은 curDrop 만큼 같이 내려간다.
      this.camera.position.set(targetPos.x, targetPos.y + c.firstPersonEyeHeight - this.curDrop, targetPos.z);
      this.tmpPos.copy(this.camera.position).sub(this.tmpDir);
      this.camera.lookAt(this.tmpPos);
    } else {
      // 어깨 오프셋(카메라 우측 방향으로 피벗을 살짝 이동)
      this.tmpRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const pivotOff = this.tmpPos.copy(this.pivot).addScaledVector(this.tmpRight, c.shoulderOffset);

      // --- 3인칭 카메라 충돌 ---
      let allowed = wanted;
      const hit = this.physics.world.castShape(
        pivotOff, { x: 0, y: 0, z: 0, w: 1 }, this.tmpDir, this.ball,
        0, wanted, true,
        undefined, undefined, undefined, this.excludeBody,
      );
      // Collision clearance takes precedence over the preferred minimum distance.
      // A near wall must never push the camera beyond the obstruction.
      if (hit) allowed = Math.min(wanted, Math.max(0, hit.time_of_impact - 0.05));
      const lambda = allowed < this.distance ? c.collisionPullSpeed : c.collisionReleaseSpeed;
      this.distance = Math.min(allowed, damp(this.distance, allowed, Math.max(lambda, c.zoomLag), dt));

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
    }
    if (this.returnT > 0) {
      this.returnT = Math.max(0, this.returnT - dt);
      const t = 1 - this.returnT / 0.55, blend = t * t * (3 - 2 * t);
      this.camera.position.lerp(this.returnPosition, 1 - blend);
      this.camera.quaternion.slerp(this.returnRotation, 1 - blend);
    }
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
    const targetFov = (this.isFirstPerson ? c.firstPersonFov : c.baseFov) + c.runFovBoost * t * t;
    this.fov = damp(this.fov, targetFov, c.fovLag, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
