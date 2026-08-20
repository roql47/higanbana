import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '@/core/physics';
import { settings } from '@/core/settings';
import { damp, dampAngle } from '@/core/math';

export interface MoveInput {
  /** 카메라 기준 로컬 축 (-1..1): x 우측+, y 전방+ */
  axis: { x: number; y: number };
  cameraYaw: number; // rad — 카메라가 바라보는 수평 방향
  walk: boolean;
  /** 웅크림 — 최우선 속도(0.9 m/s), 소음·감지 축소는 호출부가 처리 */
  crouch?: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export const CAPSULE_RADIUS = 0.35;
export const CAPSULE_HALF_HEIGHT = 0.5; // 원통부 절반 → 전체 높이 1.7
const CENTER_Y = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS;

/**
 * Rapier KinematicCharacterController 기반 캐릭터. 중력/점프/가속은 직접 처리.
 * `position` 은 발바닥 위치(월드). 애니메이션·메시는 이 위치와 `yaw` 를 따라간다.
 */
export class CharacterController {
  readonly position = new THREE.Vector3(); // 발바닥
  readonly velocity = new THREE.Vector3(); // 의도 속도
  readonly actualVelocity = new THREE.Vector3(); // 충돌 해결 후 실제 속도
  yaw = Math.PI; // 바라보는 방향 (facing = (sin yaw, 0, cos yaw)). 시작은 카메라 반대(-Z)
  grounded = false;
  /** 시각 피드백용 신호 */
  landImpact = 0; // 착지 시 낙하 속도(m/s), 이후 소비자가 감쇠
  justJumped = false;
  justLanded = false;
  readonly moveDir = new THREE.Vector3(); // 입력 방향(월드), 길이 0..1
  readonly accel = new THREE.Vector3(); // 이번 프레임 수평 가속(기울임 표현용)

  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  ctrl: RAPIER.KinematicCharacterController;
  private timeSinceGrounded = 0;
  private jumpBufferTimer = Infinity;
  private jumping = false;
  private jumpCutApplied = false;

  constructor(private physics: Physics, spawn: THREE.Vector3) {
    const R = physics.R;
    this.position.copy(spawn);
    this.body = physics.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + CENTER_Y, spawn.z),
    );
    this.collider = physics.world.createCollider(
      R.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS).setFriction(0),
      this.body,
    );
    this.ctrl = this.buildController();
  }

  private buildController() {
    const p = settings.physics;
    const ctrl = this.physics.world.createCharacterController(p.controllerOffset);
    ctrl.setUp({ x: 0, y: 1, z: 0 });
    ctrl.setSlideEnabled(true);
    if (p.autostepHeight > 0) ctrl.enableAutostep(p.autostepHeight, p.autostepMinWidth, true);
    else ctrl.disableAutostep();
    ctrl.setMaxSlopeClimbAngle(p.maxSlopeClimb * (Math.PI / 180));
    ctrl.setMinSlopeSlideAngle(p.minSlopeSlide * (Math.PI / 180));
    if (p.snapToGround > 0) ctrl.enableSnapToGround(p.snapToGround);
    else ctrl.disableSnapToGround();
    ctrl.setApplyImpulsesToDynamicBodies(true);
    return ctrl;
  }

  /** settings.physics 변경 후 Rapier 컨트롤러 재생성 */
  reconfigure() {
    this.physics.world.removeCharacterController(this.ctrl);
    this.ctrl = this.buildController();
  }

  private tmpDesired = { x: 0, y: 0, z: 0 };
  private tmpMoved = new THREE.Vector3();
  private prevHVel = new THREE.Vector3();

  update(dt: number, input: MoveInput) {
    const m = settings.movement;
    this.justJumped = false;
    this.justLanded = false;

    // --- 입력 → 월드 이동 방향 (카메라 yaw 기준) ---
    const fx = -Math.sin(input.cameraYaw), fz = -Math.cos(input.cameraYaw); // 카메라 전방(수평)
    const rx = Math.cos(input.cameraYaw), rz = -Math.sin(input.cameraYaw); // 카메라 우측
    this.moveDir.set(fx * input.axis.y + rx * input.axis.x, 0, fz * input.axis.y + rz * input.axis.x);
    const inputLen = Math.min(1, this.moveDir.length());
    if (inputLen > 1e-4) this.moveDir.divideScalar(this.moveDir.length());

    // --- 수평 속도: 목표 속도로 지수 수렴 ---
    const maxSpeed = input.crouch ? m.crouchSpeed : input.walk ? m.walkSpeed : m.runSpeed;
    const targetVx = this.moveDir.x * inputLen * maxSpeed;
    const targetVz = this.moveDir.z * inputLen * maxSpeed;
    const curSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const targetSpeed = inputLen * maxSpeed;
    let lambda: number;
    if (this.grounded) lambda = targetSpeed > curSpeed - 1e-3 ? m.accelGround : m.decelGround;
    else lambda = m.accelAir;
    const airScale = this.grounded ? 1 : m.airControl;
    this.prevHVel.set(this.velocity.x, 0, this.velocity.z);
    this.velocity.x = damp(this.velocity.x, targetVx, lambda * airScale, dt);
    this.velocity.z = damp(this.velocity.z, targetVz, lambda * airScale, dt);
    this.accel.set((this.velocity.x - this.prevHVel.x) / dt, 0, (this.velocity.z - this.prevHVel.z) / dt);

    // --- 바라보는 방향: 입력이 있으면 그쪽으로 회전 ---
    if (inputLen > 0.05) {
      const targetYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
      this.yaw = dampAngle(this.yaw, targetYaw, m.turnSpeed, dt);
    }

    // --- 점프 (코요테 타임 + 입력 버퍼 + 점프 컷) ---
    this.timeSinceGrounded = this.grounded ? 0 : this.timeSinceGrounded + dt;
    this.jumpBufferTimer = input.jumpPressed ? 0 : this.jumpBufferTimer + dt;
    const canCoyote = this.timeSinceGrounded <= m.coyoteTime && !this.jumping;
    if (this.jumpBufferTimer <= m.jumpBuffer && (this.grounded || canCoyote)) {
      this.velocity.y = Math.sqrt(2 * m.gravity * m.jumpHeight);
      this.grounded = false;
      this.jumping = true;
      this.jumpCutApplied = false;
      this.jumpBufferTimer = Infinity;
      this.timeSinceGrounded = m.coyoteTime + 1;
      this.justJumped = true;
    }
    if (this.jumping && !input.jumpHeld && this.velocity.y > 0 && !this.jumpCutApplied) {
      this.velocity.y *= m.jumpCutMultiplier;
      this.jumpCutApplied = true;
    }

    // --- 중력 ---
    if (this.grounded && !this.jumping) this.velocity.y = -m.groundStick; // 바닥에 살짝 붙임(경사 내려갈 때 붕 뜨지 않게)
    else this.velocity.y -= m.gravity * dt;
    if (this.velocity.y < -40) this.velocity.y = -40;

    // --- Rapier 캐릭터 컨트롤러로 충돌 해결 ---
    this.tmpDesired.x = this.velocity.x * dt;
    this.tmpDesired.y = this.velocity.y * dt;
    this.tmpDesired.z = this.velocity.z * dt;
    // 외부 밀치기 (한 프레임 소비)
    this.tmpDesired.x += this.externalPush.x * dt;
    this.tmpDesired.z += this.externalPush.z * dt;
    this.externalPush.set(0, 0, 0);
    this.ctrl.computeColliderMovement(this.collider, this.tmpDesired);
    const mv = this.ctrl.computedMovement();
    this.tmpMoved.set(mv.x, mv.y, mv.z);
    const wasGrounded = this.grounded;
    this.grounded = this.ctrl.computedGrounded();

    // 천장에 막힘 → 상승 정지
    if (this.velocity.y > 0 && this.tmpMoved.y < this.tmpDesired.y - 1e-4) this.velocity.y = 0;
    // 실제 이동 속도(벽에 막히면 0에 가까움) — 애니메이션/HUD 는 이 값을 쓴다. `velocity` 는 의도 속도.
    this.actualVelocity.set(this.tmpMoved.x / dt, this.tmpMoved.y / dt, this.tmpMoved.z / dt);
    // 벽에 세게 막힌 경우에만 의도 속도를 깎아 벽에서 돌아설 때 관성이 남지 않게 함
    {
      const dvx = this.velocity.x, dvz = this.velocity.z;
      const dLen = Math.hypot(dvx, dvz);
      if (dLen > 0.5) {
        const along = (this.actualVelocity.x * dvx + this.actualVelocity.z * dvz) / dLen; // 의도 방향 성분
        if (along < dLen * 0.5) {
          const k = Math.max(0, along) / dLen;
          if (import.meta.env.DEV) {
            const dbg = (window as unknown as { __dbg?: { blocks?: unknown[] } }).__dbg;
            dbg?.blocks?.push({ dt, desired: { ...this.tmpDesired }, moved: this.tmpMoved.toArray(), pos: this.position.toArray(), grounded: this.grounded, wasGrounded });
          }
          this.velocity.x *= k; this.velocity.z *= k;
        }
      }
    }

    // 착지
    if (this.grounded && !wasGrounded) {
      this.landImpact = Math.max(0, -this.velocity.y);
      this.justLanded = true;
      this.jumping = false;
    }
    if (this.grounded) this.jumping = false;
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;

    // 위치 갱신
    const t = this.body.translation();
    const nx = t.x + this.tmpMoved.x, ny = t.y + this.tmpMoved.y, nz = t.z + this.tmpMoved.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.position.set(nx, ny - CENTER_Y, nz);
  }

  /** 낙사 방지 등 강제 이동 */
  /** 외부 밀치기(도로타보 등): 다음 update 에서 이동량에 더해진다 */
  readonly externalPush = new THREE.Vector3();

  teleport(p: THREE.Vector3) {
    this.body.setTranslation({ x: p.x, y: p.y + CENTER_Y, z: p.z }, true);
    this.position.copy(p);
    this.velocity.set(0, 0, 0);
  }

  /** 실제 수평 속도 (벽에 막히면 0) */
  get horizontalSpeed() { return Math.hypot(this.actualVelocity.x, this.actualVelocity.z); }
}
