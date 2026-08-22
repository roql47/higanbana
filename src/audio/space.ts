import * as THREE from 'three';
import { settings } from '@/core/settings';

/**
 * 공간 오디오 — **소리에 방과 벽을 준다.**
 *
 * 지금까지 이 게임의 소리는 방향(HRTF 패너)과 거리(rolloff)만 있었다. 그래서
 * 폐가 안이든 토리이 터널이든 논 한가운데든 발소리가 **똑같이** 들렸고, 요괴의
 * 마츠리바야시는 벽을 그냥 통과해 나왔다. 「소리로 아는 추격자」가 기획의 기둥인데
 * 벽이 소리를 안 막으면 방향은 알아도 **거리감이 거짓말을 한다**.
 *
 * 세 가지를 얹는다.
 *
 *  ① **리버브 존** — 구역마다 다른 잔향. 발소리 하나가 "여긴 좁다"를 말한다.
 *     IR(임펄스 응답)은 파일을 받지 않고 **절차 생성**한다 — 다운로드 0 B, 존에 처음
 *     들어갈 때 한 번만 만든다(2 ch × 수십만 샘플 ≈ 수 ms). 슬롯 두 개를 크로스페이드해서
 *     문턱을 넘을 때 잔향이 뚝 끊기지 않는다.
 *  ② **오클루전** — 리스너→음원 레이캐스트. 막히면 로우패스가 닫히고 직접음(dry)이 줄고
 *     **잔향(wet)은 오히려 커진다**. 벽 뒤 소리가 먹먹하면서 울리는 건 직접음이 사라지고
 *     방의 반사만 남기 때문이다. 이 한 줄이 오클루전을 "볼륨 조절"이 아니라 공간으로 만든다.
 *  ③ **덕킹** — 위협이 가까우면 앰비언스가 눌리고 고역이 닫힌다. 볼륨을 올리는 대신
 *     **주변을 지워서** 좁혀지는 청각. 정적이 가장 무섭다.
 *
 * 신호 흐름:
 * ```
 *   [원샷·루프] ─ dry ──────────────────────────────→ master
 *               └ wet ─→ send ─┬→ convA → outA ─┐
 *                              └→ convB → outB ─┴→ master
 *   [앰비언스]  ─→ ambientBus → ambientLp ───────→ master   (덕킹은 이 둘)
 * ```
 * 전부 오디오 스레드에서 돈다 — 렌더 프레임 예산과 무관하다.
 */

export type ZoneName = 'outdoor' | 'indoor' | 'corridor' | 'hall' | 'well' | 'bus';

export interface ZonePreset {
  /** IR 길이(초) ≈ 잔향 꼬리 */
  seconds: number;
  /** 감쇠 지수 — 클수록 빨리 죽는다 */
  decay: number;
  /** 프리딜레이(초) — 첫 반사까지의 시간 = 방의 크기 */
  preDelay: number;
  /** 0(밝음·돌) ~ 1(어두움·나무/천) — 꼬리 고역 흡음 */
  damping: number;
  /** 초기 반사 [지연 s, 게인] — 방의 성격은 꼬리가 아니라 이 몇 개의 탭이 말한다 */
  early: [number, number][];
  /** 센드 레벨(0..1) — 이 존에 있을 때의 젖은 정도 */
  wet: number;
}

/**
 * 존 프리셋. 값은 실제 공간의 성격에서 왔다 —
 * 나무·다다미는 흡음이 크고(damping↑) 짧다, 돌·물은 밝고 길다.
 */
export const ZONES: Record<ZoneName, ZonePreset> = {
  // 산속 마을의 밤. 잔향이랄 게 거의 없지만 **완전한 무향은 야외로 안 들린다** —
  // 먼 산에서 돌아오는 아주 늦고 아주 작은 반사 하나가 "여긴 트여 있다"를 만든다
  outdoor: {
    seconds: 1.3, decay: 3.2, preDelay: 0.028, damping: 0.72,
    early: [[0.085, 0.10], [0.147, 0.06], [0.223, 0.035]],
    wet: 0.085,
  },
  // 폐가·민가 다다미방. 나무와 짚은 흡음이 커서 잔향이 짧고 어둡다. 대신 프리딜레이가
  // 짧아 벽이 **가깝게** 느껴진다
  indoor: {
    seconds: 0.62, decay: 2.4, preDelay: 0.006, damping: 0.86,
    early: [[0.009, 0.42], [0.016, 0.3], [0.024, 0.22], [0.037, 0.14]],
    wet: 0.20,
  },
  // 센본토리이 터널·마을 골목. 좌우가 가깝고 앞뒤로 길다 → **일정 간격 반사(플러터)**.
  // 등간격 탭이 이 구역의 정체성이다 — 기둥이 늘어서 있다는 게 소리로 들린다
  corridor: {
    seconds: 1.0, decay: 2.2, preDelay: 0.005, damping: 0.6,
    early: [[0.008, 0.4], [0.019, 0.32], [0.030, 0.26], [0.041, 0.2], [0.052, 0.15], [0.063, 0.11]],
    wet: 0.28,
  },
  // 신사 배전·폐교 강당. 천장이 높은 목조 — 길지만 고역이 남지 않는다
  hall: {
    seconds: 1.7, decay: 1.9, preDelay: 0.019, damping: 0.7,
    early: [[0.023, 0.3], [0.041, 0.22], [0.062, 0.16], [0.089, 0.1]],
    wet: 0.24,
  },
  // 우물·석실. 좁고 딱딱하고 길다. damping 이 낮아 금속처럼 밝게 남는다 — 이 게임에서
  // 가장 극단적인 존이고, 여기 한 번 들어갔다 나오면 야외가 얼마나 조용한지 알게 된다
  well: {
    seconds: 2.6, decay: 1.3, preDelay: 0.004, damping: 0.22,
    early: [[0.006, 0.5], [0.013, 0.44], [0.021, 0.38], [0.028, 0.32], [0.036, 0.27]],
    wet: 0.46,
  },
  // 버스 안(ACT 2). 시트와 천장재가 전부 먹는 **죽은 공간** — 잔향이 거의 없는데
  // 야외와 달리 늦은 반사도 없다. 그 답답함이 곧 "닫혀 있다"는 감각이다
  bus: {
    seconds: 0.28, decay: 3.0, preDelay: 0.003, damping: 0.93,
    early: [[0.004, 0.34], [0.008, 0.24], [0.013, 0.15]],
    wet: 0.12,
  },
};

/**
 * 절차 IR 생성. 확산 꼬리(노이즈 × 지수 감쇠 × 진행성 로우패스) + 초기 반사 탭.
 *
 * 꼬리의 고역이 **시간이 갈수록 더 죽는다**는 게 핵심이다 — 실제 공간에서 공기와 재질이
 * 고역을 먼저 먹기 때문이고, 이게 없으면 잔향이 "쉬익" 하는 화이트노이즈로 들린다.
 *
 * 마지막에 **에너지 정규화**를 한다. 길이가 다른 존들(0.28 s 버스 ↔ 2.6 s 우물)을
 * 피크로 맞추면 긴 쪽이 훨씬 크게 들려서 `wet` 값이 존마다 다른 뜻이 돼 버린다.
 */
function buildIR(ctx: AudioContext, p: ZonePreset): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(64, Math.ceil(p.seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  const pre = Math.min(len - 2, Math.floor(p.preDelay * rate));
  const tail = len - pre;
  const build = Math.max(1, Math.floor(0.012 * rate)); // 확산이 차오르는 구간(12 ms)
  const a0 = 1 - 0.78 * p.damping;                     // 꼬리 시작의 고역 통과량
  const a1 = Math.max(0.015, a0 * 0.12);               // 꼬리 끝 — 훨씬 어둡게

  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / tail;
      const env = Math.pow(1 - t, p.decay) * Math.min(1, (i - pre) / build);
      y += (a0 + (a1 - a0) * t) * ((Math.random() * 2 - 1) - y);
      d[i] = y * env;
    }
    // 초기 반사. 좌우를 3.7 % 어긋내고 위상을 뒤집어 스테레오 폭을 만든다
    for (const [dly, g] of p.early) {
      const i = pre + Math.floor(dly * rate * (c === 0 ? 1 : 1.037));
      if (i < len) d[i]! += (c === 0 ? g : -g * 0.9);
    }
  }

  let energy = 0;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) energy += d[i]! * d[i]!;
  }
  const k = energy > 0 ? 2.4 / Math.sqrt(energy) : 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i]! *= k;
  }
  return buf;
}

interface Slot { conv: ConvolverNode; out: GainNode; zone: ZoneName | null }

export class AudioSpace {
  /** 소스가 wet 사본을 보내는 곳 */
  readonly send: GainNode;
  /** 앰비언스가 여기로 들어온다 — 위협 덕킹의 대상 */
  readonly ambientBus: GainNode;
  private ambientLp: BiquadFilterNode;
  private slots: [Slot, Slot];
  private cur = 0;
  private zone: ZoneName = 'outdoor';
  private irCache = new Map<ZoneName, AudioBuffer>();
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private sources = new Set<SpatialSource>();

  /** 리스너(카메라) 위치 — 오클루전 레이의 시작점. main 이 매 프레임 넣어준다 */
  readonly listener = new THREE.Vector3();
  /** `from`→`to` 가 막혔나. main 이 physics.rayBlocked 를 꽂아 준다 */
  raycast: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;

  private threat = 0;
  private threatCur = 0;
  private hushT = 0;

  constructor(private ctx: AudioContext, private master: GainNode) {
    this.send = ctx.createGain();
    this.send.gain.value = 1;

    const mkSlot = (): Slot => {
      const conv = ctx.createConvolver();
      conv.normalize = false; // 정규화는 buildIR 이 에너지 기준으로 이미 했다
      const out = ctx.createGain();
      out.gain.value = 0;
      this.send.connect(conv);
      conv.connect(out).connect(master);
      return { conv, out, zone: null };
    };
    this.slots = [mkSlot(), mkSlot()];

    this.ambientBus = ctx.createGain();
    this.ambientLp = ctx.createBiquadFilter();
    this.ambientLp.type = 'lowpass';
    this.ambientLp.frequency.value = 20000;
    this.ambientLp.Q.value = 0.4;
    this.ambientBus.connect(this.ambientLp).connect(master);

    this.setZone('outdoor', 0);
  }

  get currentZone() { return this.zone; }
  get preset() { return ZONES[this.zone]; }

  private ir(name: ZoneName): AudioBuffer {
    let b = this.irCache.get(name);
    if (!b) { b = buildIR(this.ctx, ZONES[name]); this.irCache.set(name, b); }
    return b;
  }

  /**
   * 존 전환. 유휴 슬롯에 새 IR 을 올리고 두 슬롯의 출력 게인을 교차시킨다.
   * 페이드가 끝나면 옛 슬롯의 buffer 를 비운다 — buffer 가 null 인 ConvolverNode 는
   * 침묵을 내보내고 컨볼루션도 돌지 않으므로 CPU 가 0 이 된다.
   */
  setZone(name: ZoneName, fade = 0.7) {
    if (name === this.zone && this.slots[this.cur]!.zone === name) return;
    this.zone = name;
    const t = this.ctx.currentTime;
    const from = this.slots[this.cur]!;
    const to = this.slots[1 - this.cur]!;
    to.conv.buffer = this.ir(name);
    to.zone = name;
    const wet = ZONES[name].wet * settings.audio.reverb;
    for (const [g, v] of [[to.out.gain, wet], [from.out.gain, 0]] as [AudioParam, number][]) {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      if (fade > 0) g.linearRampToValueAtTime(v, t + fade); else g.setValueAtTime(v, t);
    }
    this.cur = 1 - this.cur;
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => { from.conv.buffer = null; from.zone = null; }, (fade + 0.15) * 1000);
  }

  /** 위협 근접도 0..1 — 앰비언스를 누르고 고역을 닫는다 */
  setThreat(v: number) { this.threat = THREE.MathUtils.clamp(v, 0, 1); }

  /** 순간 정적 — 소리가 한꺼번에 빠졌다 돌아온다. 볼륨을 올리는 것보다 무섭다 */
  hush(seconds = 1.2) { this.hushT = Math.max(this.hushT, seconds); }

  track(s: SpatialSource) { this.sources.add(s); }
  untrack(s: SpatialSource) { this.sources.delete(s); }

  update(dt: number) {
    if (this.hushT > 0) this.hushT -= dt;
    // 덕킹은 빠르게 걸리고 천천히 풀린다 — 위협이 사라져도 귀가 바로 안 열린다
    const target = Math.max(this.threat, this.hushT > 0 ? 1 : 0);
    this.threatCur += (target - this.threatCur) * Math.min(1, dt * (target > this.threatCur ? 4 : 0.8));
    // 값은 위에서 이미 감쇠했으므로 파라미터에는 **직접 대입**한다.
    // setTargetAtTime 을 매 프레임 걸면 자동화 이벤트가 초당 60개씩 쌓이고, 스무딩이 두 겹이 된다
    const k = this.threatCur;
    this.ambientBus.gain.value = 1 - 0.62 * k;
    this.ambientLp.frequency.value = 20000 * Math.pow(1800 / 20000, k);
    for (const s of this.sources) s.update(dt);
  }

  /**
   * 리스너→`pos` 오클루전 0..1. 가운데 한 줄과 좌우로 벌린 두 줄을 쏴서 **가장자리를 부드럽게** 한다 —
   * 한 줄만 쓰면 기둥 하나를 스칠 때 소리가 딸깍거린다.
   */
  occlusionAt(pos: THREE.Vector3): number {
    if (!this.raycast) return 0;
    const L = this.listener;
    let blocked = this.raycast(L, pos) ? 1 : 0;
    // 리스너 쪽에서 좌우로 0.8 m 벌린 두 줄 (수평면 기준, 음원 방향의 직교축)
    const dx = pos.x - L.x, dz = pos.z - L.z;
    const inv = 1 / Math.max(1e-3, Math.hypot(dx, dz));
    const ox = -dz * inv * 0.8, oz = dx * inv * 0.8;
    for (const s of [1, -1]) {
      TMP_A.set(L.x + ox * s, L.y, L.z + oz * s);
      if (this.raycast(TMP_A, pos)) blocked += 1;
    }
    return blocked / 3;
  }

  dispose() {
    if (this.clearTimer) clearTimeout(this.clearTimer);
    for (const s of this.slots) { s.conv.disconnect(); s.out.disconnect(); }
    this.send.disconnect();
    this.ambientBus.disconnect();
    this.ambientLp.disconnect();
    this.sources.clear();
  }
}

const TMP_A = new THREE.Vector3();

/**
 * 위치가 있고 벽에 막힐 수 있는 음원 하나.
 *
 * ```
 *   input → lp → panner ┬→ dry → master
 *                       └→ wet → space.send
 * ```
 * 막힐수록: lp 가 닫히고(20 k → 340 Hz) dry 가 줄고 **wet 은 커진다**.
 * 직접음이 사라지고 방의 반사만 남는 게 "벽 뒤"의 소리다.
 */
export class SpatialSource {
  /** 소스를 여기 연결한다 (bank.play 의 dest) */
  readonly input: GainNode;
  readonly panner: PannerNode;
  private lp: BiquadFilterNode;
  private dryG: GainNode;
  private wetG: GainNode;
  private occCur = 0;
  private occTarget = 0;
  private pos = new THREE.Vector3();
  private probeT = 0;
  /** 오클루전 자동 측정을 끄고 싶을 때(내 몸에서 나는 소리 등) */
  autoOcclude = true;
  private wetBase: number;

  constructor(
    private space: AudioSpace,
    ctx: AudioContext,
    master: GainNode,
    opts: { ref?: number; rolloff?: number; max?: number; wet?: number } = {},
  ) {
    this.input = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.lp.Q.value = 0.4;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'exponential';
    this.panner.refDistance = opts.ref ?? 8;
    this.panner.rolloffFactor = opts.rolloff ?? 1;
    this.panner.maxDistance = opts.max ?? 400;
    this.dryG = ctx.createGain();
    this.wetG = ctx.createGain();
    this.wetBase = opts.wet ?? 1;
    this.wetG.gain.value = this.wetBase;
    this.input.connect(this.lp).connect(this.panner);
    this.panner.connect(this.dryG).connect(master);
    this.panner.connect(this.wetG).connect(space.send);
    space.track(this);
  }

  setPosition(x: number, y: number, z: number) {
    this.pos.set(x, y, z);
    this.panner.positionX.value = x;
    this.panner.positionY.value = y;
    this.panner.positionZ.value = z;
  }

  /** 직접 넣고 싶을 때 (0=열림 1=완전히 막힘) */
  setOcclusion(v: number) { this.occTarget = THREE.MathUtils.clamp(v, 0, 1); this.autoOcclude = false; }

  update(dt: number) {
    // 레이캐스트는 10 Hz 로 충분하다 — 그 사이는 아래 스무딩이 메운다
    if (this.autoOcclude) {
      this.probeT -= dt;
      if (this.probeT <= 0) { this.probeT = 0.1; this.occTarget = this.space.occlusionAt(this.pos); }
    }
    // 막히는 건 빠르게, 열리는 건 느리게. 반대로 하면 기둥 사이를 지날 때 소리가 펄럭인다
    const rate = this.occTarget > this.occCur ? 6 : 2.5;
    this.occCur += (this.occTarget - this.occCur) * Math.min(1, dt * rate);
    const o = this.occCur * settings.audio.occlusion;
    this.lp.frequency.value = 20000 * Math.pow(340 / 20000, o);
    this.dryG.gain.value = 1 - 0.72 * o;
    this.wetG.gain.value = this.wetBase * (1 + 1.1 * o);
  }

  dispose() {
    this.space.untrack(this);
    this.input.disconnect(); this.lp.disconnect(); this.panner.disconnect();
    this.dryG.disconnect(); this.wetG.disconnect();
  }
}
