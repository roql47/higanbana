import * as THREE from 'three';
import { Props } from '@/world/props';
import { settings } from '@/core/settings';
import { damp, dampAngle } from '@/core/math';
import type { Physics } from '@/core/physics';
import type { VillageGround } from '@/world/village/ground';
import { NavGrid } from './navgrid';
import { findPath } from './astar';
import { Senses } from './senses';

export type HunterState = 'PATROL' | 'INVESTIGATE' | 'CHASE' | 'SEARCH' | 'GRAB';

export interface HunterEvents {
  /** CHASE 진입(발각) */
  onSpotted?: () => void;
  /** CHASE 종료(놓침) */
  onLost?: () => void;
  /** 플레이어 접촉 — 사망 연출 시작 */
  onGrab?: () => void;
}

export interface HunterOptions {
  url: string;
  height: number;       // m (팔척귀신 2.4)
  spawn: THREE.Vector3;
  patrolAnchors: THREE.Vector3[];
  events?: HunterEvents;
}

/**
 * 요괴 추격자 — 팔척귀신(H2)·여우 요괴(H3 재사용).
 *
 * 상태머신: PATROL → (소음)INVESTIGATE → (목격)CHASE → (시야 3 s 끊김)SEARCH → PATROL
 * 공정성: 플레이어 위치는 Senses.canSee / 소음 이벤트를 통해서만 안다.
 * 자비: 발견 직후 1.2 s 는 가속하지 않는다.
 *
 * 이동은 물리 바디 없이 지형 높이를 따라간다 — 통행 판정은 NavGrid 가 담당.
 * "걸음이 어긋나는" 으스스함: 재생 속도 저주파 요동 + 이따금 0.12 s 멈칫.
 */
export class Hunter {
  readonly root = new THREE.Group();
  readonly position = new THREE.Vector3();
  yaw = 0;
  state: HunterState = 'PATROL';
  /** 마지막 목격/소음 지점 */
  private target = new THREE.Vector3();
  private path: THREE.Vector3[] = [];
  private pathI = 0;
  private repathT = 0;
  private stateT = 0;
  private loseT = 0;
  private mercyT = 0;
  private anchorI = 0;

  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private speed = 0;
  private jitterT = 0;
  private jitterMul = 1;
  private freezeT = 0;

  private facing = new THREE.Vector3(0, 0, 1);
  private eye = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  loaded = false;

  constructor(
    private physics: Physics,
    private ground: VillageGround,
    private grid: NavGrid,
    readonly senses: Senses,
    private opts: HunterOptions,
  ) {
    this.position.copy(opts.spawn);
    this.root.name = 'hunter';
    void this.load();
  }

  private async load() {
    const gltf = await Props.loader().loadAsync(this.opts.url);
    const inner = gltf.scene;
    // 정규화: 목표 신장, 발바닥 원점, 정면 +X → +Z
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const s = this.opts.height / Math.max(0.01, size.y);
    inner.scale.setScalar(s);
    inner.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    inner.rotation.y = 0;
    const wrap = new THREE.Group();
    wrap.add(inner);
    wrap.rotation.y = -Math.PI / 2; // Tripo 정면 +X → +Z
    this.root.add(wrap);
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
    });
    this.mixer = new THREE.AnimationMixer(inner);
    for (const clip of gltf.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }
    // 애니메이션 좌표계 보정 (주인공과 동일한 문제): Tripo 클립은 Hip 을 원점에 두므로
    // 바인드 포즈로 잰 오프셋 그대로 재생하면 몸이 내려가 하반신이 땅에 묻힌다.
    // idle 첫 프레임을 적용해 스킨 바운딩박스로 발바닥·중심을 다시 맞춘다.
    {
      const idle = this.actions.get('idle');
      let sk: THREE.SkinnedMesh | null = null;
      inner.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) sk = o as THREE.SkinnedMesh; });
      if (idle && sk) {
        const skinned = sk as THREE.SkinnedMesh;
        idle.reset().play();
        idle.time = 0;
        this.mixer.update(0);
        this.root.updateMatrixWorld(true);
        skinned.computeBoundingBox(); // 스키닝 적용된 로컬 바운딩박스
        const toInnerChild = new THREE.Matrix4().copy(inner.matrixWorld).invert().multiply(skinned.matrixWorld);
        const pb = skinned.boundingBox!.clone().applyMatrix4(toInnerChild);
        const c = pb.getCenter(new THREE.Vector3());
        inner.position.set(-c.x * s, -pb.min.y * s, -c.z * s);
        idle.stop();
        console.info('[hunter] calibrated offset by idle', { posedMinY: +pb.min.y.toFixed(3), posedH: +(pb.max.y - pb.min.y).toFixed(2) });
      }
    }
    this.play('idle', 0);
    this.loaded = true;
    console.info('[hunter] loaded', this.opts.url, 'clips:', gltf.animations.map((c) => c.name));
  }

  private play(name: string, fade = 0.35) {
    if (this.current === name || !this.actions.has(name)) return;
    const next = this.actions.get(name)!;
    const prev = this.actions.get(this.current);
    next.reset().play();
    if (prev) { next.crossFadeFrom(prev, fade, false); }
    this.current = name;
  }

  /** 플레이어를 붙잡는 데 성공했는가 (사망 연출 중 이동 정지용) */
  get grabbed() { return this.state === 'GRAB'; }

  reset(pos?: THREE.Vector3) {
    this.position.copy(pos ?? this.opts.spawn);
    this.setState('PATROL');
    this.path = [];
    this.speed = 0;
  }

  private setState(s: HunterState) {
    if (this.state === s) return;
    const wasChase = this.state === 'CHASE';
    this.state = s;
    this.stateT = 0;
    this.repathT = 0;
    if (s === 'CHASE') { this.mercyT = settings.ai.mercyTime; this.opts.events?.onSpotted?.(); }
    if (wasChase && s !== 'GRAB') this.opts.events?.onLost?.();
    if (s === 'GRAB') this.opts.events?.onGrab?.();
  }

  /** @param playerPos 판정에만 쓴다(직접 추적 금지) @param playerMoving 이동 중 여부 @param playerSpeed 수평 속도 */
  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number) {
    if (!this.loaded) return;
    const ai = settings.ai;
    this.stateT += dt;
    this.eye.copy(this.position).add(this.tmp.set(0, this.opts.height * 0.9, 0));
    const playerMoving = playerSpeed > 0.3;
    const seen = this.state !== 'GRAB' && this.senses.canSee(this.eye, this.facing, playerPos, playerMoving);
    const dist = this.position.distanceTo(playerPos);

    // --- 전이 ---
    switch (this.state) {
      case 'PATROL': {
        if (seen) { this.setState('CHASE'); break; }
        const n = this.senses.loudestNoise(this.eye);
        if (n) { this.target.copy(n.pos); this.setState('INVESTIGATE'); break; }
        if (this.path.length === 0 || this.pathI >= this.path.length) this.nextAnchor();
        break;
      }
      case 'INVESTIGATE': {
        if (seen) { this.setState('CHASE'); break; }
        const n = this.senses.loudestNoise(this.eye);
        if (n && n.pos.distanceTo(this.target) > 3) { this.target.copy(n.pos); this.repathT = 0; }
        if (this.stateT > ai.investigateTime) this.setState('PATROL');
        break;
      }
      case 'CHASE': {
        this.mercyT = Math.max(0, this.mercyT - dt);
        if (seen) { this.loseT = 0; this.target.copy(playerPos); }
        else {
          this.loseT += dt;
          if (this.loseT > ai.loseSightTime) { this.setState('SEARCH'); break; }
        }
        if (dist < ai.grabDistance) { this.setState('GRAB'); break; }
        break;
      }
      case 'SEARCH': {
        if (seen) { this.setState('CHASE'); break; }
        const n = this.senses.loudestNoise(this.eye);
        if (n) { this.target.copy(n.pos); this.repathT = 0; this.stateT = Math.min(this.stateT, settings.ai.searchTime - 4); }
        if (this.stateT > ai.searchTime) this.setState('PATROL');
        break;
      }
      case 'GRAB':
        this.speed = damp(this.speed, 0, 12, dt);
        break;
    }

    // --- 이동 ---
    let wantSpeed = 0;
    if (this.state === 'PATROL') wantSpeed = ai.patrolSpeed;
    else if (this.state === 'INVESTIGATE') wantSpeed = ai.patrolSpeed * 1.35;
    else if (this.state === 'SEARCH') wantSpeed = ai.patrolSpeed * 1.2;
    else if (this.state === 'CHASE') wantSpeed = this.mercyT > 0 ? ai.patrolSpeed : ai.chaseSpeed;

    if (this.state !== 'GRAB') {
      this.repathT -= dt;
      if (this.repathT <= 0) {
        this.repathT = this.state === 'CHASE' ? 0.7 : 1.6;
        const goal = this.state === 'PATROL'
          ? (this.path[this.path.length - 1] ?? this.target)
          : this.target;
        const p = findPath(this.grid, this.position, goal);
        if (p && p.length) { this.path = p; this.pathI = 0; }
      }
      // 근접 직진: 추격 중 목표(마지막 목격 지점)가 가까우면 격자 경로 대신 직진한다.
      // 경로 웨이포인트는 셀 중심(1.5 m)이라 최종 셀 중심이 잡기 거리(1.15 m) 밖이면
      // "코앞까지 와놓고 멈춰 서는" 버그가 된다 — 플레이어가 셀 구석에 있을 때 간헐 발생 (2026-08-19 수정)
      this.tmp.set(this.target.x - this.position.x, 0, this.target.z - this.position.z);
      const dTarget = this.tmp.length();
      if (this.state === 'CHASE' && (dTarget < 5 || this.pathI >= this.path.length)) {
        if (dTarget > 0.25) {
          const targetYaw = Math.atan2(this.tmp.x, this.tmp.z);
          this.yaw = dampAngle(this.yaw, targetYaw, 8, dt);
          this.speed = damp(this.speed, wantSpeed, 3.5, dt);
          this.position.x += Math.sin(this.yaw) * this.speed * dt;
          this.position.z += Math.cos(this.yaw) * this.speed * dt;
        } else {
          this.speed = damp(this.speed, 0, 8, dt); // 마지막 목격 지점 도착 — 시야 없으면 SEARCH 로 넘어간다
        }
      } else if (this.pathI < this.path.length) {
        // 웨이포인트 따라가기
        const wp = this.path[this.pathI]!;
        this.tmp.set(wp.x - this.position.x, 0, wp.z - this.position.z);
        const d = this.tmp.length();
        if (d < 0.7) this.pathI++;
        else {
          const targetYaw = Math.atan2(this.tmp.x, this.tmp.z);
          this.yaw = dampAngle(this.yaw, targetYaw, this.state === 'CHASE' ? 7 : 4, dt);
          this.speed = damp(this.speed, wantSpeed, 3.5, dt);
          this.position.x += Math.sin(this.yaw) * this.speed * dt;
          this.position.z += Math.cos(this.yaw) * this.speed * dt;
        }
      } else {
        this.speed = damp(this.speed, 0, 6, dt);
      }
    }
    this.position.y = this.ground.heightAt(this.position.x, this.position.z);
    this.facing.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));

    // --- 표현 ---
    this.root.position.copy(this.position);
    this.root.rotation.y = this.yaw;
    // 걸음 어긋남: 저주파 요동 + 이따금 멈칫
    this.jitterT -= dt;
    if (this.jitterT <= 0) {
      this.jitterT = 0.25 + Math.random() * 0.5;
      const j = settings.ai.gaitJitter;
      this.jitterMul = 1 - j * 0.5 + Math.random() * j;
      if (Math.random() < 0.06 && this.state !== 'CHASE') this.freezeT = 0.12 + Math.random() * 0.1;
    }
    if (this.freezeT > 0) this.freezeT -= dt;
    const anim = this.speed < 0.15 ? 'idle' : this.speed < 2.0 ? 'walk' : 'run';
    this.play(anim, this.state === 'CHASE' ? 0.15 : 0.4);
    if (this.mixer) {
      const clipRef = anim === 'run' ? 3.0 : anim === 'walk' ? 1.0 : 1;
      const ts = anim === 'idle' ? 1 : Math.max(0.3, this.speed / clipRef);
      this.mixer.timeScale = (this.freezeT > 0 ? 0 : ts * this.jitterMul);
      this.mixer.update(dt);
    }
  }

  private nextAnchor() {
    const anchors = this.opts.patrolAnchors;
    if (!anchors.length) return;
    // 같은 앵커 반복 방지 + 무작위
    this.anchorI = (this.anchorI + 1 + Math.floor(Math.random() * (anchors.length - 1))) % anchors.length;
    this.target.copy(anchors[this.anchorI]!);
    const p = findPath(this.grid, this.position, this.target);
    if (p && p.length) { this.path = p; this.pathI = 0; }
  }
}
