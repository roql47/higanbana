import * as THREE from 'three';
import type { Dialogue } from './dialogue';
import type { Sfx } from '@/audio/sfx';
import type { StoneTablet } from '@/world/higasato/tablet';
import type { HigasatoGround } from '@/world/higasato/ground';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { dampAngle } from '@/core/math';

/**
 * ACT 3 「세 가지 금기」 — 게임이 시작되고 **처음 하는 일**이자, 미오가 처음 어기는 금기.
 *
 * 스토리보드는 짧다. 비석을 닦고, 三禁을 읽고, 이름이 불리고, 「……언니?」라고 대답한다.
 * 그런데 마지막 한 줄이 이 게임 전체를 건다 —
 * *플레이어는 아직 모르지만, 미오는 게임 시작 직후 세 번째 금기를 어겼다.*
 *
 * 그래서 이 ACT 의 설계 목표는 하나다: **모르고 어기게 만든다.**
 *   · 「[E] 대답한다」 같은 선택지를 **띄우지 않는다.** 선택지가 뜨는 순간 그건 금기가 아니라 퀴즈다
 *   · 대신 아무 죄 없어 보이는 조작 하나만 남긴다 — **소리 나는 쪽을 돌아보는 것.**
 *     돌아보면 미오가 **한 번의 부름에** 대답하고, 버티면 두 번째 부름 뒤에 대답한다.
 *     어느 쪽이든 대답한다. 플레이어가 한 일은 "돌아본 것"뿐인데 결과는 같다
 *   · 목소리는 **북쪽 참배로 위**에서 온다. 그 길이 곧 피안화가 핀 길이다 —
 *     二와 三이 같은 방향을 가리킨다 (읽자마자 둘 다 어기게 된다)
 *
 * 진행은 시간 기준이다. ACT 1 과 달리 여기서는 **플레이어가 멈춰 있는 것**이 장면이라
 * 거리로 잴 것이 없다.
 *
 * ## 카메라 — 세 번 돈다 (2026-08-21 추가)
 * 이 ACT 는 **보는 장면**인데, 정작 봐야 할 것 세 개가 화면 밖에 있었다:
 * 닦아낸 글자 · 뒤에서 부르는 쪽 · 번지는 얼룩. 셋 다 카메라를 돌려 준다.
 *
 *   ① 낭독  글자 쪽으로 (`face`)  — 다 닦고 나면 카메라가 아무 데나 있다. 읽는 동안 각인을 본다
 *   ② 부름  목소리 쪽으로 (`far`/`near`) — 시선만이 아니라 **몸이 돈다.** 「뒤를 돌아본다」는
 *           카메라가 도는 게 아니라 미오가 도는 것이다. 그리고 그 돎이 곧 대답을 앞당긴다
 *   ③ 목격  다시 글자 쪽으로 — 얼룩은 **번지는 동안** 봐야 사건이 된다.
 *           이미 번진 것을 나중에 보면 그건 결과일 뿐이다
 *
 * 셋 다 **끌기**(`cam.pull`)다 — 마우스는 살아 있고, 버티면 안 돌아간다(ACT 1 의 시선 저항과
 * 같은 문법). 몸은 **걷고 있지 않을 때만** 돌린다: 조작과 싸우면 연출이 아니라 버그로 읽힌다.
 */

export interface Act3Deps {
  tablet: StoneTablet;
  ground: HigasatoGround;
  dialogue: Dialogue;
  sfx: Sfx;
  cam: ThirdPersonCamera;
  /**
   * 미오의 몸 — 컨트롤러를 **참조로** 들고 있는다 (매 프레임 복사하지 않는다).
   * `yaw` 를 직접 쓴다: 이 ACT 는 발이 멈춰 있어서 컨트롤러가 방향을 건드리지 않는 구간이다
   * (컨트롤러는 이동 입력이 있을 때만 yaw 를 돌린다 — `character/controller.ts`).
   */
  body: { position: THREE.Vector3; yaw: number; horizontalSpeed: number };
  /** 화면 붉은 잠식 (0~1) */
  setDread: (v: number) => void;
  /** 금기 三 위반 — flags.answered++ */
  onViolate: () => void;
  onDone: () => void;
}

/** 낭독 구간 비트 (초) — 마지막 줄이 三禁의 세 번째 문장이다 */
interface Beat { at: number; run: (d: Act3Deps, s: Act3) => void }

/** 부름 ① 뒤 몇 초에 무엇이 오는가 */
const CALL2_AT = 3.6;      // 두 번째 부름 (돌아보지 않았을 때만)
const ANSWER_LOOKED = 4.0; // 돌아봤다 — 한 번의 부름에 대답한다
const ANSWER_HELD = 6.6;   // 버텼다 — 두 번째 부름 뒤에 대답한다
/** 이 각도 안에 들어오면 "목소리 쪽을 봤다"로 친다 (±40°) */
const FACING = 0.7;
/** 낭독 중 각인을 보는 카메라 — 끌기 세기(1/s)와 피치(rad). 각인은 눈높이보다 조금 아래다 */
const READ_PULL = 1.7;
const READ_PITCH = 0.12;
/**
 * 각인 쪽으로 돌린 뒤 **옆으로 비껴 주는 각**(rad).
 *
 * 비석을 정면으로 잡으면 미오의 뒤통수가 각인 한가운데를 덮는다 — 카메라가 그의 등 뒤 2.6 m 에
 * 있고 비석은 그로부터 다시 2.6 m 앞이라, 셋이 한 줄에 선다(실제로 그랬다: 三禁의 가운데 줄이
 * 머리에 가렸다). 카메라를 피벗 둘레로 돌리면 **미오는 제자리에 남고 비석만 옆으로 밀린다** —
 * 시차(視差)가 둘을 갈라 준다. 0.45 rad(26°)에서 미오가 왼쪽 1/3, 각인이 화면 가운데 오른쪽에
 * 통째로 선다. 더 돌리면(0.6+) 비석이 화면 끝으로 밀리고, 덜 돌리면 다시 머리에 걸린다.
 *
 * 부호는 **+**: 비석은 참배로 동쪽에 서 있고 플레이어는 길 위(서쪽)에서 읽는다.
 */
const READ_BIAS = 0.45;
/** 이 거리(m) 밖으로 걸어 나가면 낭독 카메라가 손을 뗀다 — 비석은 조사 반경 2.4 m 짜리다 */
const READ_HOLD_M = 7;
/** 몸이 도는 속도(1/s). 낭독 때는 천천히, 뒤를 돌아볼 때는 빠르게 */
const TURN_READ = 2.2;
const TURN_BACK = 3.6;
/**
 * 부름 ① 뒤 **몸이** 돌기 시작하기까지(초). 카메라는 즉시 끌리지만 몸은 반 박자 늦는다 —
 * 소리와 동시에 몸이 돌면 놀란 게 아니라 알고 있었던 것으로 읽힌다.
 */
const TURN_DELAY = 0.45;
/**
 * 대답 → 흔들림 → **시선이 비석으로 돌아오고 나서** 얼룩이 번지기 시작하기까지(초).
 * 0 으로 두면 등 뒤를 보는 동안 얼룩이 다 번져 버리고, 돌아왔을 땐 이미 검다.
 */
const WITNESS_LEAD = 0.75;
/** 얼룩을 다 보고 나서 발이 풀린다 — 번지는 동안 걸어 나가면 목격이 아니다 */
const STAIN_S = 1.4;

export class Act3 {
  private state: 'idle' | 'read' | 'call' | 'done' = 'idle';
  private t = 0;
  private fired = new Set<number>();
  private beats: Beat[];
  /** 부름 ① 이후 경과 */
  private ct = 0;
  private looked = false;
  private answered = false;
  private call2Done = false;
  private stainT = -1;
  /** 대답 뒤 「화면이 아주 짧게 흔들린다」까지 남은 시간. **시뮬 시계**로 센다 —
   *  setTimeout 을 쓰면 결정적 스텝 검증(그리고 탭이 가려진 동안)에서 순서가 어긋난다 */
  private shakeIn = -1;
  private dread = 0;
  /** 이동 배율 — 「미오는 움직임을 멈춘다」 */
  private move = 1;
  private moveTarget = 1;
  private far = new THREE.Vector3();
  private near = new THREE.Vector3();
  /** 각인면 한가운데 — 카메라가 「글자를 본다」고 할 때 보는 점 */
  private face = new THREE.Vector3();
  /** 대답 뒤 시선이 비석으로 돌아와 있는가 (③ 목격) */
  private witnessing = false;
  /** 시선이 돌아오고 나서 얼룩이 번지기 시작할 때까지 남은 시간 */
  private stainIn = -1;

  constructor(private d: Act3Deps) {
    const g = d.ground;
    // 목소리가 나는 자리 — 둘 다 **북쪽 참배로 위**다. 두 번째가 더 가깝다: 다가오고 있다
    const p1 = g.roadAt(g.sAtZ(34)), p2 = g.roadAt(g.sAtZ(58));
    this.far.set(p1.x, g.heightAt(p1.x, p1.z) + 1.6, p1.z);
    this.near.set(p2.x, g.heightAt(p2.x, p2.z) + 1.6, p2.z);
    this.face.copy(d.tablet.facePos);

    this.beats = [
      { at: 0.0, run: (d) => void d.dialogue.say({ text: '이끼를 닦아내자 글자가 드러난다 — 彼ヶ里 三禁.', dur: 2.7 }) },
      { at: 2.9, run: (d) => void d.dialogue.say({ text: '一. 해가 진 뒤 공물을 옮기지 말 것.', dur: 2.8 }) },
      { at: 6.0, run: (d) => void d.dialogue.say({ text: '二. 피안화가 핀 길을 따라가지 말 것.', dur: 2.8 }) },
      // 「미오가 마지막 문장을 읽는 순간」 — 목소리는 이 줄이 **화면에 떠 있는 동안** 온다
      { at: 9.1, run: (d) => void d.dialogue.say({ text: '三. 죽은 자가 이름을 불러도 대답하지 말 것.', dur: 3.4 }) },
      { at: 11.2, run: (_d, s) => s.call1() },
    ];
  }

  /** 비석을 닦는 중 (0~1) — Inspect 의 꾹 누르기가 흘려보낸다 */
  wipe(p: number) {
    this.d.tablet.wipe(p);
    // 손이 닿을 때마다 사각거린다. 진행도에 물려 두면 **손이 계속 움직이는 것처럼** 들린다
    if (p > 0 && p < 1 && Math.random() < 0.22) this.d.sfx.stoneWipe(p);
  }

  /** 다 닦았다 → 낭독 시작 */
  begin() {
    if (this.state !== 'idle') return;
    this.state = 'read';
    this.t = 0;
  }

  get running() { return this.state === 'read' || this.state === 'call'; }
  /** main 이 이동 입력에 곱한다 */
  get moveScale() { return this.move; }
  /** DEV */
  get time() { return this.state === 'call' ? this.ct : this.t; }

  update(dt: number) {
    if (this.state === 'idle' || this.state === 'done') return;
    const d = this.d;
    this.t += dt;
    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i]!;
      if (this.t >= b.at && !this.fired.has(i)) { this.fired.add(i); b.run(d, this); }
    }

    // ① **읽는 동안 글자를 본다.** 닦기가 끝난 시점의 카메라는 등 뒤 아무 데나 있다 —
    //    자막으로 三禁을 읽는데 화면에는 삼나무만 있으면 읽는 장면이 아니다.
    //    낭독 구간은 발이 묶여 있지 않다(부름부터 멈춘다). **비석을 떠나면 손을 뗀다** —
    //    걸어가는 사람의 시선을 11 초 내내 뒤로 잡아당기면 그건 연출이 아니라 고장이다
    if (this.state === 'read' && this.d.body.position.distanceTo(this.face) < READ_HOLD_M) {
      this.lookAt(this.face, dt, READ_PULL, TURN_READ, READ_PITCH, READ_BIAS);
    }

    if (this.state === 'call') {
      this.ct += dt;
      // 시선이 목소리 쪽으로 끌린다. 마우스는 살아 있으므로 **버틸 수 있다**
      const src = this.call2Done ? this.near : this.far;
      const want = ThirdPersonCamera.yawToward(d.body.position, src);
      if (!this.answered) {
        d.cam.pull(want, 1.15, dt);
        // ② **뒤를 돌아본다.** 카메라만 돌면 관객이 돌아본 것이고,
        //    몸이 돌아야 미오가 돌아본 것이다 — 그 돎이 곧 세 번째 금기의 첫 단추다
        if (this.ct > TURN_DELAY) this.turnBody(src, dt, TURN_BACK);
      }
      // 돌아봤는가 — 대답을 앞당기는 유일한 입력
      if (!this.looked && this.ct > 0.6) {
        let dy = want - d.cam.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        if (Math.abs(dy) < FACING) this.looked = true;
      }
      if (!this.answered) {
        if (!this.looked && !this.call2Done && this.ct >= CALL2_AT) this.call2();
        if (this.ct >= (this.looked ? ANSWER_LOOKED : ANSWER_HELD)) this.answer();
      }
      // 대답 → (1.5 초) → 흔들림 · 얼룩
      if (this.shakeIn > 0) {
        this.shakeIn -= dt;
        if (this.shakeIn <= 0) this.recoil();
      }
      // ③ **다시 비석으로.** 등 뒤에는 아무도 없었고, 대답의 값은 앞에 있다.
      //    얼룩이 번지기 시작하기 전에 시선이 돌아와 있어야 **번지는 것**을 본다
      if (this.witnessing && this.stainT < STAIN_S) this.lookAt(this.face, dt, 2.2, TURN_BACK, READ_PITCH, READ_BIAS);
      if (this.stainIn > 0) {
        this.stainIn -= dt;
        if (this.stainIn <= 0) this.spread();
      }
      // 얼룩이 번진다 — 1.4 초에 걸쳐
      if (this.stainT >= 0) {
        const before = this.stainT;
        this.stainT += dt;
        d.tablet.stainTo(Math.min(1, this.stainT / STAIN_S));
        // 다 번지고 나서 발이 풀린다 — 번지는 동안 걸어 나갈 수 있으면 목격이 아니다
        if (before < STAIN_S && this.stainT >= STAIN_S) this.moveTarget = 1;
        if (this.stainT > 4.6 && this.state === 'call') this.finish();
      }
    }

    // 발이 멈추고 풀리는 것 — 멈춤은 빠르게(0.25 s), 풀림은 느리게(0.9 s).
    // 반대로 하면 "얼어붙었다"가 아니라 "조작이 끊겼다"로 읽힌다
    const k = this.moveTarget < this.move ? 12 : 3.2;
    this.move += (this.moveTarget - this.move) * (1 - Math.exp(-k * dt));

    if (this.dread > 0) {
      this.dread = Math.max(0, this.dread - dt * 0.55);
      d.setDread(this.dread);
    }
  }

  /** 첫 부름 — 「미오야.」 멀리서. 여기서 발이 멈춘다 */
  private call1() {
    this.state = 'call';
    this.ct = 0;
    this.moveTarget = 0;
    const d = this.d;
    d.sfx.callName(this.far.x, this.far.y, this.far.z, { far: 1, gain: 0.95 });
    void d.dialogue.say({ who: '???', text: '미오야.', dur: 2.2 });
  }

  /** 두 번째 부름 — 더 가까이. 버틴 플레이어만 듣는다 */
  private call2() {
    this.call2Done = true;
    const d = this.d;
    d.sfx.callName(this.near.x, this.near.y, this.near.z, { far: 0.45, gain: 1.0 });
    void d.dialogue.say({ who: '???', text: '미오야.', dur: 2.2 });
  }

  /** 「……언니?」 — 이 한 줄이 세 번째 금기다 */
  private answer() {
    this.answered = true;
    const d = this.d;
    d.sfx.voice(0.42, 'girl');
    void d.dialogue.say({ who: '미오', text: '……언니?', dur: 2.4 });
    d.onViolate();
    this.shakeIn = 1.5;
  }

  /**
   * 「화면이 아주 짧게 흔들리고, 돌비석의 세 번째 문장에 검은 얼룩이 번진다」
   * — 대답이 끝난 **직후**다. 대답과 동시에 흔들면 놀란 것으로 읽히고,
   * 이 장면은 미오가 놀라는 장면이 아니다. 뒤늦게 세계가 반응한다
   */
  private recoil() {
    if (this.state !== 'call') return;
    const d = this.d;
    d.cam.shake(0.5);
    this.dread = 0.34;
    // 흔들림이 시선을 **비석으로 되돌린다.** 흔들린 뒤 그대로 등 뒤를 보고 있으면
    // 얼룩은 아무도 안 보는 데서 번진다 — 그건 화면에 없는 사건이다
    this.witnessing = true;
    this.stainIn = WITNESS_LEAD;
  }

  /** 시선이 돌아왔다 → 세 번째 문장이 검어지기 시작한다 */
  private spread() {
    if (this.state !== 'call') return;
    this.stainT = 0;
    void this.d.dialogue.say({ text: '비석의 세 번째 문장에 검은 얼룩이 번졌다.', dur: 3.2 });
  }

  /**
   * 시선과 몸을 한 점으로 돌린다 — **카메라가 먼저 가고 몸이 따라온다.**
   * 둘 다 끌기라서 마우스 입력이 그대로 더해진다 (버티면 안 돌아간다).
   */
  private lookAt(p: THREE.Vector3, dt: number, camRate: number, bodyRate: number, pitch?: number, bias = 0) {
    const d = this.d;
    // 몸은 대상을 **정면으로** 본다. 비껴 주는 건 카메라뿐이다 (`READ_BIAS`)
    d.cam.pull(ThirdPersonCamera.yawToward(d.body.position, p) + bias, camRate, dt);
    if (pitch !== undefined) d.cam.pullPitch(pitch, camRate * 0.7, dt);
    this.turnBody(p, dt, bodyRate);
  }

  /**
   * 몸만 돌린다. **걷고 있으면 손대지 않는다** — 컨트롤러는 이동 입력이 있으면 진행 방향으로
   * yaw 를 돌리므로, 여기서 같이 쓰면 한 프레임 걸러 두 방향으로 튄다.
   * 캐릭터 정면은 (sin yaw, 0, cos yaw) 다 (`character/controller.ts`).
   */
  private turnBody(p: THREE.Vector3, dt: number, rate: number) {
    const b = this.d.body;
    if (b.horizontalSpeed > 0.4) return;
    b.yaw = dampAngle(b.yaw, Math.atan2(p.x - b.position.x, p.z - b.position.z), rate, dt);
  }

  private finish() {
    if (this.state === 'done') return;
    this.state = 'done';
    this.moveTarget = 1;
    this.d.setDread(0);
    this.d.onDone();
  }
}
