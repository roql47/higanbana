import * as THREE from 'three';
import type { CharacterController } from './controller';
import type { CharacterModel } from './model';
import { settings } from '@/core/settings';
import { clamp } from '@/core/math';

export type LocoState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'variation';

export interface AnimEvents {
  onFootstep?: (foot: 'L' | 'R', speed: number) => void;
  onJump?: () => void;
  onLand?: (impact: number) => void;
}

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
  private footL: THREE.Object3D | null = null;
  private footR: THREE.Object3D | null = null;
  private footDownL = false;
  private footDownR = false;
  private footCooldownL = 0;
  private footCooldownR = 0;
  private tmp = new THREE.Vector3();
  private inv = new THREE.Matrix4();

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
    this.model.headPitchTarget = !ctrl.grounded ? hc.headPitchAir : this.state === 'run' ? hc.headPitchRun : this.state === 'walk' ? hc.headPitchWalk : hc.headPitchIdle;
    this.model.spinePitchTarget = !ctrl.grounded ? hc.spinePitchAir : this.state === 'run' ? hc.spinePitchRun : this.state === 'walk' ? hc.spinePitchWalk : hc.spinePitchIdle;
    // 속도 동기화
    if (this.state === 'walk') this.model.setTimeScale('walk', clamp(speed / a.walkClipSpeed, 0.6, 2.0));
    else if (this.state === 'run') this.model.setTimeScale('run', clamp(speed / a.runClipSpeed, 0.6, 1.8));

    // 발 접지 이벤트 (발목 본의 루트 기준 높이가 임계 아래로 내려오는 순간)
    if ((this.state === 'walk' || this.state === 'run') && ctrl.grounded) {
      const thr = this.state === 'walk' ? a.footContactWalk : a.footContactRun;
      this.footCooldownL -= dt; this.footCooldownR -= dt;
      this.inv.copy(this.model.root.matrixWorld).invert();
      const check = (foot: THREE.Object3D | null, side: 'L' | 'R') => {
        if (!foot) return;
        foot.getWorldPosition(this.tmp).applyMatrix4(this.inv);
        const down = this.tmp.y < thr;
        const was = side === 'L' ? this.footDownL : this.footDownR;
        const cd = side === 'L' ? this.footCooldownL : this.footCooldownR;
        if (down && !was && cd <= 0) {
          this.events.onFootstep?.(side, speed);
          if (side === 'L') this.footCooldownL = 0.18; else this.footCooldownR = 0.18;
        }
        if (side === 'L') this.footDownL = down; else this.footDownR = down;
      };
      check(this.footL, 'L');
      check(this.footR, 'R');
    } else {
      this.footDownL = this.footDownR = true; // 다음 접지부터 다시 감지
    }
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
