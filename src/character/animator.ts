import * as THREE from 'three';
import type { CharacterController } from './controller';
import type { CharacterModel } from './model';
import { settings } from '@/core/settings';
import { clamp } from '@/core/math';

export type LocoState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'variation';

export interface AnimEvents {
  onFootstep?: (foot: 'L' | 'R', speed: number, position: THREE.Vector3) => void;
  onJump?: () => void;
  onLand?: (impact: number) => void;
}

type GaitState = 'walk' | 'run';
type FootstepMarker = { phase: number; foot: 'L' | 'R' };

/**
 * `mio.glb` 이동 클립에서 추출한 실제 접지 위상. 두 클립 모두 한 루프에 네 번 디딘다.
 * 발목 높이 임계값은 크로스페이드 중 한쪽 발이 선을 넘지 못하면 이후 소리가 빠졌지만,
 * 위상 마커는 프레임이 건너뛰어도 통과한 모든 접지를 복원한다.
 */
const FOOTSTEP_MARKERS: Record<GaitState, readonly FootstepMarker[]> = {
  walk: [
    { phase: 0.000, foot: 'L' },
    { phase: 0.254, foot: 'R' },
    { phase: 0.506, foot: 'L' },
    { phase: 0.775, foot: 'R' },
  ],
  run: [
    { phase: 0.000, foot: 'R' },
    { phase: 0.233, foot: 'L' },
    { phase: 0.500, foot: 'R' },
    { phase: 0.715, foot: 'L' },
  ],
};

/**
 * 이동 상태 → 클립 선택 + 크로스페이드 + 속도 동기화(발 미끄러짐 억제) + 발 접지 이벤트 + idle 변주.
 * 클립은 in-place 로 받았으므로 재생 속도만 실제 이동 속도에 맞춘다.
 */
export class CharacterAnimator {
  state: LocoState = 'idle';
  /** true 면 상태 클립 전환을 보류 (전신 공격 중) */
  suspended = false;
  private airTime = 0;
  private idleTime = 0;
  private nextVariationAt = 0;
  private footstepState: GaitState | null = null;
  private footstepPhase = 0;
  private footL: THREE.Object3D | null = null;
  private footR: THREE.Object3D | null = null;
  private footWorld = new THREE.Vector3();

  constructor(private model: CharacterModel, private events: AnimEvents = {}) {
    model.root.traverse((o) => {
      if (/^(L_Foot|LeftFoot|mixamorig:LeftFoot)$/.test(o.name)) this.footL = o;
      if (/^(R_Foot|RightFoot|mixamorig:RightFoot)$/.test(o.name)) this.footR = o;
    });
    // 원샷(variation) 종료 → idle 복귀
    model.mixer.addEventListener('finished', (e) => {
      const name = (e as unknown as { action: THREE.AnimationAction }).action.getClip().name;
      if (this.state === 'variation' && name !== 'idle') {
        this.model.play('idle', 0.35);
        this.state = 'idle';
        this.scheduleVariation();
        return;
      }
      // 전신 원샷(공격 등)이 끝났는데 현재 상태 클립이 아니면 상태 클립으로 복귀
      if ((this.state === 'idle' || this.state === 'walk' || this.state === 'run') && name !== this.state) {
        this.model.play(this.state, 0.25);
      }
    });
    this.scheduleVariation();
  }

  /** 전신 공격 시작: 변주 취소, idle 로 간주 */
  interrupt() {
    if (this.state === 'variation') this.state = 'idle';
    this.scheduleVariation();
  }
  /** 전신 공격 종료: 현재 상태 클립으로 복귀 */
  resume() {
    const clip = this.state === 'variation' ? 'idle' : this.state;
    if (clip === 'idle' || clip === 'walk' || clip === 'run' || clip === 'jump' || clip === 'fall') this.model.play(clip, 0.22);
    this.scheduleVariation();
  }

  private scheduleVariation() {
    const a = settings.animation;
    this.idleTime = 0;
    this.nextVariationAt = a.idleVariationMin + Math.random() * (a.idleVariationMax - a.idleVariationMin);
  }

  update(dt: number, ctrl: CharacterController) {
    const a = settings.animation;
    const has = (n: string) => this.model.actions.has(n);
    const speed = ctrl.horizontalSpeed;

    let next: LocoState = this.state;

    if (!ctrl.grounded) {
      this.airTime += dt;
      if (ctrl.justJumped && has('jump')) next = 'jump';
      else if (has('fall') && (ctrl.velocity.y < -0.5 || this.airTime > a.jumpToFallAfter)) next = 'fall';
      // 짧은 낙차(계단 등)는 낙하 애니를 띄우지 않음
      if (next === 'fall' && this.state !== 'jump' && this.airTime < a.fallDelay) next = this.state;
    } else {
      if (this.airTime > 0) { /* 착지 프레임 */ }
      this.airTime = 0;
      if (speed < a.idleThreshold) {
        // idle 유지 중 변주
        if (this.state === 'variation') next = 'variation';
        else {
          next = 'idle';
          this.idleTime += dt;
          if (this.idleTime > this.nextVariationAt) {
            const pool = ['look_around', 'standing_relax'].filter(has);
            if (pool.length) {
              const pick = pool[Math.floor(Math.random() * pool.length)]!;
              this.model.play(pick, 0.4, { loop: false });
              this.state = 'variation';
              return this.postUpdate(dt, ctrl, speed);
            }
            this.scheduleVariation();
          }
        }
      } else if (speed < a.walkRunThreshold) next = 'walk';
      else next = 'run';
      if (next === 'run' && !has('run')) next = 'walk';
      if (next === 'walk' && !has('walk')) next = 'idle';
      if (next !== 'idle' && next !== 'variation') this.scheduleVariation();
    }

    if (ctrl.justJumped) this.events.onJump?.();
    if (ctrl.justLanded) this.events.onLand?.(ctrl.landImpact);

    // 전환 (공격 중에는 상태만 갱신하고 클립은 건드리지 않음)
    if (next !== this.state) {
      if (!this.suspended) {
        const fade = this.fadeFor(this.state, next);
        const oneShot = next === 'jump';
        this.model.play(next, fade, { loop: !oneShot });
      }
      this.state = next;
    }
    this.postUpdate(dt, ctrl, speed);
  }

  private postUpdate(dt: number, ctrl: CharacterController, speed: number) {
    const a = settings.animation;
    // 고개 보정 목표 (상태별)
    const hc = settings.character;
    /**
     * 보정량은 **지금 재생 중인 클립**을 따라간다 — 컨트롤러의 접지 상태가 아니라.
     * 이 값은 클립 자체의 리그 편향을 상쇄하는 상수라, 클립은 그대로인데 보정만 바뀌면
     * 그 차이가 **그대로 자세로 나온다**. 달리다 턱을 넘어 `fallDelay`(0.18 s) 안쪽으로 뜨면
     * 위 상태머신은 run 을 유지하는데(= run 클립 계속 재생), 예전 코드는 `!grounded` 만 보고
     * headPitchAir(0.28)로 내려가 run 원본의 뒤로 젖힌 머리가 **14° 도로 드러났다**.
     */
    const air = this.state === 'jump' || this.state === 'fall';
    this.model.headPitchTarget = air ? hc.headPitchAir : this.state === 'run' ? hc.headPitchRun : this.state === 'walk' ? hc.headPitchWalk : hc.headPitchIdle;
    this.model.spinePitchTarget = air ? hc.spinePitchAir : this.state === 'run' ? hc.spinePitchRun : this.state === 'walk' ? hc.spinePitchWalk : hc.spinePitchIdle;
    // 속도 동기화
    if (this.state === 'walk') this.model.setTimeScale('walk', clamp(speed / a.walkClipSpeed, 0.6, 2.0));
    else if (this.state === 'run') this.model.setTimeScale('run', clamp(speed / a.runClipSpeed, 0.6, 1.8));

  }

  /**
   * 렌더할 포즈가 완성된 뒤 호출한다. 상태·배속을 먼저 결정하고 모델 믹서를 갱신한 다음
   * 같은 프레임의 발 위치로 소리를 내야 발이 땅에 닿는 화면과 임팩트가 어긋나지 않는다.
   */
  updateFootsteps(ctrl: CharacterController) {
    const speed = ctrl.horizontalSpeed;
    const gait: GaitState | null = this.state === 'walk' || this.state === 'run' ? this.state : null;
    if (!gait || !ctrl.grounded || this.model.currentClip !== gait) {
      this.footstepState = null;
      return;
    }

    const action = this.model.actions.get(gait);
    const duration = action?.getClip().duration ?? 0;
    if (!action || duration <= 1e-5) return;

    const phase = ((action.time / duration) % 1 + 1) % 1;
    const from = this.footstepState === gait ? this.footstepPhase : -1e-6;
    const markers = FOOTSTEP_MARKERS[gait];
    // 루프 경계를 넘은 경우에는 끝쪽 마커를 먼저, 시작쪽 마커를 그다음 재생한다.
    const crossed = phase >= from
      ? markers.filter((m) => m.phase > from && m.phase <= phase)
      : [...markers.filter((m) => m.phase > from), ...markers.filter((m) => m.phase <= phase)];
    if (crossed.length) this.model.root.updateWorldMatrix(true, true);
    for (const marker of crossed) {
      const bone = marker.foot === 'L' ? this.footL : this.footR;
      if (bone) bone.getWorldPosition(this.footWorld);
      else this.footWorld.copy(ctrl.position);
      this.events.onFootstep?.(marker.foot, speed, this.footWorld);
    }

    this.footstepState = gait;
    this.footstepPhase = phase;
  }

  private fadeFor(from: LocoState, to: LocoState) {
    const a = settings.animation;
    if (to === 'jump') return a.fadeToJump;
    if (to === 'fall') return a.fadeToFall;
    if (from === 'jump' || from === 'fall') return a.fadeLand;
    if (from === 'variation') return 0.3;
    if ((from === 'idle' && to === 'walk') || (from === 'walk' && to === 'idle')) return a.fadeIdleWalk;
    return a.fadeWalkRun;
  }
}
