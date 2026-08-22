import * as THREE from 'three';
import type { CharacterController } from '@/character/controller';

/**
 * 1인칭 리그 — 과거 시점 전용 (PLAN-STORY 각색 8).
 *
 * 왜 1인칭인가: 프롤로그의 화자는 **여섯 살 미오**다. 3인칭으로 만들면 아역 모델·애니메이션이
 * 필요하고, 무엇보다 "손을 잡힌 채 끌려간다"가 남 얘기가 된다. 눈높이를 1.05 m 로 낮추면
 * 어른(1.6 m)보다 55 cm 아래에서 세상이 보인다 — 그 차이가 프롤로그의 공포다.
 *
 * 이 리그가 하는 일
 *  ① 카메라를 컨트롤러 머리 위치에 놓고 **달리는 몸**을 만든다 (상하 흔들림 + 좌우 롤 + 착지 충격)
 *  ② **잡힌 손**을 *상태로* 들고 있다 — 여기서 그리지는 않는다.
 *     그 손의 임자(사요)는 `story/sayo.ts` 가 그리고 `act1.ts` 가 길 위에 놓는다.
 *     이 리그가 들고 있는 것은 `setTug`·`releaseHand` 같은 **감각 신호**다 — 팔이 당기면
 *     화면이 앞으로 기울고, 손을 놓으면 그 신호가 끊긴다. 미오 자신의 팔은 그리지 않는다:
 *     1인칭에서 자기 팔을 세우면 사요의 팔과 두 번 만나야 하고, 그 접점이 어긋나는 순간
 *     둘 다 가짜가 된다. 화면에 있는 팔은 **언니 것 하나**뿐이다
 *  ③ **뒤를 못 보게 한다** — 시선을 정면에서 일정 각도 이상 돌리면 저항이 걸리고,
 *     `lookBack` 으로 얼마나 돌아봤는지 알려준다. 금기를 시스템으로 만드는 첫 장치다
 */
/**
 * **한 걸음**에 나아가는 거리(m). 걸음 수를 여기서 역산한다(걸음/초 = 속도 / 이 값).
 *
 * 처음엔 2.05 로 뒀는데 그건 **보폭(stride)** 이다 — 전력 질주하는 사람이 *두 발*을 딛고
 * 나아가는 거리. 한 발이 아니라 두 발이므로, 그 값으로 세면 걸음 소리와 화면 흔들림이
 * 정확히 **절반**만 난다(사용자 리포트: 「발걸음 두 번에 한 번만 들린다」).
 * 사요가 화면에 서면서 그 어긋남이 눈에 보이게 됐다 — 언니의 발은 두 번 딛는데 소리는 한 번이었다.
 *
 * 한 걸음은 그 절반이고, 끌려가는 여섯 살은 어른 보폭을 못 쓴다 — 종종거리며 따라간다.
 */
const STRIDE_M = 1.02;
/** 걸음/초 상한. 이 위로는 보폭이 늘어난다 = 발이 땅에 거의 안 닿는다 = 끌려간다 */
const MAX_STEPS = 7.5;

export class FirstPerson {
  active = false;
  /** 바라보는 방향 (컨트롤러 이동 기준으로도 쓰인다) */
  yaw = 0;
  pitch = 0;
  /** 정면(=달리는 방향)으로 삼는 각도. 뒤돌아봄 판정의 기준 */
  forwardYaw = 0;
  /** 0(정면) ~ 1(완전히 뒤) — 뒤돌아본 정도 */
  lookBack = 0;
  /** 시선을 강제로 앞으로 되돌리는 중이면 > 0 (초) */
  private snapT = 0;
  private eye: number;
  private bobT = 0;
  /** 착지 충격 (1 → 0 으로 빠르게 사그라든다) */
  private landKick = 0;
  /** 방금 딛은 발 (−1 왼발 / +1 오른발) — 착지 롤이 그쪽으로 기운다 */
  private landSide = 1;
  /** 손을 잡고 있는가 (그리지는 않는다 — 끌림·놓기 연출의 상태 플래그) */
  private handOn = false;
  private tmp = new THREE.Vector3();
  /** 사요가 끌어당기는 세기 0~1 — 플레이어가 처지면 올라간다 */
  private tug = 0;
  private tugTarget = 0;
  /** 넘어짐 진행(초). 0 이면 안 넘어진 상태 */
  private stumbleT = 0;
  private stumbleDur = 0;
  /** 손을 놓는 중 (0~1). 사요의 손이 미끄러져 빠진다 */
  private releaseT = -1;
  private releaseDur = 1;
  /**
   * 카메라를 **컨트롤러 대신 이 자리**에 둔다 (ACT 2 의 버스 좌석).
   * 앉아 있는 장면은 캐릭터가 걷지 않으므로 물리 캡슐을 따라갈 이유가 없고,
   * 버스는 지형 밖(y +300)에 있어서 컨트롤러를 거기 옮기면 그대로 떨어진다.
   */
  private anchor: THREE.Vector3 | null = null;
  private bobScale = 1;
  /**
   * **발이 닿는 순간** — 카메라가 가장 내려앉는 지점이다.
   *
   * 원래 발소리는 달리기 클립의 발목 높이로 냈는데, 클립 재생 배속이 1.8 배에서 잘려 있어서
   * (`animation.runClipSpeed`) 실제 이동 속도가 그보다 빠른 ACT 1 에서는 소리와 몸이 어긋났다 —
   * 게다가 1인칭에서는 그 몸이 보이지도 않는다. **화면에서 유일하게 보이는 걸음**은 카메라의
   * 상하 흔들림이므로, 소리를 그 위상에 직접 물린다. 그러면 어떤 속도에서도 절대 어긋나지 않는다.
   */
  onStep: ((foot: 'L' | 'R', speed: number) => void) | null = null;
  private stepN = 0;
  /** 시선 저항이 시작되는 각도(라디안). 이 너머로는 마우스가 무거워진다 */
  private resistFrom = 1.15;   // 66°
  private maxTurn = 2.35;      // 135° — 여기서 멈춘다

  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, opts: { eye?: number } = {}) {
    this.eye = opts.eye ?? 1.05;
    // 카메라를 씬 그래프에 넣어야 카메라의 자식(손)이 렌더된다
    if (!camera.parent) scene.add(camera);
  }

  /** 몸 흔들림·손 리듬을 정규화하는 기준 속도(m/s). ACT 1 이 달리기를 올리면 여기도 올라간다 */
  private topSpeed = 3.4;
  /** 장면이 정한 화각. 속도에 따른 확장은 여기에 얹는다 */
  private baseFov = 66;

  /** 달리기 시작 — 이 방향이 "앞"이 된다 */
  begin(forwardYaw: number, topSpeed = 3.4) {
    this.topSpeed = topSpeed;
    this.anchor = null;
    this.bobScale = 1;
    this.stepN = 0;
    this.resistFrom = 1.15;
    this.maxTurn = 2.35;
    this.active = true;
    this.yaw = this.forwardYaw = forwardYaw;
    this.pitch = 0;
    this.lookBack = 0;
    this.bobT = 0;
    this.landKick = 0;
    this.snapT = 0;
    this.tug = this.tugTarget = 0;
    this.stumbleT = this.stumbleDur = 0;
    this.releaseT = -1;
    this.handOn = true;
    this.baseFov = 66;      // 아이 시야 — 넓고 얕다
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  end() {
    this.active = false;
    this.handOn = false;
  }

  /** 손을 잡았는가 / 놓았는가 (그리는 것은 없다 — 끌림 연출이 이 상태를 본다) */
  setHand(v: boolean) {
    this.handOn = v && this.active;
  }
  /** 지금 누군가 손을 잡고 있는가 */
  get holdingHand() { return this.handOn; }

  /**
   * 장면마다 다른 리그 설정. ACT 1(달리는 여섯 살)과 ACT 2(앉아 있는 열여섯)는
   * 같은 1인칭이지만 눈높이·화각·목이 돌아가는 범위가 전부 다르다.
   * @param anchor 주면 카메라가 컨트롤러 대신 이 자리에 앉는다 (매 프레임 갱신해도 된다)
   */
  configure(o: { eye?: number; fov?: number; hand?: boolean; bob?: number; resistFrom?: number; maxTurn?: number; anchor?: THREE.Vector3 | null }) {
    if (o.eye !== undefined) this.eye = o.eye;
    if (o.fov !== undefined) { this.baseFov = o.fov; this.camera.fov = o.fov; this.camera.updateProjectionMatrix(); }
    // 사요는 **잡힌 손과 한 몸**이다 — 손이 없는 장면(ACT 2 의 버스 좌석)에 언니만 남으면 안 된다.
    // `act1.ts` 가 `holdingHand` 를 보고 언니의 팔을 풀고, ACT 1 이 끝나면 통째로 감춘다
    if (o.hand !== undefined) this.setHand(o.hand);
    if (o.bob !== undefined) this.bobScale = o.bob;
    if (o.resistFrom !== undefined) this.resistFrom = o.resistFrom;
    if (o.maxTurn !== undefined) this.maxTurn = o.maxTurn;
    if (o.anchor !== undefined) this.anchor = o.anchor;
  }
  /** 지금 보고 있는 방향에서 정면까지의 각도(라디안, 부호 있음) */
  get offForward() { return wrapPi(this.yaw - this.forwardYaw); }
  /** 위아래 시선 (라디안). ACT 2 의 「고개를 든다」가 이걸 본다 */
  get lookPitch() { return this.pitch; }
  /** 시선을 천천히 어떤 각도로 옮긴다 (강제 연출) */
  steer(dYaw: number, dPitch: number, dt: number, rate = 3) {
    const k = 1 - Math.exp(-dt * rate);
    this.yaw += wrapPi(this.forwardYaw + dYaw - this.yaw) * k;
    this.pitch += (dPitch - this.pitch) * k;
  }

  /** 시선을 강제로 정면으로 되돌린다 — 「보지 마!」 */
  snapForward(dur = 0.55) { this.snapT = dur; }

  /** 앞으로 삼을 방향을 갱신한다 (길이 굽으면 정면도 굽는다) */
  setForward(yaw: number) { this.forwardYaw = yaw; }

  /**
   * **끌린다** — 손을 잡힌 아이는 자기 속도로 달리지 않는다. 플레이어가 처지면 사요가 당기고,
   * 팔이 앞으로 늘어나며 손목이 꺾인다. 0 이면 팔이 느슨하다.
   */
  setTug(v: number) { this.tugTarget = THREE.MathUtils.clamp(v, 0, 1); }
  get tugging() { return this.tug; }

  /**
   * **넘어진다** — 진흙에 발이 미끄러진다. 눈높이가 꺼지고 화면이 기울었다가,
   * 잡힌 손이 위로 채면서 다시 일으켜 세운다. 이 동안 이동은 `moveScale` 로 죽는다.
   */
  stumble(dur = 2.2) {
    if (this.stumbleDur > 0) return;
    this.stumbleT = 0;
    this.stumbleDur = dur;
  }
  get stumbling() { return this.stumbleDur > 0; }
  /** 넘어져 있는 동안 이동 입력을 얼마나 받아들일지 (0 = 못 움직인다) */
  get moveScale() {
    if (this.stumbleDur <= 0) return 1;
    const k = this.stumbleT / this.stumbleDur;
    if (k < FALL + DOWN) return 0;                          // 엎어져 있다
    return THREE.MathUtils.smoothstep(k, FALL + DOWN, 0.86); // 일어나면서 서서히 되찾는다
  }

  /**
   * **손을 놓는다** — 사요의 손가락이 풀리고 손목에서 미끄러져 빠진다.
   * 암전 뒤에 조용히 감추면 「언니……?」가 갑자기 나오지만, 눈앞에서 놓치면 그 대사가 이유를 갖는다.
   */
  releaseHand(dur = 1.0) {
    if (this.releaseT >= 0) return;
    this.releaseT = 0;
    this.releaseDur = dur;
  }

  update(dt: number, mouse: { x: number; y: number }, ctrl: CharacterController, sensitivity = 0.0022) {
    if (!this.active) return;

    // --- 시선 ---
    if (this.snapT > 0) {
      // 강제 복귀 중에는 입력을 무시하고 정면으로 당긴다
      this.snapT -= dt;
      const k = 1 - Math.exp(-dt * 14);
      this.yaw = this.yaw + wrapPi(this.forwardYaw - this.yaw) * k;
      this.pitch += (0 - this.pitch) * k;
    } else {
      // 정면에서 멀어질수록 마우스가 무거워진다 — "돌아보면 안 된다"를 손끝으로 느끼게
      const off = Math.abs(wrapPi(this.yaw - this.forwardYaw));
      const resist = off < this.resistFrom ? 1 : Math.max(0.12, 1 - (off - this.resistFrom) / (this.maxTurn - this.resistFrom));
      this.yaw -= mouse.x * sensitivity * resist;
      this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.y * sensitivity * 0.85, -0.75, 0.6);
      // 한계 각도에서 멈춘다
      const off2 = wrapPi(this.yaw - this.forwardYaw);
      if (Math.abs(off2) > this.maxTurn) this.yaw = this.forwardYaw + Math.sign(off2) * this.maxTurn;
    }
    this.lookBack = THREE.MathUtils.clamp(Math.abs(wrapPi(this.yaw - this.forwardYaw)) / Math.PI, 0, 1);

    // --- 끌림 · 넘어짐 · 손 놓기 ---
    // 당김은 즉시 세지지 않는다 — 팔이 늘어나는 데도 시간이 걸린다
    this.tug += (this.tugTarget - this.tug) * (1 - Math.exp(-dt * 6));
    let dip = 0, tilt = 0, scramble = 0;
    if (this.stumbleDur > 0) {
      this.stumbleT += dt;
      const k = Math.min(1, this.stumbleT / this.stumbleDur);
      if (k < FALL) {
        // ① 발이 미끄러진다 — 눈높이가 **떨어진다**. 감속이 아니라 낙하라 곡선이 가팔라야 한다
        const u = k / FALL;
        dip = u * u * 0.62; tilt = u * u * 0.40;
      } else if (k < FALL + DOWN) {
        // ② 진흙에 엎어져 있다. 손을 짚은 채 몸이 흔들린다
        dip = 0.62; tilt = 0.40;
        scramble = 1;
      } else {
        // ③ 잡힌 손이 채올린다 — 한 번 지나쳤다가(오버슛) 자리를 잡는다
        const u = THREE.MathUtils.smoothstep(k, FALL + DOWN, 0.95);
        dip = 0.62 * (1 - u) - Math.sin(u * Math.PI) * 0.07;
        tilt = 0.40 * (1 - u);
      }
      if (this.stumbleT >= this.stumbleDur) this.stumbleDur = 0;
    }

    // --- 달리는 몸 ---
    const speed = ctrl.horizontalSpeed;
    const run = THREE.MathUtils.clamp(speed / this.topSpeed, 0, 1);
    /**
     * **보폭으로 잠근다.** 전에는 주기가 상수(11.5 rad/s = 0.273 초에 한 걸음)였다.
     * 속도를 아무리 올려도 걸음 수가 그대로라 **보폭이 4.6 m** 가 되고 —
     * 그러면 화면은 걷는 리듬으로 흔들리는데 세상만 빠르게 흐른다. 그게 「뛰는데 걷는 것 같다」의 정체다.
     *
     * 그래서 걸음 수를 속도에서 낸다: 걸음/초 = 속도 / 보폭. 다만 위아래로 **가둔다** —
     * 예전에 여기에 배율을 한 번 더 곱했다가 체감이 배로 뛴 적이 있는데, 그건 상한이 없어서였다.
     * 상한(6 걸음/초)에 닿으면 그때부터는 보폭이 늘어난다: 이 장면의 미오는
     * 원래 **달리는 게 아니라 끌려가고 있다** — 발이 땅에 거의 안 닿는 게 맞다.
     */
    const sps = THREE.MathUtils.clamp(speed / STRIDE_M, 0.7, MAX_STEPS);
    this.bobT += dt * Math.PI * sps;
    // 상하 2배음 + 좌우 1배음 = 사람이 뛰는 리듬. 진폭은 속도에 비례.
    // **위아래가 대칭이면 둥둥 뜬다** — 내려꽂히는 쪽을 깊게, 떠오르는 쪽을 얕게 해야 발이 땅을 친다
    const sy = Math.sin(this.bobT * 2);
    const bobY = (sy < 0 ? sy * 1.35 : sy * 0.72) * 0.055 * run;
    const bobX = Math.cos(this.bobT) * 0.035 * run;
    // 착지 충격 — 걸음마다 한 번씩 카메라를 내리찍고 빠르게 사그라든다.
    // 사인파만으로는 "흔들린다"이지 "친다"가 아니다
    if (this.landKick > 0) this.landKick = Math.max(0, this.landKick - dt * 9);
    const kick = this.landKick * this.landKick;

    // 착지 = bobY 가 최저인 순간(sin = −1) → `bobT*2 + π/2` 가 2π 를 넘을 때마다 한 걸음.
    // 좌우는 그 계수의 홀짝으로 갈린다 — 한 사이클에 한 발씩이라 자연히 번갈아 난다
    if (this.onStep) {
      const n = Math.floor((this.bobT * 2 + Math.PI / 2) / (Math.PI * 2));
      if (n !== this.stepN) {
        // 넘어져 있는 동안에도 **계수는 따라간다.** 소리만 죽이고 계수를 멈추면
        // 일어나는 순간 밀린 한 걸음이 박자 밖에서 터진다(실측: 0.28 초 간격 중에 0.10 이 하나)
        if (run > 0.18 && !this.stumbling) {
          this.onStep(n % 2 === 0 ? 'L' : 'R', speed);
          this.landKick = run;          // 발이 닿았다 — 화면이 한 번 내리꽂힌다
          this.landSide = n % 2 === 0 ? -1 : 1;
        }
        this.stepN = n;
      }
    }
    // 넘어져 버둥거릴 때는 리듬이 없다 — 주기가 다른 두 사인을 겹쳐 불규칙하게 만든다
    const shakeY = scramble * Math.sin(this.bobT * 9.1) * 0.035;
    const shakeR = scramble * Math.sin(this.bobT * 6.3 + 1.1) * 0.06;
    // 착지 롤은 **딛는 발 쪽으로** 기운다 — 좌우가 번갈아야 두 발로 달리는 것으로 읽힌다
    const roll = Math.cos(this.bobT) * 0.028 * run + kick * 0.016 * this.landSide + tilt + shakeR;
    // 끌려가면 상체가 앞으로 기운다. 빠를수록 더 숙인다 — 전력으로 달리는 사람은 고개를 세우지 않는다
    const lean = this.tug * 0.09 + run * 0.035;

    if (this.anchor) this.camera.position.copy(this.anchor);
    else this.camera.position.copy(ctrl.position);
    this.camera.position.y += (this.anchor ? 0 : this.eye) + (bobY - kick * 0.026 - dip + shakeY) * this.bobScale;
    // 좌우 흔들림은 시선 기준 오른쪽으로
    this.tmp.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(bobX * this.bobScale);
    this.camera.position.add(this.tmp);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch - dip * 0.5 - lean);
    this.camera.rotateZ(roll);

    // **화각이 벌어진다.** 1인칭에서 "빠르다"를 만드는 가장 센 신호다 —
    // 시야 가장자리가 뒤로 흘러가는 속도가 곧 체감 속도이므로, 흔들림보다 이쪽이 먼저 읽힌다.
    // 흔들림이 없는 장면(ACT 2 의 버스 좌석)에는 걸지 않는다
    if (this.bobScale > 0) {
      const want = this.baseFov + run * 8;
      const fov = this.camera.fov + (want - this.camera.fov) * (1 - Math.exp(-dt * 3.5));
      if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    }

    /**
     * **손이 빠진다** — 잡고 있던 손이 손목에서 미끄러져 빠진다.
     *
     * 여기서 하는 일은 **상태를 끄는 것**뿐이다. 화면에서 이 순간을 만드는 것은 `act1.ts` 다 —
     * 빗소리가 컷되고, 숨이 멎고, 언니는 그대로 달려 빗속으로 지워지고(`Sayo.setOpacity`),
     * 종이 한 번 울린 뒤 암전된다. 손이 사라지는 건 그 정적 위에서 대사로 확인된다
     * (「언니……?」).
     */
    if (this.releaseT >= 0) {
      this.releaseT += dt;
      if (this.releaseT >= this.releaseDur) { this.handOn = false; this.releaseT = -1; }
    }
  }
}

/**
 * 넘어짐의 세 단계가 전체 길이에서 차지하는 몫.
 * **넘어지는 건 순식간이고 일어나는 건 느리다** — 넘어짐 0.29 s · 엎어져 있음 0.37 s ·
 * 일어남 **1.4 s**(2.2 s 기준). 셋을 같은 비율로 두면 벌떡 일어나는 것처럼 보인다.
 */
const FALL = 0.13;
const DOWN = 0.17;

/** −π..π 로 정규화 */
function wrapPi(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
