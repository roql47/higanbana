import * as THREE from 'three';
import type { CharacterModel } from './model';
import type { CharacterController } from './controller';
import type { Equipment } from './equipment';
import type { Hittable } from '@/world/dummies';
import type { ItemDef } from '@/items/items';
import { ProceduralAttack, COMBO } from './proceduralAttack';
import { settings } from '@/core/settings';

export interface CombatEvents {
  onSwing?: (comboIndex: number) => void;
  onHit?: (target: Hittable, damage: number, point: THREE.Vector3, comboIndex: number, shake: number, hitstop: number) => void;
  /** 전신 공격 시작/끝 — 애니메이터가 상태를 정리하고 복귀 */
  onFullBodyStart?: () => void;
  onFullBodyEnd?: () => void;
}

/**
 * 근접 공격: 무기 데이터(클립·판정 구간)에 따라 상체 레이어(이동 중) 또는 전신(정지) 으로 클립을 재생하고,
 * 활성 구간 동안 칼날 샘플점과 대상의 거리로 판정. 스윙당 대상 1회.
 */
export class Combat {
  private t = -1; // 공격 경과 시간 (-1 = 비활성)
  private weapon: ItemDef | null = null;
  private hitSet = new Set<Hittable>();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private prevBlade: THREE.Vector3[] | null = null; // 직전 프레임 칼날 샘플 (스윕 판정용)
  private lastAttackAt = -99;
  targets: Hittable[] = [];
  /** 이동 속도 배율 (공격 중 감속) */
  moveScale = 1;

  private slash: ProceduralAttack;
  /** 콤보 진행 (0=1타, 1=2타, 2=3타). 다음 타 대기 시간 */
  comboIndex = 0;
  private comboTimer = -1; // 타가 끝난 뒤 흐른 시간(연결 창)
  private queued = false;
  constructor(private model: CharacterModel, private equipment: Equipment, private events: CombatEvents = {}) {
    this.slash = new ProceduralAttack(model.root);
    model.postPose = (dt) => this.slash.apply(dt, this.yaw);
  }
  private yaw = 0;
  get comboMove() { return this.slash.move; }

  /** 점 p 와 선분 ab 사이 최단 거리 */
  private distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
    this.tmp2.subVectors(b, a);
    const len2 = this.tmp2.lengthSq();
    if (len2 < 1e-8) return p.distanceTo(a);
    let t = ((p.x - a.x) * this.tmp2.x + (p.y - a.y) * this.tmp2.y + (p.z - a.z) * this.tmp2.z) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p.x - (a.x + this.tmp2.x * t), p.y - (a.y + this.tmp2.y * t), p.z - (a.z + this.tmp2.z * t));
  }

  /**
   * 전방 히트박스: 스윙 구간 동안 캐릭터 앞쪽 부채꼴 범위 안의 대상을 맞힌다.
   * (칼날 궤적 판정은 클립마다 칼이 지나는 위치가 제각각이라 신뢰도가 낮아 대체)
   */
  private forwardHits(ctrl: CharacterController, reach: number, radius: number, onHit: (t: Hittable, point: THREE.Vector3) => void) {
    const fx = Math.sin(ctrl.yaw), fz = Math.cos(ctrl.yaw);
    for (const target of this.targets) {
      if (!target.alive || this.hitSet.has(target)) continue;
      const dx = target.position.x - ctrl.position.x;
      const dz = target.position.z - ctrl.position.z;
      const dy = target.position.y - (ctrl.position.y + 1.0);
      const flat = Math.hypot(dx, dz);
      if (flat > reach + radius + target.radius) continue;   // 거리
      if (Math.abs(dy) > 1.2) continue;                       // 높이 차
      const dot = flat > 1e-4 ? (dx * fx + dz * fz) / flat : 1;
      if (dot < 0.35) continue;                               // 전방 ±70°
      this.hitSet.add(target);
      onHit(target, new THREE.Vector3(ctrl.position.x + fx * flat * 0.8, target.position.y, ctrl.position.z + fz * flat * 0.8));
    }
  }

  /**
   * 칼날을 여러 점으로 샘플하고, 직전 프레임 위치와 이은 선분(스윕)으로 판정.
   * 빠른 스윙이 대상을 "건너뛰는" 문제를 막는다. 스윙당 대상 1회.
   */
  private sweepHits(ctrl: CharacterController, reach: number, radius: number, onHit: (t: Hittable, point: THREE.Vector3) => void) {
    const N = 5;
    const cur: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const s = 0.25 + 0.75 * (i / (N - 1));
      cur.push(this.equipment.bladePoint(s * (reach / Math.max(0.01, this.equipment.bladeLength)), new THREE.Vector3()));
    }
    const prev = this.prevBlade;
    for (const target of this.targets) {
      if (!target.alive || this.hitSet.has(target)) continue;
      for (let i = 0; i < N; i++) {
        const d = prev ? this.distToSegment(target.position, prev[i]!, cur[i]!) : target.position.distanceTo(cur[i]!);
        if (d < radius + target.radius) {
          this.hitSet.add(target);
          onHit(target, cur[i]!.clone());
          break;
        }
      }
    }
    this.prevBlade = cur;
    void ctrl;
  }
  /** 공격 상태 초기화 (무기 해제·테스트용) */
  reset() { this.t = -1; this.comboIndex = 0; this.comboTimer = -1; this.queued = false; this.slash.stop(); this.moveScale = 1; this.clipPlaying = false; this.clipFullBody = false; this.model.stopUpper(0); }

  get attacking() { return this.t >= 0 || this.clipPlaying; }
  get sinceLastAttack() { return performance.now() / 1000 - this.lastAttackAt; }

  /** 공격 시도. 무기 없거나 쿨다운이면 무시 */
  tryAttack(ctrl: CharacterController) {
    const w = this.equipment.current;
    if (!w?.weapon || !ctrl.grounded) return false;
    const style = w.weapon.style ?? 'clip-combo';
    if (style === 'clip-combo' && w.weapon.combo && w.weapon.comboClip && this.model.actions.has(w.weapon.comboClip)) {
      this.weapon = w;
      this.yaw = ctrl.yaw;
      this.equipment.setDrawn(true);
      this.lastAttackAt = performance.now() / 1000;
      if (this.clipPlaying) { this.queued = true; return true; }   // 진행 중이면 다음 타 예약
      this.startClipCombo(ctrl, 0);
      return true;
    }
    if (style === 'slash-h' && this.attacking) {
      // 진행 중이면 예약: 스윙이 끝난 뒤(recover) 다음 타로 자동 연결
      this.queued = true;
      return true;
    }
    if (this.attacking && this.t < w.weapon.duration * 0.6) return false; // (클립 방식) 후반부엔 다음 스윙 허용
    this.weapon = w;
    this.t = 0;
    this.hitSet.clear();
    this.equipment.setDrawn(true);
    this.lastAttackAt = performance.now() / 1000;
    this.yaw = ctrl.yaw;
    if ((w.weapon.style ?? 'slash-h') === 'slash-h') {
      // 절차적 전신 콤보: 이동 애니 위에 얹힘(정지/이동 공통)
      this.fullBody = false;
      this.beginMove(ctrl);
      return true;
    }
    const clip = w.weapon.clip;
    const opts = { startAt: w.weapon.clipStart, timeScale: w.weapon.timeScale };
    this.fullBody = ctrl.horizontalSpeed < 0.6;
    if (this.fullBody) {
      // 정지 상태: 전신 원샷 (본 믹서) — 끝나면 onFullBodyEnd 로 애니메이터가 상태 클립 복귀
      this.events.onFullBodyStart?.();
      this.model.play(clip, 0.08, { loop: false, ...opts });
    }
    this.model.playUpper(clip, this.fullBody ? 0.06 : 0.1, opts);
    this.events.onSwing?.(0);
    return true;
  }
  private fullBody = false;

  /** 콤보의 다음 타 시작 (연결 창 안이면 index 증가, 아니면 1타부터) */
  private beginMove(ctrl: CharacterController) {
    const inWindow = this.comboTimer >= 0 && this.comboTimer <= settings.attack.comboWindow;
    this.comboIndex = inWindow ? (this.comboIndex + 1) % COMBO.length : 0;
    const move = COMBO[this.comboIndex]!;
    this.slash.start(move);
    this.t = 0;
    this.hitSet.clear();
    this.queued = false;
    this.comboTimer = -1;
    this.lastAttackAt = performance.now() / 1000;
    // 내딛기: 바라보는 방향으로 속도 임펄스
    const k = settings.attack.stepImpulse;
    ctrl.velocity.x += Math.sin(ctrl.yaw) * move.step * k;
    ctrl.velocity.z += Math.cos(ctrl.yaw) * move.step * k;
    this.events.onSwing?.(this.comboIndex);
  }

  update(dt: number, ctrl: CharacterController) {
    if (this.comboTimer >= 0) { this.comboTimer += dt; if (this.comboTimer > settings.attack.comboWindow) { this.comboTimer = -1; this.comboIndex = 0; } }
    if (this.clipPlaying) { this.updateClipCombo(ctrl); return; }
    if (!this.attacking || !this.weapon?.weapon) { this.moveScale = 1; return; }
    const wd = this.weapon.weapon;
    this.t += dt;
    this.yaw = ctrl.yaw;
    if ((wd.style ?? 'slash-h') === 'slash-h') { this.updateProcedural(dt, ctrl, wd); return; }
    this.moveScale = wd.moveSlow;
    if (this.t >= wd.activeFrom && this.t <= wd.activeTo) {
      // 칼날 3점 샘플
      for (const target of this.targets) {
        if (!target.alive || this.hitSet.has(target)) continue;
        for (const s of [0.35, 0.7, 1.0]) {
          this.equipment.bladePoint(s * (wd.reach / Math.max(0.01, this.equipment.bladeLength)), this.tmp);
          if (this.tmp.distanceTo(target.position) < wd.radius + target.radius) {
            this.hitSet.add(target);
            target.hit(wd.damage, ctrl.position);
            this.events.onHit?.(target, wd.damage, this.tmp.clone(), 0, 0.35, 0.06);
            break;
          }
        }
      }
    }
    if (this.t >= wd.duration) {
      this.t = -1; this.moveScale = 1;
      this.model.stopUpper(0.18);
      if (this.fullBody) this.events.onFullBodyEnd?.();
    }
  }

  // ---------- 클립 콤보 (Mixamo 리타게팅 클립의 구간 재생) ----------
  private clipPlaying = false;
  private clipFullBody = false;
  private hitDoneFor = -1;

  private startClipCombo(ctrl: CharacterController, index: number) {
    const w = this.weapon!.weapon!;
    const steps = w.combo!;
    const clip = w.comboClip!;
    const step = steps[index]!;
    this.comboIndex = index;
    this.hitSet.clear();
    this.hitDoneFor = -1;
    this.prevBlade = null;
    this.queued = false;
    this.comboTimer = -1;
    if (!this.clipPlaying) {
      // 처음 시작: 서 있으면 전신, 이동 중이면 상체 레이어
      this.clipFullBody = ctrl.horizontalSpeed < 0.6;
      const ts = settings.attack.speed;
      if (this.clipFullBody) {
        this.events.onFullBodyStart?.();
        this.model.play(clip, 0.10, { loop: false, startAt: step.from, timeScale: ts });
      }
      this.model.playUpper(clip, this.clipFullBody ? 0.08 : 0.12, { startAt: step.from, timeScale: ts });
      this.clipPlaying = true;
    }
    // 전진 임펄스
    const k = settings.attack.stepImpulse;
    ctrl.velocity.x += Math.sin(ctrl.yaw) * step.step * k;
    ctrl.velocity.z += Math.cos(ctrl.yaw) * step.step * k;
    this.events.onSwing?.(index);
  }

  private clipAction(): THREE.AnimationAction | null {
    const clip = this.weapon?.weapon?.comboClip;
    if (!clip) return null;
    return (this.clipFullBody ? this.model.actions.get(clip) : this.model.getUpperAction(clip)) ?? null;
  }

  private updateClipCombo(ctrl: CharacterController) {
    const w = this.weapon?.weapon;
    const action = this.clipAction();
    if (!w?.combo || !action) { this.endClipCombo(); return; }
    this.yaw = ctrl.yaw;
    this.moveScale = w.moveSlow;
    const step = w.combo[this.comboIndex]!;
    const t = action.time;
    // 판정
    if (t >= step.hitFrom && t <= step.hitTo) {
      this.forwardHits(ctrl, w.reach, w.radius, (target, point) => {
        const dmg = Math.round(w.damage * step.dmg);
        target.hit(dmg, ctrl.position);
        this.events.onHit?.(target, dmg, point, this.comboIndex, step.shake, step.hitstop);
      });
    } else {
      this.prevBlade = null; // 판정 구간 밖에서는 궤적 끊기
    }
    // 구간 끝: 예약이 있으면 그대로 이어서(같은 클립이라 끊김 없음) 다음 타로
    if (t >= step.to) {
      const next = this.comboIndex + 1;
      if (this.queued && next < w.combo.length) { this.startClipCombo(ctrl, next); return; }
      this.endClipCombo();
    }
  }

  private endClipCombo() {
    this.clipPlaying = false;
    this.queued = false;
    this.comboIndex = 0;
    this.moveScale = 1;
    this.model.stopUpper(0.2);
    if (this.clipFullBody) this.events.onFullBodyEnd?.();
    this.clipFullBody = false;
  }

  private updateProcedural(_dt: number, ctrl: CharacterController, wd: NonNullable<ItemDef['weapon']>) {
    const move = this.slash.move!;
    const k = settings.attack.speed;
    this.moveScale = wd.moveSlow;
    const hitFrom = move.hitFrom / k, hitTo = move.hitTo / k;
    if (this.t >= hitFrom && this.t <= hitTo) {
      for (const target of this.targets) {
        if (!target.alive || this.hitSet.has(target)) continue;
        for (const s of [0.35, 0.7, 1.0]) {
          this.equipment.bladePoint(s * (wd.reach / Math.max(0.01, this.equipment.bladeLength)), this.tmp);
          if (this.tmp.distanceTo(target.position) < wd.radius + target.radius) {
            this.hitSet.add(target);
            const dmg = Math.round(wd.damage * move.dmg);
            target.hit(dmg, ctrl.position);
            this.events.onHit?.(target, dmg, this.tmp.clone(), this.comboIndex, move.shake, move.hitstop);
            break;
          }
        }
      }
    }
    const recoverStart = this.slash.recoverStart();
    // 예약된 다음 타: 스윙이 끝나면 즉시 연결(되돌리기 생략)
    if (this.queued && this.t >= recoverStart) { this.comboTimer = 0; this.beginMove(ctrl); return; }
    if (this.t >= this.slash.duration()) {
      this.t = -1; this.moveScale = 1;
      this.comboTimer = 0; // 연결 창 시작
      if (this.comboIndex === COMBO.length - 1) { this.comboTimer = -1; this.comboIndex = 0; } // 3타 후 리셋
    }
  }
}
