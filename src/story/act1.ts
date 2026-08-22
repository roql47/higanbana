import * as THREE from 'three';
import type { Dialogue } from './dialogue';
import type { FirstPerson } from './firstPerson';
import type { Pursuers } from './pursuers';
import type { Sequencer } from './sequencer';
import type { Rain } from '@/world/rain';
import type { Lightning } from '@/world/lightning';
import type { Sfx } from '@/audio/sfx';
import type { Higasato } from '@/world/higasato';
import type { CharacterController } from '@/character/controller';
import type { Sayo } from './sayo';
import { damp } from '@/core/math';

/**
 * ACT 1 「붉은 꽃밭」 — **플레이 가능한** 프롤로그.
 *
 * 처음엔 45초짜리 카메라 스플라인이었다. 그건 스토리보드를 "보여주기"만 한다.
 * 이 ACT 의 문장은 *누군가의 손을 잡고 진흙길을 달리고 있다* 이고, 그건 플레이어가
 * 직접 달려야 성립한다. 그래서 조작을 돌려준다 — 다만 할 수 있는 건 **달리는 것뿐**이다.
 *
 * 장치 일곱
 *  ① 손    **사요가 앞에서 손을 잡고 달린다** (`sayo.ts`). 화면에 있는 것은 언니의 뒷모습과
 *          뒤로 뻗은 왼팔 하나다 — 미오의 팔은 1인칭이라 그리지 않는다. 처지면 팔이 당기고
 *          (`setTug`), 끝에서 그 손이 빠진다(`releaseHand`)
 *  ② 끌림  처지면 팔이 늘어나고 **몸이 앞으로 끌려간다**. 사요가 재촉한다
 *  ③ 추격  뒤의 횃불 무리. 멈추면 붙고 달리면 멀어진다 (`pursuers.ts`)
 *  ④ 숨    여섯 살의 숨소리·심장. 지칠수록 거칠어지고 추격자가 붙을수록 빨라진다
 *  ⑤ 번개  `rainNight` 은 8 m 앞이 안 보인다. 스토리보드의 두 그림 — *끝없는 피안화 길* 과
 *          *멀리 보이는 도리이* — 를 번개가 1/10 초씩 보여주고 지운다 (`world/lightning.ts`)
 *  ⑥ 금기  뒤를 돌아보려 하면 시선이 무거워지고, 끝내 돌아보면 「보지 마!」가 시선을 꺾는다
 *  ⑦ 종    도착하면 모든 소리가 **끊기고**, 잡고 있던 손이 눈앞에서 빠진 뒤 **댕—** 하나만 남는다
 *
 * 진행은 시간이 아니라 **거리**로 센다. 플레이어가 느리게 달려도 대사를 놓치지 않고,
 * 빨리 달려도 대사가 밀리지 않는다.
 */

export interface Act1Deps {
  village: Higasato;
  controller: CharacterController;
  fp: FirstPerson;
  pursuers: Pursuers;
  dialogue: Dialogue;
  sequencer: Sequencer;
  rain: Rain;
  lightning: Lightning;
  sfx: Sfx;
  /** 앞서 달리는 언니. 로드 실패해도 ACT 는 그대로 성립한다 (손은 원래 상태였다) */
  sayo: Sayo | null;
  /** 발밑 소리를 진흙·물로 바꾼다 (참배로 자갈 소리가 나면 안 된다) */
  setSurfaceOverride: (s: 'water' | null) => void;
  /** 화면 붉은 잠식 (추격자 근접도) */
  setDread: (v: number) => void;
}

/** 거리 기반 비트 — s 는 "달리기 시작점에서 몇 m 왔는가" */
interface Beat {
  at: number;
  run: (d: Act1Deps, self: Act1) => void;
}

/** 여섯 살의 성도는 어른보다 짧다 — 숨소리·흐느낌의 공명을 통째로 올린다 */
const CHILD = { rate: 1.55 };
/**
 * 비트 표를 적을 때 기준으로 삼은 길이(m). 실제 `LEN` 은 도리이 위치에서 역산하므로
 * 지형이 바뀌면 달라진다 — 그때 비트가 통째로 밀리지 않게 **비율로 환산**한다.
 */
const NOMINAL = 72;
/**
 * ACT 1 의 달리기 배율. 평소 달리기 3.6 m/s 로는 **목숨 걸고 도망치는 밤**이 산책으로 보인다.
 * ×2.5 = **9.0 m/s**(32.4 km/h) — 사람이 낼 수 있는 최고 속도 근처다. 이 장면의 미오는
 * 달리는 게 아니라 **끌려가고 있으니**(그래서 손이 화면에 있고, 처지면 팔이 늘어난다) 그게 맞다.
 * 추격자 속도·숨·손 리듬·「처졌다」 판정이 전부 이 숫자에서 역산되므로, 여기만 고치면 전부 따라온다.
 *
 * 자막 진행 속도가 이 값을 따라간다(`BEAT_REF`) — 그래서 이 숫자만 고치면 된다.
 *
 * 이력: 2.6 → 4.68(×1.8) 로 올렸다가 **2.5 로 정착**(2026-08-21, 사용자 지시).
 * 올린 이유였던 「느리다」의 실제 원인은 배율이 아니라 **끌기(`TOW`)와 보폭 고정**이었고,
 * 그 둘이 고쳐진 뒤로는 이 배율에서도 도주로 읽힌다. 4.68 은 60 km/h 라 사람이 아니라 차였다.
 *
 * 배속은 **달리기 시작 ~ 「모든 소리가 끊긴다」** 사이에만 걸린다 —
 * 암전 위의 첫 줄과 정적 뒤의 금기 세 줄은 원래 속도로 읽혀야 하는 자리다.
 */
const SPEED_MUL = 2.5;
/**
 * 비트 표(거리)와 자막 길이(초)를 함께 맞춰 둔 기준 배율.
 * 자막이 화면에 떠 있는 시간 × 속도 = 그 줄이 먹는 **거리**이므로,
 * `SPEED_MUL / BEAT_REF` 만큼 자막을 빨리 돌리면 속도를 얼마로 올려도 거리가 그대로다.
 * 이걸 안 걸어 두면 속도를 올릴 때마다 비트 표를 다시 짜야 한다(두 번 그랬다).
 */
const BEAT_REF = 1.7;
/**
 * 「미오가 스스로 뒤를 돌아본다 → 「보지 마!」」에 쓰는 **거리**(m)와 그동안 고개가 도는 각(rad).
 *
 * 원래는 1.3 초·1.35 rad/s 였는데, **시간으로 두면 속도를 올릴 때마다 뒤로 밀린다** —
 * ×2.6 에서 12 m 였던 것이 ×4.68 에서 22 m 가 되어 「보지 마!」가 마지막 줄(58 m)을
 * 잘라먹었다(실측). 이 ACT 의 다른 모든 비트가 거리 기준이므로 이것도 거리로 고정한다.
 */
const LOOK_BACK_M = 12.2;
const LOOK_BACK_RAD = 1.76;
/**
 * 연출 길이를 손으로 맞춰 둔 기준 배율. 넘어졌다 일어나는 2.2 초가 이 배율에서 잰 값이다.
 * 배속을 올리면 **이것도 같이 줄어야** 한다 — 안 그러면 「재생속도 ×1.8」인데
 * 넘어져 있는 동안만 원래 속도로 흘러 그 구간이 통째로 튄다.
 */
const TUNED_AT = 2.6;
/** 넘어짐 → 일어남 (초). 내부 단계 비율(FALL/DOWN)은 이 길이의 분수다 */
const TRIP_S = 2.2 * TUNED_AT / SPEED_MUL;
/**
 * **사요가 끌고 가는 속도** (최고 속도 대비).
 *
 * 원래 0.9 m/s 였다 — 주석에 "질질 끌린다"고 적혀 있었는데, 화면에서는 그게 **걷는 것**으로 보였다.
 * 손을 놓고 보고만 있으면 이 장면이 통째로 산책이 된다(사용자 지적).
 * 사요는 **뛰고 있다.** 끌려가는 쪽도 뛰어야 한다 — 스스로 안 달려도 달리는 속도로 끌려간다.
 *
 * 전속력은 아니다: 스스로 달리면 더 빠르다는 여지가 있어야 「뛰어!」가 성립하고,
 * 팔이 늘어나는 연출(`setTug`)에도 쓸 폭이 남는다.
 */
const TOW = 0.62;
/**
 * **사요가 앞서는 거리**(m) — 몸과 몸 사이.
 *
 * 0.29 m — **손을 잡은 두 사람이 실제로 붙어 있는 거리**다(사용자가 `dev/sayo-run.html` 에서
 * 직접 맞춘 값. 1.3 → 0.98 → 0.42 → 0.29 로 네 번 당겼다). 눈높이 1.05 m 에서 언니의 등이
 * 화면을 채우고, 뻗은 팔이 그 아래를 가로지른다.
 *
 * 카메라 근평면은 0.1 m 다. 이 거리에서 등까지가 약 0.2 m 라 아직 잘리지 않지만 여유가 없다 —
 * 더 당기면 등이 근평면을 파고들어 몸 **안**이 보인다.
 */
const LEAD = 0.29;
/**
 * 길 중앙 기준 **오른쪽**으로 벌어지는 거리(m).
 *
 * 화면에서 사요가 서는 **각도**를 정하는 값이다 — `atan(SIDE / LEAD)`. 리드를 당길 때
 * 같이 줄이지 않으면 각도가 커져 화면 밖으로 밀려난다(0.98 m·0.34 m = 19° → 0.42 m 에서는
 * 39° 로 오른쪽 끝에 걸린다). 0.29 m 리드에서 0.17 = **30°**, 몸 중심이 화면 x 70~75 % 다 —
 * 오른쪽에 언니가 서고 왼쪽에 길과 번개가 남는다.
 * 0 으로 두면(정중앙) 뻗은 팔이 자기 등 뒤에 가려 아무것도 안 보인다.
 */
const SIDE = 0.17;
/** 미오의 잡힌 손 높이(m). 여섯 살이 위로 잡힌 팔 — 눈높이(1.05)보다 조금 아래 */
const HAND_Y = 0.79;
/**
 * 미오의 손이 몸에서 나가는 거리 — **뒤로**(−) / 왼쪽으로.
 *
 * 손이 몸 앞(+0.12)에 있으면 사요의 팔이 아래로 처져 *늘어뜨린 팔*로 읽힌다. 잡힌 손은
 * 미오의 **어깨 뒤**에서 끌려오므로(팔이 뒤로 당겨진 아이), 목표를 몸 뒤로 빼면 사요의 팔이
 * 그만큼 **뒤로 눕는다** — 사거리(0.41 m) 밖이라 팔은 그 방향으로 팽팽하게 뻗는다.
 * 리드 0.29 m 에 팔이 0.41 m 라, 목표를 **몸보다 뒤**로 빼면 손이 렌즈에 닿아 화면이
 * 손바닥으로 덮인다(0.42 m 리드에서 −0.14 를 줬다가 실제로 그랬다). 지금 값은 몸 바로 앞(−0.01)이고,
 * 이때 손은 카메라 20 cm 앞 · 화면 아래쪽에 걸린다 — 등이 화면을 채우고 팔은 그 아래로 지나간다.
 */
const HAND_FWD = -0.01;
const HAND_SIDE = -0.04;
/**
 * 리드가 흔들리는 폭(m) — 처지면 팔이 팽팽해지며 벌어지고(+), 넘어지면 언니가 돌아와 좁힌다(−).
 * 리드가 0.29 m 뿐이라 예전 값(+0.3 / −0.45)을 그대로 두면 **넘어질 때 카메라 뒤로 온다**.
 *
 * 끌림 보정은 작게 잡는다: 조작을 안 하면 `tug` 가 **계속 1** 이라(끌기가 부족분을 다 채운다)
 * 큰 값을 주면 변주가 아니라 **상시 오프셋**이 되어 튜닝한 구도가 그만큼 밀린다.
 */
const LEAD_TUG = 0.05;
const LEAD_TRIP = 0.08;
/** 아무리 좁혀도 이보다는 앞에 있다 — 등이 근평면(0.1 m)을 파고들지 않는 하한 */
const LEAD_MIN = 0.24;
/** 넘어져 있을 때의 손 높이 — 진흙에 엎어진 아이의 팔은 어깨 아래로 내려간다 */
const HAND_DOWN = 0.5;

export class Act1 {
  private state: 'idle' | 'intro' | 'run' | 'end' | 'done' = 'idle';
  private startS = 0;
  private beats: Beat[] = [];
  private fired = new Set<number>();
  /** 달리기 구간 총 길이 — 도리이 앞에서 끝나도록 생성 시 역산한다 */
  private LEN = 62;
  private lookBackFired = false;
  private forcedLook = 0;
  /** 고개가 도는 속도(rad/s) — 거리 고정이라 달리기 속도에 비례한다 */
  private lookRate = 1.35;
  private done: (() => void) | null = null;
  /** 처져 있는 시간(초) — 일정 시간을 넘기면 사요가 재촉한다 */
  private slackT = 0;
  private nudged = 0;
  private nudgeCool = 0;
  /** 도착 뒤에는 숨소리도 멈춘다 */
  private silent = false;
  private travelled = 0;
  private tmp = new THREE.Vector3();
  /** 길 위 현재 위치(진행 거리). 도착 뒤에도 사요를 그리려면 마지막 값이 필요하다 */
  private nearS = 0;
  /** 사요 배치용 — `roadAt` 은 out 을 받는다. 공유 버퍼(`nearestRoad`)를 피한다 */
  private roadBuf = { x: 0, z: 0, dirX: 0, dirZ: 0 };
  /** 플레이어에게 가장 가까운 길 위 지점 (사요의 좌우 기준) */
  private nearX = 0;
  private nearZ = 0;
  private sayoPos = new THREE.Vector3();
  private sayoHand = new THREE.Vector3();
  /** 손 높이 — 넘어지면 내려갔다가 일어나면서 돌아온다 */
  private handY = HAND_Y;
  /** 사요가 뒤를 흘끗 보는 남은 시간(초) */
  private glanceT = 0;
  /**
   * 손이 빠진 뒤 벌어지는 거리(m). 초당 1.2 m — **두어 걸음**이다.
   * 처음엔 4.5 m/s 로 뺐는데, 0.3 m 앞에 있던 사람이 그 속도로 빠지면 사라지는 게 아니라
   * **빨려 나간다**(사용자 지적). 종이 울릴 때 2.5 m 쯤 — 아직 손 닿을 것 같은 거리에서 없어진다.
   */
  private goneLead = 0;
  private released = false;

  constructor(private d: Act1Deps) {
    // 거리는 72 m 기준. 5.4 m/s 로 달리면 **한 줄이 화면에 떠 있는 동안 8~16 m 를 간다** —
    // 자막 길이(초)가 곧 거리다. 줄 사이를 그만큼 벌려 두지 않으면 뒤로 밀리고, 밀린 줄은
    // 다음 줄에 잘린다(실측: 「보지 마!」와 「일어나!」가 0.4 초 간격으로 겹쳐 앞의 것이 0.4 초만 떴다).
    this.beats = [
      { at: 0.5, run: (d) => void d.dialogue.say({ text: '누군가의 손이 나를 끌고 달린다.', dur: 2.4 }) },
      // ① 아주 먼 번개 — 폭풍이 이미 와 있다는 것만 알린다(천둥은 5초쯤 뒤에야 온다)
      { at: 7, run: (d) => d.lightning.strike({ dist: 0.9, strength: 0.8 }) },
      // 뒤에서 겹치는 목소리 — 셋이 서로 다른 사람이다. 가까울수록 크게 들린다
      { at: 16, run: (d) => { d.sfx.shout(0.42 * d.pursuers.voice + 0.2); void d.dialogue.say({ who: '뒤쪽', text: '미오!', dur: 1.5 }); } },
      // 진흙에 미끄러진다. 뒤가 확 붙는다 — 잡히지는 않지만 숨이 목까지 온다.
      // 뒤쪽 목소리 사이의 **빈자리**에 넣는다. 뒤에 붙이면 「보지 마!」를 잘라먹는다
      { at: 27, run: (d, s) => s.trip() },
      { at: 32, run: (d) => { d.sfx.shout(0.5 * d.pursuers.voice + 0.24); void d.dialogue.say({ who: '뒤쪽', text: '거기 서!', dur: 1.5 }); } },
      // ② 중거리 번개 — **붉은 피안화 길**이 여기서 처음 통째로 드러난다
      { at: 36, run: (d) => d.lightning.strike({ dist: 0.45 }) },
      { at: 38, run: (d) => { d.sfx.shout(0.6 * d.pursuers.voice + 0.3); void d.dialogue.say({ who: '뒤쪽', text: '아이를 잡아!', dur: 1.7 }); } },
      // 울며 뒤를 돌아보려 한다 — 플레이어가 안 돌아봐도 **미오가 스스로** 고개를 돌린다
      { at: 44, run: (d, s) => { s.beginForcedLook(); d.sfx.sob(0.62); } },
      // ③ 바로 위에서 친다 — **도리이**가 실루엣으로 드러난다. 종 치기 전에 꼬리가 끝나야 해서 여기가 마지막
      { at: 55, run: (d) => d.lightning.strike({ dist: 0.12, strength: 1.15 }) },
      // 스토리보드는 이 두 문장을 **한 문단**으로 적었다. 4.75 m/s 에서는 두 줄로 나누면
      // 뒤 줄이 종소리에 걸리므로, 원문대로 한 줄로 붙인다
      { at: 58, run: (d) => void d.dialogue.say({ text: '붉은 피안화 길이 끝없이 이어진다. 멀리 도리이가 보인다.', dur: 2.6 }) },
    ];
  }

  /** 암전 → 숨소리 → 시야가 열리고 달리기 시작. resolve 는 ACT 1 끝(암전 상태) */
  async play(): Promise<void> {
    const d = this.d;
    const g = d.village.ground;

    // --- 0. 검은 화면 위로 거친 숨소리와 빗소리 ---
    d.sequencer.setFade(1, 0.01);
    d.rain.setEnabled(true);
    d.sfx.setRain(true);
    d.setSurfaceOverride('water');
    // 시작 지점: **금줄 게이트 안쪽**(z 86). 게이트는 「온 길로는 돌아갈 수 없다」를 위한
    // 의도된 벽이라 그 바깥(z 92)에서 출발하면 2 m 만에 막힌다 — 실제로 막혔다.
    // 끝은 **경내 입구 14 m 앞**(z 14). 여기가 「멀리 신사의 도리이가 보인다」가 성립하는 마지막 자리다 —
    // 더 가면 도리이 기둥이 화면 절반을 채워 "멀리"가 거짓말이 된다(실제로 그랬다).
    // 두 자리 사이가 약 72 m. 달리기를 올린 만큼 구간도 늘려야 대사가 밀리지 않는다 —
    // 5.4 m/s 에서는 자막 한 줄이 화면에 떠 있는 동안 **8~16 m** 를 간다
    // (48 m 로 줄였더니 마지막 두 줄이 종소리에 겹쳤다).
    this.startS = g.sAtZ(86);
    this.LEN = Math.max(30, g.sAtZ(14) - this.startS);
    // 비트는 62 m 기준으로 적혀 있다. 실제 길이에 맞춰 비율로 옮긴다
    const k = this.LEN / NOMINAL;
    for (const b of this.beats) b.at *= k;
    const sp = g.roadAt(this.startS);
    d.controller.teleport(new THREE.Vector3(sp.x, g.heightAt(sp.x, sp.z) + 0.1, sp.z));
    // 참배로는 남(+z) → 북(−z). 진행 방향을 바라보는 yaw
    const fwd = Math.atan2(-sp.dirX, -sp.dirZ);
    d.fp.begin(fwd, 3.6 * SPEED_MUL);
    d.pursuers.begin(this.startS, 30, 3.6 * SPEED_MUL);
    // 사요를 **미리** 그 자리에 세운다. 감쇠로 따라오게 두면 첫 프레임에 원점에서 날아온다
    this.nearS = this.startS;
    this.nearX = sp.x; this.nearZ = sp.z;
    if (d.sayo) {
      const ahead = g.roadAt(this.startS + LEAD, this.roadBuf);
      const ax = ahead.x - ahead.dirZ * SIDE, az = ahead.z + ahead.dirX * SIDE;
      d.sayo.place(new THREE.Vector3(ax, g.heightAt(ax, az), az), Math.atan2(ahead.dirX, ahead.dirZ));
      d.sayo.show(true);
    }

    // 암전 위 — 여기서 들리는 건 자막이 아니라 **숨과 비**다. 이 동안은 숨만 돌리고
    // 추격·비트·이동은 멈춰 둔다 (검은 화면에서 추격자가 30 m 를 다 좁혀 오면 시야가 열리자마자 잡힌다).
    //
    // 세 박자를 **겹친다**: 1.5 초 완전 암전 → 시야가 열리기 시작 → 0.7 초 뒤 조작 인계.
    // 순서대로 기다리면(3 초 암전 → 그다음 2.4 초 페이드) 달리기 시작까지 5.4 초를 가만히 본다.
    // 아직 어둑할 때 이미 달리고 있어야 "정신을 차려 보니 달리는 중"이 된다
    this.state = 'intro';
    // 암전 위의 이 줄은 **원래 속도**다. 아직 달리기 전이고, 화면에 이것 말고는 아무것도 없다.
    // 길이를 암전 구간(1.5 + 0.7)에 맞춰 두면 달리기 시작과 함께 자연스럽게 사라진다
    void d.dialogue.say({ text: '거친 숨소리. 빗소리.', dur: 2.2 });
    await wait(1500);
    d.sequencer.setFade(0, 2.0);
    await wait(700);
    // 여기부터 배속 — 자막을 달리기 배율에 묶는다. 한 줄이 먹는 **거리**가 고정되므로
    // 속도를 올려도 비트 표(각 줄이 시작되는 지점)를 다시 짤 필요가 없다.
    // 되돌리는 건 `finish()` 의 「모든 소리가 끊긴다」 직전이다 — 딱 그 구간만 빠르다
    d.dialogue.setRate(SPEED_MUL / BEAT_REF);
    this.state = 'run';
    return new Promise((r) => { this.done = r; });
  }

  get running() { return this.state === 'run'; }
  /** 이동 입력 배율 — 넘어져 있는 동안 0, 도착 뒤 0 (main 의 축 계산이 읽는다) */
  get moveScale() {
    if (this.state !== 'run') return 0;
    return this.d.fp.moveScale;
  }
  /** 이동 최고 속도 배율 — 도착·넘어짐 뒤에는 의미가 없지만 `moveScale` 이 이미 0 이다 */
  get speedMul() { return SPEED_MUL; }
  /** DEV 계측용 — 몇 m 왔는가 / 총 몇 m 인가 */
  get progress(): [number, number] { return [this.travelled, this.LEN]; }

  /** 매 프레임 — main 의 루프에서 호출 */
  update(dt: number) {
    if (this.state === 'idle' || this.state === 'done') return;
    const d = this.d;
    d.lightning.update(dt);
    // 사요는 **달리기 구간 밖에서도** 갱신한다 — 암전 위에서 이미 달리고 있어야 하고,
    // 도착 뒤에는 손이 빠진 채로 빗속으로 멀어져야 한다
    if (this.state !== 'run') { this.breathe(dt); this.poseSayo(dt); return; }

    const g = d.village.ground;
    const p = d.controller.position;
    // 참배로 위 진행 거리.
    // ⚠️ `nearestRoad` 는 **재사용 객체**를 돌려준다 — `heightAt` 도 같은 버퍼를 쓰므로,
    //    아래에서 `pursuers.update`(횃불마다 heightAt 호출)가 지나가면 이 값이 통째로
    //    *횃불 근처의 길 지점*으로 바뀐다. 그대로 들고 있다가 길 보정에 쓰면 플레이어를
    //    **뒤쪽으로** 끌어당긴다(실제로 그랬다 — 속도 3.6 → 2.7, 추격자가 계속 붙어 있었다).
    //    그래서 필요한 값만 즉시 복사해 둔다.
    const nr = g.nearestRoad(p.x, p.z);
    const nearS = this.nearS = nr.s, nearD = nr.d, nearX = this.nearX = nr.x, nearZ = this.nearZ = nr.z;
    const travelled = this.travelled = nearS - this.startS;

    // 길이 굽으면 "정면"도 굽는다 — 곡선 구간에서 시선 저항이 엉뚱하게 걸리지 않게
    const rp = g.roadAt(Math.min(nearS + 4, g.roadLength - 2));
    d.fp.setForward(Math.atan2(-rp.dirX, -rp.dirZ));

    // 추격자
    d.pursuers.update(dt, nearS, d.controller.horizontalSpeed);
    // 잠식 = 추격 근접도와 뒤돌아본 정도 중 큰 쪽. 0.62 를 넘기지 않는다 — 앞이 안 보이면 달릴 수가 없다.
    // 제곱을 씌워 **정말 붙었을 때만** 붉어지게 한다(선형이면 달리는 내내 붉은 화면이 된다)
    const prox = d.pursuers.proximity * d.pursuers.proximity;
    d.setDread(Math.min(0.62, Math.max(prox, d.fp.lookBack * 0.9)));
    this.breathe(dt);
    this.dragged(dt, rp, { x: nearX, z: nearZ, d: nearD });
    this.poseSayo(dt);

    // 거리 비트
    for (let i = 0; i < this.beats.length; i++) {
      const b = this.beats[i]!;
      if (travelled >= b.at && !this.fired.has(i)) { this.fired.add(i); b.run(d, this); }
    }

    // 미오가 스스로 뒤를 돌아보려 한다 → 사요가 꺾는다
    if (this.forcedLook > 0) {
      this.forcedLook -= dt;
      d.fp.yaw += dt * this.lookRate;   // 천천히 고개가 돌아간다
      if (this.forcedLook <= 0) this.triggerDontLook();
    }
    // 플레이어가 스스로 끝까지 돌아봐도 같은 일이 일어난다
    if (!this.lookBackFired && d.fp.lookBack > 0.62) this.triggerDontLook();

    // 도착
    if (travelled >= this.LEN) void this.finish();
  }

  /**
   * **숨** — 스토리보드의 첫 줄이 "거친 숨소리"다. 지금까지 이게 자막으로만 있었다.
   * 셋이 겹쳐서 숨을 만든다: 달리는 만큼(run) + 온 거리만큼 지쳐서(fatigue) + 뒤가 붙은 만큼(공포).
   *
   * 심장 소리는 **뺐다**. 숨·빗소리·발소리·뒤쪽 외침이 이미 겹쳐 있는 구간이라
   * 저역이 한 겹 더 깔리면 다른 소리를 다 먹는다. 심장은 정적이 있는 장면(`matsuri.ts` 의 추격)의 것이다.
   */
  private breathe(dt: number) {
    const d = this.d;
    if (this.silent) { d.sfx.breath(0, dt); return; }
    // 검은 화면 위 — 이미 한참 달려온 뒤다. 정지 상태라고 숨까지 멎으면 첫 줄이 성립하지 않는다
    if (this.state === 'intro') { d.sfx.breath(0.78, dt, CHILD); return; }
    const run = THREE.MathUtils.clamp(d.controller.horizontalSpeed / (3.6 * SPEED_MUL * 0.9), 0, 1);
    const fatigue = THREE.MathUtils.clamp(this.travelled / this.LEN, 0, 1);
    const fear = d.pursuers.proximity;
    const level = THREE.MathUtils.clamp(0.34 + run * 0.30 + fatigue * 0.26 + fear * 0.28, 0, 1);
    d.sfx.breath(d.fp.stumbling ? 1 : level, dt, CHILD);
  }

  /**
   * **끌린다** — 손을 잡힌 아이는 자기 속도로 달리지 않는다.
   *
   * 처지면 ① 팔이 앞으로 늘어나고 ② 몸이 진행 방향으로 실제로 **끌려간다**
   * ③ 그래도 안 달리면 사요가 재촉한다. 멈춰 서서 구경하는 것을 금지하는 게 아니라,
   * 멈추면 *끌려가는 느낌*이 들게 해서 스스로 달리게 만든다.
   */
  private dragged(dt: number, ahead: { x: number; z: number; dirX: number; dirZ: number }, near: { x: number; z: number; d: number }) {
    const d = this.d;
    const push = this.tmp.set(0, 0, 0);
    // **길로 끌어온다** — 옆으로 새면 잡힌 손이 참배로 쪽으로 당긴다. 보이지 않는 벽 대신
    // 팔이 하는 일이라 규칙이 아니라 연출로 읽힌다(길 밖으로 나가는 것 자체는 막지 않는다)
    if (near.d > 1.1 && !d.fp.stumbling) {
      const k = THREE.MathUtils.clamp((near.d - 1.1) / 2.5, 0, 1);
      push.set(near.x - d.controller.position.x, 0, near.z - d.controller.position.z).setY(0);
      if (push.lengthSq() > 1e-6) push.normalize().multiplyScalar(1.5 * k);
    }
    if (d.fp.stumbling) { d.fp.setTug(1); d.controller.externalPush.copy(push); return; }

    // --- 끌려간다 ---
    // 손이 하는 일은 "조금 밀어 주는 것"이 아니라 **끌고 가는 것**이다. 그래서 더하는 게 아니라
    // **모자란 만큼만** 채운다: 스스로 그보다 빨리 달리면 손은 아무 일도 하지 않고,
    // 가만히 있으면 손이 통째로 데려간다. `externalPush` 는 원하는 속도에 m/s 로 더해지므로
    // 부족분을 그대로 주면 컨트롤러가 그 속도로 수렴한다.
    // 길 배열은 남(z 94) → 북(z −50) 순이라 dir 이 곧 진행 방향이다
    const top = 3.6 * SPEED_MUL;
    // ⚠️ 기준은 `horizontalSpeed`(실제 이동)가 아니라 **`velocity`(입력이 만든 의도 속도)** 다.
    //    실제 이동에는 방금 밀어 준 값이 이미 들어 있어서, 그걸 보고 부족분을 계산하면
    //    다음 프레임에 "충분하다"고 판단해 밀기를 멈춘다 → **한 프레임 걸러 10 / 0.3 m/s 로 진동**하고
    //    평균이 절반(5.2 m/s)이 된다(실측). 의도 속도는 밀기의 영향을 받지 않으므로 루프가 안 생긴다.
    const own = Math.hypot(d.controller.velocity.x, d.controller.velocity.z);
    const deficit = top * TOW - own;
    if (deficit > 0) {
      push.x += ahead.dirX * deficit;
      push.z += ahead.dirZ * deficit;
      // 스스로 안 달리고 있다 = 손에 매달려 있다. 사요의 재촉은 **속도**가 아니라 이걸 본다
      this.slackT += dt;
    } else this.slackT = Math.max(0, this.slackT - dt * 2);
    // 팔이 늘어나는 정도 — 손이 얼마나 일하고 있는가
    d.fp.setTug(THREE.MathUtils.clamp(deficit / (top * 0.5), 0, 1));
    d.controller.externalPush.copy(push);

    this.nudgeCool -= dt;
    if (this.slackT > 1.7 && this.nudgeCool <= 0 && this.nudged < 3 && this.state === 'run') {
      this.nudgeCool = 7;
      this.slackT = 0;
      const line = ['뛰어!', '미오야, 빨리!', '놓지 마!'][this.nudged++]!;
      d.sfx.shout(0.5, true);
      this.glanceT = 1.5;   // 재촉하는 목소리에는 돌아보는 목이 붙는다
      void d.dialogue.say({ who: '사요', text: line, dur: 1.8 });
    }
  }

  /**
   * **앞서 달리는 언니를 길 위에 놓는다.** 그리는 것은 `sayo.ts`, 자리를 정하는 것은 여기다.
   *
   * 사요는 미오를 따라오지 않는다 — **길 위 진행 거리에 리드를 더한 자리**에 선다.
   * 플레이어를 따라다니게 만들면 멈춰 섰을 때 언니도 같이 서서 기다리는 그림이 되는데,
   * 이 ACT 에서 사요는 *끌고 가는 쪽*이다(그래서 멈추면 팔이 늘어나고 재촉이 나온다).
   *
   * 좌우로 30 cm 벌려 둔다. 정중앙에 세우면 등이 화면 한가운데를 막아 길이 안 보이고,
   * 무엇보다 **왼팔이 뒤로 뻗을 자리**가 없다 — 미오가 왼쪽 뒤에 있어야 그 팔이 성립한다.
   */
  private poseSayo(dt: number) {
    const s = this.d.sayo;
    if (!s || !s.root.visible) return;
    const d = this.d, g = d.village.ground, fp = d.fp, ctrl = d.controller;

    const p0 = ctrl.position;
    if (this.released) this.goneLead += dt * 1.2;
    const lead = Math.max(LEAD_MIN, LEAD + fp.tugging * LEAD_TUG - (fp.stumbling ? LEAD_TRIP : 0)) + this.goneLead;
    const rp = g.roadAt(THREE.MathUtils.clamp(this.nearS + lead, 0, g.roadLength - 1), this.roadBuf);
    // 진행 방향(dirX, dirZ) 기준 오른쪽 = (−dirZ, dirX)
    const rx = -rp.dirZ, rz = rp.dirX;
    /**
     * **좌우는 길이 아니라 플레이어 기준이다.** 길 중앙에 세우면 플레이어가 옆으로 흐른 만큼
     * 사요가 화면에서 움직이는데, 리드가 0.42 m 뿐이라 그 배율이 잔인하다 —
     * 실측 편차 ±0.43 m 가 화면에서 **±45°** 가 되어 언니가 오른쪽 끝으로 밀려났다.
     * 플레이어의 편차를 그대로 물려받으면 화면 각도(`atan(SIDE/lead)`)가 고정된다.
     * 잡은 손이 끌고 가는 사이니, 옆으로 흐르면 언니도 같이 흐르는 게 맞기도 하다.
     */
    const lat = THREE.MathUtils.clamp((p0.x - this.nearX) * rx + (p0.z - this.nearZ) * rz, -0.9, 0.9);
    const x = rp.x + rx * (SIDE + lat), z = rp.z + rz * (SIDE + lat);
    this.sayoPos.set(x, g.heightAt(x, z), z);

    // 미오의 손은 **몸**에 매단다(카메라가 아니라). 카메라에 매달면 고개를 돌릴 때 손이 따라 돌아서
    // 잡힌 손이 아니라 들고 다니는 물건이 된다 — 목을 돌려도 잡힌 손은 그 자리에 있어야 한다
    this.handY = damp(this.handY, fp.stumbling ? HAND_DOWN : HAND_Y, 6, dt);
    const p = p0;
    this.sayoHand.set(
      p.x + rp.dirX * HAND_FWD + rx * HAND_SIDE,
      p.y + this.handY,
      p.z + rp.dirZ * HAND_FWD + rz * HAND_SIDE,
    );

    const speed = ctrl.horizontalSpeed;
    // 넘어져 있는 동안에는 달리기가 아니다 — 언니는 서서 팔을 당기고 있다
    s.play(speed < 1.6 ? 'walk' : 'run');
    this.glanceT = Math.max(0, this.glanceT - dt);
    s.update(dt, {
      pos: this.sayoPos,
      // 이 리그는 정면이 +Z 다 → yaw = atan2(dirX, dirZ). 카메라 yaw 와는 π 만큼 다르다
      yaw: Math.atan2(rp.dirX, rp.dirZ),
      hand: fp.holdingHand ? this.sayoHand : null,
      speed,
      glance: this.glanceT > 0 ? 1 : 0,
    });
    // 손이 빠진 뒤 — 언니는 멈추지 않는다. 그대로 달려 나갈 뿐,
    // **사라지는 것은 종소리에서 한 프레임에** 일어난다 (`finish()`).
    // 투명도로 지워 봤더니(2026-08-22) 그건 사람이 없어지는 게 아니라 **화면 효과**로 보였다 —
    // 사용자 지적. 유령은 서서히 흐려지지 않는다. 소리가 끊기고, 종이 울리고, 그 자리에 없다.
  }

  /** 뒤를 돌아보기 시작한다 — 걸리는 **거리**는 고정, 시간과 각속도는 달리기 속도에서 나온다 */
  private beginForcedLook() {
    const dur = LOOK_BACK_M / (3.6 * SPEED_MUL);
    this.forcedLook = dur;
    this.lookRate = LOOK_BACK_RAD / dur;
  }

  /** 진흙에 미끄러진다 — 실패가 아니라 **거리가 좁혀지는** 사건이다 */
  private trip() {
    const d = this.d;
    d.fp.stumble(TRIP_S);
    d.sfx.land(1);
    d.sfx.sob(0.75);
    // 넘어진 만큼 뒤가 붙는다. 11 m — 횃불이 등 뒤에서 길바닥을 비출 거리
    d.pursuers.closeTo(this.startS + this.travelled, 11);
    d.dialogue.clear();
    void d.dialogue.say({ who: '사요', text: '일어나!', dur: 1.4 });
    this.glanceT = TRIP_S * 0.9;   // 언니가 돌아본다 — 얼굴까지는 안 돈다(`sayo.ts`)
  }

  private triggerDontLook() {
    if (this.lookBackFired) return;
    this.lookBackFired = true;
    this.forcedLook = 0;
    const d = this.d;
    d.sfx.shout(0.9, true);
    d.dialogue.clear();   // 다른 줄이 재생 중이어도 이건 **가로챈다** — 외침이 줄을 서면 외침이 아니다
    void d.dialogue.say({ who: '???', text: '보지 마!', dur: 1.9 });
    d.fp.snapForward(0.6);
  }

  /**
   * 모든 소리가 **끊긴다** → 손이 빠진다 → 댕— → 암전 → 사요의 금기.
   *
   * 「갑자기 모든 소리가 끊긴다」를 1.5 초에 걸쳐 페이드아웃하면 그건 *비가 그친 것*이다.
   * 끊으려면 잘라야 한다 — 빗소리 즉시 컷, 횃불 소등, 숨·심장 정지, 그리고 **아무것도 없는 1.4 초**.
   */
  private async finish() {
    if (this.state !== 'run') return;
    this.state = 'end';
    const d = this.d;

    // 아직 읽고 있는 줄이 있으면 끝날 때까지 기다린다. 도착선에서 이미 몸은 멈춰 있고(moveScale 0)
    // 비는 계속 온다 — **정적은 말이 끝난 뒤에 와야 한다.** 거리로 짠 비트는 플레이어가 느리면
    // 뒤로 밀리므로, 마지막 줄이 종소리에 잘리는 일을 여기서 한 번에 막는다
    while (d.dialogue.busy) await wait(120);
    // 달리기가 끝났으니 자막도 원래 속도로. 암전 위의 금기 세 줄은 **천천히** 읽혀야 한다
    d.dialogue.setRate(1);

    // --- 정적 ---
    d.sfx.setRain(false, 0);      // 페이드 없이 컷
    d.lightning.end();            // 예약된 천둥도 취소한다 — 정적에 천둥이 끼어들면 정적이 아니다
    d.pursuers.snuff(0.7);
    d.setDread(0);
    d.fp.setTug(0);
    this.silent = true;
    // 손 놓기를 자막과 **겹친다**. 순서대로 세우면 도착 뒤 멍하니 기다리는 시간이 된다
    d.fp.releaseHand(1.0);
    this.released = true;   // 손이 미끄러지는 동안 언니는 이미 멀어지고 있다
    await d.dialogue.say({ text: '갑자기 모든 소리가 끊긴다.', dur: 2.0 });

    // --- 댕— ---
    // **종과 함께 사라진다.** 소리가 가장 큰 순간이 시선이 가장 헐거워지는 순간이다 —
    // 그 한 프레임에 언니를 걷어내면 「없어지는 것」을 못 보고 **없다는 것**만 남는다.
    // 그 뒤 0.7 초는 비어 있는 길이다. 암전 위의 「언니……?」가 그 0.7 초 위에서 나온다
    d.sfx.bell(0.9);
    d.sayo?.show(false);
    await wait(700);              // 종이 한 번 울고 나서 화면이 닫힌다
    d.sequencer.setFade(1, 1.1);
    await wait(1200);
    d.rain.setEnabled(false);
    d.setSurfaceOverride(null);

    // 암전 위의 대사 — 이 게임의 첫 금기가 여기서 심어진다
    await d.dialogue.say({ who: '어린 미오', text: '언니……?', dur: 2.2 });
    await wait(500);
    await d.dialogue.say({ who: '사요', text: '미오야.', dur: 2.0 });
    await wait(900);   // 잠시 침묵
    await d.dialogue.say({ who: '사요', text: '피안화가 피어 있는 길은 절대로 따라오면 안 돼.', dur: 4.0 });

    this.state = 'done';
    d.sayo?.show(false);
    d.fp.end();
    const r = this.done; this.done = null; r?.();
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
