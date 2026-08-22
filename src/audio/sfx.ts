import { settings } from '@/core/settings';
import { SampleBank } from './bank';
import { AudioSpace, SpatialSource } from './space';
/**
 * `AudioParam.exponentialRampToValueAtTime(0)` 은 **RangeError 를 던진다** — 지수 램프는 0 에 닿을 수 없다.
 * 실제로 콘솔에 찍혔다(사용자 리포트 2026-08-22): `land(0)` — 충격 0 짜리 착지가 gain 0 을 만들었다.
 * 오디오 슬라이더를 0 으로 내려도 같은 일이 난다. 두 겹으로 막는다:
 *   ① 생성기(`tap`·`thump`·`noiseBurst`)는 들리지 않을 세기면 **아예 만들지 않는다**
 *   ② 계산으로 0 이 될 수 있는 램프 목표는 `audible()` 로 바닥을 깐다
 */
const INAUDIBLE = 0.0002;
const audible = (v: number) => (v > 1e-4 ? v : 1e-4);

/** 발밑 표면 — 발소리 합성에 쓴다 */
export type Surface = 'grass' | 'sand' | 'water' | 'dirt' | 'gravel' | 'wood';

interface FootProfile {
  heelHz: number; heelDur: number; heel: number;      // ① 굽 임팩트
  bodyHz: number; bodyQ: number; bodyDur: number; body: number; bodyType: BiquadFilterType; // ② 발볼 질감
  scuffHz: number; scuffDur: number; scuffAt: number; scuff: number; // ③ 스커프
  grains: number;                                      // 알갱이 미세 버스트 개수
}

/** 표면별 발소리 성격. water 는 별도 경로(첨벙) */
const FOOT_PROFILE: Record<Exclude<Surface, 'water'>, FootProfile> = {
  // 마른 흙 논두렁 — 둔탁하고 짧다. 고역이 거의 없다
  dirt:   { heelHz: 54, heelDur: 0.075, heel: 1.0,  bodyHz: 380,  bodyQ: 1.3, bodyDur: 0.05,  body: 0.5,  bodyType: 'lowpass',  scuffHz: 2400, scuffDur: 0.035, scuffAt: 0.026, scuff: 0.14, grains: 0 },
  // 참배로 자갈 — 알갱이가 부딪히는 소리가 본체다
  gravel: { heelHz: 66, heelDur: 0.05,  heel: 0.55, bodyHz: 1700, bodyQ: 1.8, bodyDur: 0.035, body: 0.5,  bodyType: 'bandpass', scuffHz: 5400, scuffDur: 0.05,  scuffAt: 0.02,  scuff: 0.42, grains: 4 },
  // 들풀 — 부드럽고 스치는 소리
  grass:  { heelHz: 60, heelDur: 0.055, heel: 0.5,  bodyHz: 900,  bodyQ: 1.0, bodyDur: 0.045, body: 0.5,  bodyType: 'bandpass', scuffHz: 3200, scuffDur: 0.055, scuffAt: 0.022, scuff: 0.36, grains: 0 },
  // 모래
  sand:   { heelHz: 56, heelDur: 0.06,  heel: 0.5,  bodyHz: 1300, bodyQ: 0.7, bodyDur: 0.07,  body: 0.55, bodyType: 'bandpass', scuffHz: 4200, scuffDur: 0.06,  scuffAt: 0.025, scuff: 0.3,  grains: 0 },
  // 툇마루·다리 — 판이 울린다
  wood:   { heelHz: 130, heelDur: 0.1,  heel: 0.85, bodyHz: 820,  bodyQ: 4.5, bodyDur: 0.07,  body: 0.42, bodyType: 'bandpass', scuffHz: 3000, scuffDur: 0.03,  scuffAt: 0.02,  scuff: 0.18, grains: 0 },
};

/**
 * 효과음. **샘플 우선, 프로시저럴 폴백.**
 *  · `public/audio/manifest.json` 의 샘플(`SampleBank`)이 있으면 그것을 재생하고,
 *    키가 없거나(아직 Freesound 키가 없어 못 받은 소리) 로드에 실패하면 아래 Web Audio 합성이 그대로 돈다.
 *  · 첫 사용자 제스처 후에만 AudioContext 가 재생 가능하므로 `unlock()` 을 pointerdown/keydown 에 연결한다.
 *  · `preload()` 는 컨텍스트 없이 네트워크 선로드만 한다 (로딩 화면에서 호출)
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** 효과음 버스 — 마스터로 dry, 사본을 리버브 센드로. 대부분의 소리가 여기로 나간다 */
  private bus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private _space: AudioSpace | null = null;
  /** 샘플 뱅크 (다른 오디오 모듈도 같이 쓴다) */
  readonly bank = new SampleBank();

  /** 샘플 네트워크 선로드 — 로딩 화면에서 GLB 와 같이 받는다 */
  preload() { return this.bank.prefetch(); }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.startAmbient()); else this.startAmbient(); return; }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = settings.audio.master;
    this.master.connect(this.ctx.destination);
    // 공간(리버브 존·오클루전·덕킹). 효과음 버스는 dry 를 마스터로 보내고 사본을 리버브 센드로 흘린다 —
    // 센드 비율을 고정해 두면 존 프리셋의 `wet` 하나로 "이 방이 얼마나 울리는지"를 관리할 수 있다
    this._space = new AudioSpace(this.ctx, this.master);
    this.bus = this.ctx.createGain();
    this.bus.connect(this.master);
    const sendTrim = this.ctx.createGain();
    sendTrim.gain.value = 0.6;
    this.bus.connect(sendTrim).connect(this._space.send);
    // 2초 백색소음 버퍼
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void this.bank.attach(this.ctx, this.bus); // 샘플의 기본 출력도 효과음 버스 = 잔향을 탄다
    if (this.ctx.state === 'running') this.startAmbient();
    else void this.ctx.resume().then(() => this.startAmbient());
  }

  setMaster(v: number) { if (this.master) this.master.gain.value = v; }

  /** 다른 오디오 모듈(마츠리바야시 등)이 같은 컨텍스트/마스터를 쓰도록 노출 */
  get context() { return this.ctx; }
  get masterGain() { return this.master; }
  /** 리버브를 타는 기본 출력 — 월드에서 나는 거의 모든 소리 */
  get out() { return this.bus; }
  /** 공간을 안 타는 출력 — 심장소리처럼 **몸 안에서** 나는 소리 */
  get dryOut() { return this.master; }
  /** 앰비언스 출력 — 위협이 가까우면 여기가 눌린다(덕킹) */
  get ambientOut(): GainNode | null { return this._space?.ambientBus ?? this.master; }
  /** 리버브 존·오클루전·덕킹 (main 이 매 프레임 update 한다) */
  get space() { return this._space; }

  private ambientNodes: { gain: GainNode } | null = null;
  private ambientPending = false;
  /** Ambience(ambience.ts)가 붙어 있으면 true — 실녹음 바람 루프가 그쪽에서 돈다 */
  sampleAmbience = false;
  /**
   * 바람 앰비언스. Ambience 가 붙어 있고 샘플 뱅크에 `amb/wind` 가 있으면 그쪽 실녹음 루프가 담당하므로
   * 여기서는 아무것도 안 한다. 아니면(초원 sandbox, 샘플 없음) 프로시저럴 바람(로우패스 노이즈 + 느린 LFO). 한 번만 시작
   */
  startAmbient() {
    if (!this.ready() || this.ambientNodes || this.ambientPending) return;
    this.ambientPending = true;
    void this.bank.whenReady().then(() => {
      this.ambientPending = false;
      if (this.ambientNodes || (this.sampleAmbience && this.bank.has('amb/wind'))) return;
      this.startProceduralWind();
    });
  }
  private startProceduralWind() {
    if (!this.ready() || this.ambientNodes) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!; src.loop = true; src.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const gain = ctx.createGain(); gain.gain.value = settings.audio.ambient;
    // LFO 로 필터 컷오프를 천천히 흔들어 바람이 이는 느낌
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(lp.frequency);
    const lfo2 = ctx.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.043;
    const lfo2Gain = ctx.createGain(); lfo2Gain.gain.value = settings.audio.ambient * 0.5;
    lfo2.connect(lfo2Gain).connect(gain.gain);
    src.connect(lp).connect(bp).connect(gain).connect(this.ambientOut!);
    src.start(); lfo.start(); lfo2.start();
    this.ambientNodes = { gain };
  }
  setAmbient(v: number) { if (this.ambientNodes) this.ambientNodes.gain.gain.value = v; }

  // --- 프롤로그 (PLAN-STORY ACT 1): 빗소리 루프 + 범종 ---
  private rainNodes: { gain: GainNode; stop: () => void } | null = null;
  /**
   * 빗소리 — 몸통(로우패스) + 후두둑(하이패스) 노이즈 2층.
   * @param fade 끄는 데 걸리는 시간(초). ACT 1 의 「갑자기 모든 소리가 끊긴다」는 **0** 이어야 한다 —
   *             1.5 초에 걸쳐 사그라들면 그건 비가 그친 것이지 소리가 *끊긴* 게 아니다
   */
  setRain(on: boolean, fade = 1.5) {
    if (on) {
      if (!this.ready() || this.rainNodes) return;
      const ctx = this.ctx!;
      const mk = (rate: number, type: BiquadFilterType, freq: number, q: number, g: number) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noise!; src.loop = true; src.playbackRate.value = rate;
        const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = g;
        src.connect(f).connect(gg); src.start();
        return { src, gg };
      };
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, ctx.currentTime);
      out.gain.exponentialRampToValueAtTime(0.42, ctx.currentTime + 2.0);
      const a = mk(1.0, 'lowpass', 900, 0.5, 0.55);
      const b = mk(1.7, 'highpass', 2600, 0.7, 0.2);
      a.gg.connect(out); b.gg.connect(out); out.connect(this.ambientOut!);
      this.rainNodes = { gain: out, stop: () => { a.src.stop(); b.src.stop(); } };
    } else if (this.rainNodes) {
      const ctx = this.ctx!, n = this.rainNodes;
      this.rainNodes = null;
      // 완전한 0 으로 지수 램프를 걸 수 없어 0.0001 로 내린다. fade 0 이면 4 ms — 컷이다
      n.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + Math.max(0.004, fade));
      setTimeout(() => n.stop(), Math.max(30, fade * 1000 + 200));
    }
  }
  /**
   * 사람의 외침 — 빗속에서 멀리서 들리는 소리. 보이스 샘플이 없으므로 합성한다.
   *
   * 말소리로 들리게 하는 건 음높이가 아니라 **포먼트**(성도 공명)다. 톱니 성대음에
   * 밴드패스 두 개(F1 700 / F2 1200)를 겹치고, 한 번 외치는 동안 피치가 올랐다 떨어지게 한다.
   * 멀리서 나는 소리라 고역은 로우패스로 깎는다 — 그래야 "저 뒤에서" 들린다.
   * @param near true 면 바로 옆에서 외치는 소리 (사요의 「보지 마!」)
   */
  shout(gain = 0.6, near = false) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const dur = near ? 0.5 : 0.62;
    const base = near ? 240 : 150;   // 소녀 / 성인 남자
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * 0.86, t0);
    o.frequency.linearRampToValueAtTime(base * 1.18, t0 + dur * 0.22);
    o.frequency.linearRampToValueAtTime(base * 0.74, t0 + dur);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(audible(gain * (near ? 0.5 : 0.24)), t0 + 0.05);
    out.gain.setValueAtTime(gain * (near ? 0.5 : 0.24), t0 + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    // 포먼트 둘
    for (const [f, q, g] of [[near ? 780 : 700, 7, 1.0], [near ? 1450 : 1200, 9, 0.55]] as [number, number, number][]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(bp).connect(gg).connect(out);
    }
    // 거리감 — 멀수록 고역이 없다
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = near ? 3200 : 1100; lp.Q.value = 0.6;
    out.connect(lp).connect(this.out!);
    o.start(t0); o.stop(t0 + dur + 0.08);
  }

  /**
   * **말소리** — 외침(`shout`)이 아니라 평범한 대화. ACT 2 의 기사와 미오가 쓴다.
   *
   * 외침과 다른 점은 음높이가 아니라 **억양**이다: 외침은 피치가 올랐다 떨어지지만
   * 평서문은 처음부터 끝까지 내려온다. 그리고 짧게 끊긴 음절 두세 개로 나뉜다 —
   * 한 덩어리로 내면 신음처럼 들린다.
   * @param kind 'low' = 중년 남자(기사) · 'girl' = 열여섯(미오)
   */
  voice(gain = 0.5, kind: 'low' | 'girl' = 'low') {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const base = kind === 'low' ? 112 : 205;
    const f1 = kind === 'low' ? 620 : 760;
    const f2 = kind === 'low' ? 1080 : 1500;
    const syl = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < syl; i++) {
      const t = t0 + i * 0.19;
      const dur = 0.13 + Math.random() * 0.05;
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      // 평서문 — 음절마다 조금씩 내려간다
      const p = base * (1 - i * 0.06) * (0.96 + Math.random() * 0.08);
      o.frequency.setValueAtTime(p * 1.06, t);
      o.frequency.linearRampToValueAtTime(p * 0.9, t + dur);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(audible(gain * 0.3), t + 0.025);
      out.gain.setValueAtTime(gain * 0.3, t + dur * 0.6);
      out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      for (const [f, q, g] of [[f1, 8, 1.0], [f2, 10, 0.5]] as [number, number, number][]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f * (0.94 + Math.random() * 0.12); bp.Q.value = q;
        const gg = ctx.createGain(); gg.gain.value = g;
        o.connect(bp).connect(gg).connect(out);
      }
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = kind === 'low' ? 2200 : 3400;
      out.connect(lp).connect(this.out!);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }

  private busNodes: { gain: GainNode; stop: () => void } | null = null;
  /**
   * 시골버스 디젤 엔진 — 켜고 끄기만 한다.
   *
   * 디젤은 두 겹이다: **폭발 주기**(저역 톱니, 아이들링 ≈ 12 Hz 근처의 거친 음)와
   * **차체 울림**(로우패스 노이즈). 하나만 쓰면 모터보트나 바람이 된다.
   */
  busEngine(on: boolean) {
    if (on) {
      if (!this.ready() || this.busNodes) return;
      const ctx = this.ctx!;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, ctx.currentTime);
      out.gain.exponentialRampToValueAtTime(0.30, ctx.currentTime + 1.6);
      // ① 폭발 주기 — 톱니를 아주 낮게. 살짝 흔들어 기계가 고르지 않게 만든다
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = 47;
      const wob = ctx.createOscillator(); wob.type = 'sine'; wob.frequency.value = 2.3;
      const wobG = ctx.createGain(); wobG.gain.value = 3.2;
      wob.connect(wobG).connect(o.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 190; lp.Q.value = 3;
      const og = ctx.createGain(); og.gain.value = 0.5;
      o.connect(lp).connect(og).connect(out);
      // ② 차체 울림
      const src = ctx.createBufferSource();
      src.buffer = this.noise!; src.loop = true; src.playbackRate.value = 0.35;
      const nlp = ctx.createBiquadFilter();
      nlp.type = 'lowpass'; nlp.frequency.value = 380; nlp.Q.value = 0.7;
      const ng = ctx.createGain(); ng.gain.value = 0.55;
      src.connect(nlp).connect(ng).connect(out);
      out.connect(this.out!);
      o.start(); wob.start(); src.start();
      this.busNodes = { gain: out, stop: () => { o.stop(); wob.stop(); src.stop(); } };
    } else if (this.busNodes) {
      const ctx = this.ctx!, n = this.busNodes;
      this.busNodes = null;
      n.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      setTimeout(() => n.stop(), 1400);
    }
  }

  /** 에어 브레이크 — 쇳소리 끼익 + 공기 빠지는 프슛 */
  busBrake() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const v = settings.audio.combat * 0.5;
    // 브레이크 스퀼 — 좁은 밴드패스가 미끄러져 내려간다
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1150, t0);
    o.frequency.exponentialRampToValueAtTime(430, t0 + 1.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(audible(v * 0.28), t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    o.connect(bp).connect(g).connect(this.out!);
    o.start(t0); o.stop(t0 + 1.3);
    // 공기 — 브레이크가 풀리며 새어 나온다
    this.noiseBurst({ dur: 0.9, gain: v * 0.5, type: 'highpass', freq: 2600, freqEnd: 900, q: 0.7, attack: 0.06 });
  }

  /** 접이문 — 공기압 프슛 + 레일 덜컹 */
  busDoor() {
    if (!this.ready()) return;
    const v = settings.audio.combat * 0.5;
    this.noiseBurst({ dur: 0.55, gain: v * 0.45, type: 'highpass', freq: 3000, freqEnd: 1400, q: 0.6, attack: 0.03 });
    const ctx = this.ctx!;
    this.tap(ctx.currentTime + 0.62, 220, 2.2, 0.14, v * 0.5, 'bandpass');
    this.thump(70, 0.2, v * 0.35);
  }

  /** 범종 — 낮은 부분음 + 맥놀이(86/86.6 Hz 쌍) + 타격 노이즈. 종은 성대가 아니라 쇠가 운다 */
  bell(gain = 0.6, far = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    // 먼 종(ACT 4 「멀리 신사에서 종소리가 한 번」)은 **같은 종이 작아진 것이 아니다**:
    // 고역이 공기에 먹히고, 타격의 「깡」이 사라지고, 골짜기가 한 번 되돌려준다.
    let dst: AudioNode = this.out!;
    if (far > 0) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900 - far * 500; lp.Q.value = 0.4;
      lp.connect(this.out!);
      const dl = ctx.createDelay(2); dl.delayTime.value = 0.7;
      const dg = ctx.createGain(); dg.gain.value = 0.3 * far;
      lp.connect(dl).connect(dg).connect(this.out!);
      dst = lp;
    }
    for (const [f, g, dur] of [[86, 1.0, 9], [86.6, 0.55, 9], [172, 0.4, 6], [258, 0.22, 4.5], [430, 0.1, 2.5]] as [number, number, number][]) {
      const o = ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.0001, t0);
      // 멀면 어택도 늦다 — 소리가 도착하는 데 걸리는 시간이 파형에도 남는다
      gg.gain.exponentialRampToValueAtTime(audible(gain * g * 0.25), t0 + 0.02 + far * 0.12);
      gg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gg).connect(dst);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }
    if (far < 0.5) this.noiseBurst({ dur: 0.18, gain: gain * 0.3 * (1 - far * 2), type: 'bandpass', freq: 620, q: 2.5 });
  }

  // ============ ACT 3~4 — 부름 · 문지르기 · 마을 방송 ============

  /**
   * 월드 좌표에서 나는 소리의 출력 노드. `id` 로 재사용한다 — 부를 때마다 만들면 패너가 샌다.
   * 리스너(카메라)는 `ambience`/`matsuri` 가 매 프레임 갱신하므로 여기서는 위치만 얹으면 된다.
   */
  private panners = new Map<string, SpatialSource>();
  private panAt(id: string, x: number, y: number, z: number, ref = 8, rolloff = 1, max = 400): AudioNode {
    const ctx = this.ctx!;
    let p = this.panners.get(id);
    if (!p) {
      p = new SpatialSource(this._space!, ctx, this.master!, { ref, rolloff, max });
      this.panners.set(id, p);
    }
    p.panner.refDistance = ref; p.panner.rolloffFactor = rolloff; p.panner.maxDistance = max;
    p.setPosition(x, y, z);
    return p.input;
  }

  /** 모음 포먼트 — 이 셋이 없으면 사인 톤이지 사람 목소리가 아니다 */
  private static VOWEL: Record<string, [number, number, number]> = {
    i: [320, 2400, 3100],   // 이
    o: [460, 820, 2600],    // 오
    a: [780, 1180, 2700],   // 아
  };

  /**
   * **이름을 부르는 목소리** (금기 三). `voice()` 와 다른 점 셋:
   *  ① 위치가 있다 — 어느 쪽에서 부르는지 들려야 플레이어가 그쪽을 돌아본다
   *  ② 음절이 모음으로 정해진다(「미 오 야」 = i·o·a) — 웅얼거림이 아니라 **내 이름**이어야 한다
   *  ③ 거리는 세 가지로 만든다: 로우패스(공기가 고역을 먹는다) · 산울림 두 겹 · 늦은 어택
   *
   * @param far 0 = 코앞, 1 = 골짜기 건너
   */
  callName(x: number, y: number, z: number, opts: { gain?: number; far?: number; vowels?: string } = {}) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.04;
    const far = opts.far ?? 1;
    const out = ctx.createGain();
    out.gain.value = opts.gain ?? 0.9;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3400 - far * 2300; lp.Q.value = 0.4;
    const dst = this.panAt('call', x, y, z, 12, 0.85, 320);
    out.connect(lp).connect(dst);
    // 산울림 — 두 겹이면 "산에서 돌아온 소리"가 된다. 한 겹이면 그냥 에코다
    for (const [d, g] of [[0.21, 0.36 * far], [0.47, 0.19 * far]] as [number, number][]) {
      if (g < 0.02) continue;
      const dl = ctx.createDelay(1); dl.delayTime.value = d;
      const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 820;
      const dg = ctx.createGain(); dg.gain.value = g;
      out.connect(dl).connect(dlp).connect(dg).connect(dst);
    }
    // 부르는 말이라 첫 음절이 높고 **마지막이 길게 내려온다**
    const vowels = opts.vowels ?? 'ioa';
    const mel = [1.0, 0.95, 0.87];
    const base = 196;   // 어른 여자 — `voice('girl')`(205) 보다 낮게 잡아야 소녀가 아닌 언니로 들린다
    let t = t0;
    for (let i = 0; i < vowels.length; i++) {
      const last = i === vowels.length - 1;
      const dur = last ? 0.66 : 0.23;
      const p = base * (mel[i] ?? 0.87);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(p * 1.03, t);
      o.frequency.linearRampToValueAtTime(p * (last ? 0.85 : 0.97), t + dur);
      const e = ctx.createGain();
      const atk = 0.028 + far * 0.05;   // 먼 소리는 시작이 뭉개진다
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.3, t + atk);
      e.gain.setValueAtTime(0.3, t + dur * 0.55);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const F = Sfx.VOWEL[vowels[i]!] ?? Sfx.VOWEL['a']!;
      F.forEach((f, k) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9 + k * 2;
        const gg = ctx.createGain(); gg.gain.value = [1, 0.6, 0.22][k]!;
        o.connect(bp).connect(gg).connect(e);
      });
      e.connect(out);
      o.start(t); o.stop(t + dur + 0.05);
      t += dur + 0.06;
    }
  }

  /** 손바닥으로 돌을 문지른다 — 이끼가 벗겨질수록(p 0→1) 마찰이 거칠고 밝아진다 */
  stoneWipe(p = 0) {
    this.noiseBurst({
      dur: 0.15 + Math.random() * 0.09,
      gain: settings.audio.footstep * (0.09 + p * 0.05),
      type: 'bandpass', q: 0.9,
      freq: 760 + p * 900 + Math.random() * 260,
      freqEnd: 400 + p * 460,
      attack: 0.05,   // 문지르는 소리는 타격이 아니다 — 어택이 서면 손톱으로 긁는 소리가 된다
    });
  }

  /**
   * **마루 밑에서 나는 아이 웃음** (ACT 5, PLAN-STORY P3-2)
   *
   * 이 소리에 걸린 조건이 셋이다.
   *   ① **저역만** — 마루판이 고역을 먹는다. 밝게 들리면 마루 밑이 아니라 옆이다
   *   ② **짧다**(0.4 s) — 길면 들려 준 것이고, 짧아야 들은 것이다
   *   ③ **한 번만** — 두 번이면 유령의 소리고, 한 번이면 잘못 들은 것이다.
   *      이 장면은 후자여야 한다(호출하는 쪽이 한 번만 부른다)
   *
   * 위치가 중요하다: 이 좌표가 곧 **ACT 18 의 지하 입구**다. 방향이 들려야 「바닥 아래」가 성립한다.
   */
  underfloorLaugh(x: number, y: number, z: number, gain = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.02;
    // ref 3 · rolloff 2.2 — 아주 가까이서만 들린다. 경내를 벗어나면 사라져야 "마루 밑"이다
    const dst = this.panAt('underfloor', x, y, z, 3, 2.2, 30);
    const out = ctx.createGain();
    out.gain.value = gain;
    // 마루판 통과: 저역통과 + 살짝의 공진(마루 밑 빈 공간)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.7;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking'; body.frequency.value = 180; body.Q.value = 2.2; body.gain.value = 6;
    out.connect(lp).connect(body).connect(dst);

    // 「히히」 — 두 음절. 아이 목소리(높은 기음)인데 마루가 위를 잘라서 **낮게만** 남는다
    const base = 330;
    let t = t0;
    for (let i = 0; i < 2; i++) {
      const dur = 0.17;
      const p = base * (i === 0 ? 1.0 : 1.12);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(p, t);
      o.frequency.linearRampToValueAtTime(p * 0.94, t + dur);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      // 어택을 세우지 않는다 — 서면 웃음이 아니라 소리를 지르는 게 된다
      e.gain.exponentialRampToValueAtTime(0.5, t + 0.045);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(e).connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.03;
    }
  }

  /**
   * **굳게 잠긴 문을 민다** — 여닫이가 걸린 소리 + 나무가 삐걱이는 소리.
   * @param p 꾹 누르기 진행도 0~1. 세게 밀수록 삐걱임이 커지고 조금 높아진다
   */
  doorPush(x: number, y: number, z: number, p = 0) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.01;
    const dst = this.panAt('doorpush', x, y, z, 4, 1.4, 45);
    // 걸림쇠가 부딪히는 낮은 「덜컥」
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(84 + p * 26, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.11);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.exponentialRampToValueAtTime(settings.audio.footstep * (0.5 + p * 0.5), t0 + 0.008);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(e).connect(dst);
    o.start(t0); o.stop(t0 + 0.16);
    // 나무 삐걱임 — 좁은 대역의 잡음. 진행도에 따라 올라간다
    this.noiseBurst({
      dur: 0.2 + p * 0.16, gain: settings.audio.footstep * (0.05 + p * 0.09),
      type: 'bandpass', q: 6.5, freq: 380 + p * 320, freqEnd: 300 + p * 180, attack: 0.07,
    });
  }

  /** 유리 풍경(風鈴) — 부분음 셋이 빠르게 사라진다. 바람이 없어도 울린다 (ACT 4) */
  furin(x: number, y: number, z: number, gain = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const dst = this.panAt('furin', x, y, z, 4, 1.5, 55);
    const t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const t = t0 + k * (0.16 + Math.random() * 0.14);
      for (const [f, g, dur] of [[2620, 1, 1.6], [3960, 0.4, 0.9], [5240, 0.16, 0.5]] as [number, number, number][]) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * (0.99 + Math.random() * 0.02);
        const e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(gain * g * 0.14, t + 0.004);
        e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(e).connect(dst);
        o.start(t); o.stop(t + dur + 0.05);
      }
    }
  }

  /** 빈집 텔레비전 — 채널 없는 잡음. 켜고 끄기만 한다 (ACT 4 「빈집 텔레비전에서 잡음 섞인 방송」) */
  private tvNodes: { gain: GainNode; stop: () => void } | null = null;
  tvStatic(on: boolean, x = 0, y = 0, z = 0) {
    if (on) {
      if (!this.ready() || this.tvNodes) return;
      const ctx = this.ctx!;
      const dst = this.panAt('tv', x, y, z, 3, 1.6, 40);
      const src = ctx.createBufferSource();
      src.buffer = this.noise!; src.loop = true; src.playbackRate.value = 1.0;
      // 브라운관 스피커는 저역이 없고 고역도 없다 — 좁은 대역이라 "기계에서 나오는 소리"가 된다
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
      const g = ctx.createGain(); g.gain.value = 0.045;
      // 잡음만 있으면 라디오다. 진폭을 불규칙하게 흔들어야 **말소리가 섞였다 끊긴다**로 읽힌다
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.7;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.03;
      lfo.connect(lfoG).connect(g.gain);
      src.connect(hp).connect(lp).connect(g).connect(dst);
      src.start(); lfo.start();
      this.tvNodes = { gain: g, stop: () => { src.stop(); lfo.stop(); } };
    } else if (this.tvNodes) {
      const n = this.tvNodes;
      this.tvNodes = null;
      n.gain.gain.linearRampToValueAtTime(0.0001, this.ctx!.currentTime + 0.25);
      setTimeout(() => n.stop(), 400);
    }
  }

  // ---- 마을 방송(防災無線) ----
  /**
   * 확성기 색깔. 나팔은 **300~2800 Hz 밖을 못 낸다** — 이 대역 제한 하나가
   * "스피커에서 나오는 소리"의 90 %다. 거기에 약한 클리핑(과입력)을 얹는다.
   */
  private hornChain(dst: AudioNode): AudioNode {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800; lp.Q.value = 0.7;
    // 나팔의 공진 — 확성기 특유의 "깡깡한" 중역 피크
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1400; pk.Q.value = 1.6; pk.gain.value = 7;
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const v = (i / 512) - 1; curve[i] = Math.tanh(v * 2.2) * 0.82; }
    sh.curve = curve;
    hp.connect(lp).connect(pk).connect(sh).connect(dst);
    return hp;
  }

  private paNodes: { gain: GainNode; stop: () => void } | null = null;
  /** 스피커가 켜진다 — 「틱」 하고 험과 히스가 깔린다. 이 바닥소음이 방송 내내 유지된다 */
  paOn(x: number, y: number, z: number) {
    if (!this.ready() || this.paNodes) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const dst = this.panAt('pa', x, y, z, 14, 0.8, 500);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.5, t0 + 0.05);
    out.connect(dst);
    // 험(전원) + 히스(회로) — 둘 다 아주 작게. 이게 없으면 방송이 "허공에서" 난다
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60;
    const humG = ctx.createGain(); humG.gain.value = 0.035;
    hum.connect(humG).connect(out);
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise!; hiss.loop = true; hiss.playbackRate.value = 1.2;
    const hbp = ctx.createBiquadFilter(); hbp.type = 'bandpass'; hbp.frequency.value = 1800; hbp.Q.value = 0.6;
    const hg = ctx.createGain(); hg.gain.value = 0.022;
    hiss.connect(hbp).connect(hg).connect(out);
    hum.start(); hiss.start();
    // 켜지는 「틱」
    this.tap(t0, 1800, 1.4, 0.05, 0.22, 'bandpass');
    this.paNodes = { gain: out, stop: () => { hum.stop(); hiss.stop(); } };
  }
  /** 스피커가 꺼진다 — 페이드가 아니라 **끊긴다**. 방송은 항상 뚝 끊긴다 */
  paOff() {
    if (!this.paNodes) return;
    const n = this.paNodes;
    this.paNodes = null;
    const ctx = this.ctx!;
    n.gain.gain.setValueAtTime(n.gain.gain.value, ctx.currentTime);
    n.gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
    this.tap(ctx.currentTime + 0.02, 900, 1.2, 0.06, 0.16, 'bandpass');
    setTimeout(() => n.stop(), 200);
  }

  /** 시보 차임 — 하강 3음. 마을 방송은 언제나 이걸로 시작한다 */
  paChime(x: number, y: number, z: number, gain = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const horn = this.hornChain(this.panAt('pa', x, y, z, 14, 0.8, 500));
    const t0 = ctx.currentTime;
    [988, 784, 659].forEach((f, i) => {
      const t = t0 + i * 0.62;
      // 종 차임은 배음이 정수배가 아니다 — 2.76 배를 얹으면 금속으로 들린다
      for (const [mul, g] of [[1, 1], [2.76, 0.3], [5.4, 0.1]] as [number, number][]) {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = f * mul;
        const e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(gain * g * 0.3, t + 0.01);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        o.connect(e).connect(horn);
        o.start(t); o.stop(t + 1.6);
      }
    });
  }

  /**
   * 방송 목소리 — 확성기를 통과한 남자 목소리. 자막이 내용을 말하므로 여기서는 **말투**만 만든다:
   * 공지문이라 음절이 고르고 끝이 살짝 올라간다(읽는 사람은 감정이 없다).
   * @param syl 음절 수 — 자막 글자 수에서 넘긴다
   */
  paVoice(x: number, y: number, z: number, syl = 8, gain = 0.55) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const horn = this.hornChain(this.panAt('pa', x, y, z, 14, 0.8, 500));
    const t0 = ctx.currentTime + 0.02;
    const vs = 'aoia';
    let t = t0;
    for (let i = 0; i < syl; i++) {
      const dur = 0.15 + Math.random() * 0.05;
      const p = 118 * (1 + Math.sin(i * 0.9) * 0.04) * (i === syl - 1 ? 1.06 : 1);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(p, t);
      o.frequency.linearRampToValueAtTime(p * (i === syl - 1 ? 1.08 : 0.98), t + dur);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(gain * 0.5, t + 0.02);
      e.gain.setValueAtTime(gain * 0.5, t + dur * 0.7);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const F = Sfx.VOWEL[vs[i % vs.length]!]!;
      F.forEach((f, k) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = f * 0.92; bp.Q.value = 7 + k * 2;
        const gg = ctx.createGain(); gg.gain.value = [1, 0.55, 0.2][k]!;
        o.connect(bp).connect(gg).connect(e);
      });
      e.connect(horn);
      o.start(t); o.stop(t + dur + 0.04);
      t += dur + 0.055;
    }
  }

  /** 방송 잡음이 심해진다 — 「심한 잡음」 한 번 (ACT 4) */
  paNoise(x: number, y: number, z: number, dur = 0.9, gain = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const horn = this.hornChain(this.panAt('pa', x, y, z, 14, 0.8, 500));
    const src = ctx.createBufferSource();
    src.buffer = this.noise!; src.loop = true; src.playbackRate.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * 0.5, t0 + 0.03);
    // 지지직 — 진폭이 계단처럼 튀어야 접촉 불량으로 들린다
    for (let i = 1; i < 10; i++) {
      g.gain.setValueAtTime(gain * (0.12 + Math.random() * 0.5), t0 + dur * (i / 10));
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g).connect(horn);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  private ready() { return this.ctx && this.master && this.noise && this.ctx.state === 'running'; }

  private noiseBurst(opts: { dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; freqEnd?: number; attack?: number }) {
    // 들리지 않을 세기면 만들지 않는다 — 지수 램프가 0 을 받으면 RangeError 다 (INAUDIBLE 주석)
    if (!this.ready() || !(opts.gain > INAUDIBLE)) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = opts.type; f.frequency.setValueAtTime(opts.freq, t0); f.Q.value = opts.q ?? 1;
    if (opts.freqEnd) f.frequency.exponentialRampToValueAtTime(opts.freqEnd, t0 + opts.dur);
    const g = ctx.createGain();
    const atk = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t0); src.stop(t0 + opts.dur + 0.05);
  }

  private thump(freq: number, dur: number, gain: number) {
    // `land(0)` 처럼 충격이 0 인 호출이 실제로 온다 → 지수 램프가 0 을 받아 RangeError 를 던졌다
    if (!this.ready() || !(gain > INAUDIBLE)) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.out!);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // --- 발소리 ---------------------------------------------------------------
  // 발소리는 "노이즈 한 방"이 아니라 세 겹이다:
  //   ① 굽(heel)  — 짧은 저역 임팩트. 사인만 쓰면 킥드럼이 되므로 로우패스 노이즈를 섞는다
  //   ② 발볼(body) — 표면의 재질감. 공진(Q)이 재질을 만든다. 감쇠가 아주 빨라야 "탁" 소리가 난다
  //   ③ 스커프     — 20~40 ms 뒤 발이 끌리며 나는 고역. 달릴수록 커진다
  // 자갈처럼 알갱이가 있는 표면은 ②를 잘게 쪼갠 미세 버스트를 추가로 뿌린다.
  // (프로시저럴의 한계는 있다 — H5 에서 실제 샘플로 교체할 자리)

  /** 임의 시각 t 에 예약하는 노이즈 탭 (짧고 빠르게 감쇠) */
  private tap(t: number, freq: number, q: number, dur: number, gain: number, type: BiquadFilterType = 'bandpass', freqEnd?: number) {
    if (!this.ready() || gain <= 0.0002) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    // 버퍼의 임의 지점에서 시작해 매번 다른 노이즈가 나오게
    const off = Math.random() * (this.noise!.duration - dur - 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.0025); // 거의 즉시 최대 → 타격감
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out!);
    src.start(t, off); src.stop(t + dur + 0.03);
  }

  /** 굽 임팩트: 저역 사인 + 로우패스 노이즈 (사인만 쓰면 킥드럼처럼 들린다) */
  private impact(t: number, freq: number, dur: number, gain: number) {
    if (!this.ready() || gain <= 0.0002) return;
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.72, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!);
    o.start(t); o.stop(t + dur + 0.03);
    this.tap(t, freq * 4.5, 0.6, dur * 0.7, gain * 0.5, 'lowpass');
  }

  /** 발소리 — 샘플(`foot/<surface>`)이 있으면 샘플, 없으면 표면별 3단 합성. `foot` 으로 좌우 음색을 미세하게 바꿔 반복감을 줄인다 */
  /**
   * 좌우 발이 번갈아 쓸 표본 번호. 왼발은 짝수·오른발은 홀수 자리에서 차례로 돌린다 —
   * 같은 표본이 두 걸음 연속 나오지 않으므로 걸음이 **둘**로 들린다.
   */
  private footN: Record<'L' | 'R', number> = { L: 0, R: 0 };
  private footVariant(key: string, foot: 'L' | 'R'): number | undefined {
    const n = this.bank.count(key);
    if (n < 2) return undefined;
    const start = foot === 'R' ? 1 : 0;
    const pool: number[] = [];
    for (let i = start; i < n; i += 2) pool.push(i);
    if (!pool.length) return undefined;
    return pool[this.footN[foot]++ % pool.length]!;
  }

  footstep(speed: number, surface: Surface = 'grass', foot: 'L' | 'R' = 'L') {
    if (!this.ready()) return;
    const s = settings.audio;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.001;
    const k = Math.min(1, Math.max(0, speed / 3.6)); // 걷기 ≈ 0.42, 달리기 = 1
    const vol = s.footstep * (0.5 + 0.8 * k);
    const vary = 0.9 + Math.random() * 0.2;
    const side = foot === 'R' ? 0.93 : 1.07; // 좌우 발 음색 차

    if (this.bank.has(`foot/${surface}`)) {
      // 샘플: 좌우·걸음마다 피치를 ±4% 흔들고, 달릴수록 크게. 물은 달릴 때 첨벙이 더 길게 들리도록 살짝 느리게
      const rate = (0.96 + Math.random() * 0.08) * (foot === 'R' ? 0.97 : 1.03) * (surface === 'water' ? 1 - 0.08 * k : 1);
      // **좌우가 서로 다른 표본을 쓴다.** 무작위로 뽑으면 같은 소리가 연달아 나서
      // 두 발이 아니라 한 발로 뛰는 것처럼 들린다 — 왼발은 짝수, 오른발은 홀수 표본을 돌린다
      this.bank.play(`foot/${surface}`, { gain: vol * 1.15, rate, index: this.footVariant(`foot/${surface}`, foot) });
      // 실내 마루: 가끔 삐걱
      if (surface === 'wood' && this.bank.has('foot/creak') && Math.random() < 0.22) this.bank.play('foot/creak', { gain: vol * 0.6, rate: 0.85 + Math.random() * 0.3, at: 0.05 });
      return;
    }

    if (surface === 'water') { // 논물 — 첨벙
      this.tap(t0, 1500 * vary, 0.5, 0.09 + k * 0.05, vol * 0.9, 'bandpass', 380);
      this.tap(t0 + 0.012, 5200 * vary, 0.7, 0.16, vol * 0.5 * (0.4 + 0.6 * k), 'highpass');
      this.impact(t0 + 0.004, 78, 0.07, vol * 0.35);
      for (let i = 0; i < 3; i++) this.tap(t0 + 0.03 + Math.random() * 0.09, 2200 + Math.random() * 3500, 4, 0.03, vol * 0.18 * Math.random(), 'bandpass');
      return;
    }

    const P = FOOT_PROFILE[surface] ?? FOOT_PROFILE.grass;
    this.impact(t0, P.heelHz * vary * side, P.heelDur, vol * P.heel);
    this.tap(t0 + 0.004, P.bodyHz * vary * side, P.bodyQ, P.bodyDur, vol * P.body, P.bodyType);
    if (P.scuff > 0) {
      this.tap(t0 + P.scuffAt, P.scuffHz * vary, 0.8, P.scuffDur, vol * P.scuff * (0.35 + 0.65 * k), 'highpass');
    }
    for (let i = 0; i < P.grains; i++) {
      this.tap(t0 + 0.005 + Math.random() * 0.055, 2600 + Math.random() * 5200, 3.5, 0.014, vol * 0.3 * (0.4 + Math.random() * 0.6), 'bandpass');
    }
  }

  /** 검 휘두름 — 샘플(`combat/swing`) 또는 밴드패스 노이즈 스윕 */
  swing(combo = 0) {
    const s = settings.audio;
    if (this.bank.play('combat/swing', { gain: s.combat * (0.8 + combo * 0.12), rate: 1 + combo * 0.12 })) return;
    const p = 1 + combo * 0.18; // 타수가 올라갈수록 높고 길게
    this.noiseBurst({ dur: 0.22 + combo * 0.05, gain: s.combat * (0.55 + combo * 0.1), type: 'bandpass', freq: 600 * p, freqEnd: 2600 * p, q: 1.4, attack: 0.03 });
    this.noiseBurst({ dur: 0.12, gain: s.combat * 0.2, type: 'highpass', freq: 3500, attack: 0.05 });
  }
  /** 타격(나무·짚) — 샘플(`combat/hit`) 또는 둔탁한 썸프 + 짧은 노이즈 */
  hit(combo = 0) {
    const s = settings.audio;
    const g = 1 + combo * 0.25;
    if (this.bank.play('combat/hit', { gain: s.combat * 0.9 * g, rate: 0.95 + Math.random() * 0.1 - combo * 0.06 })) return;
    this.thump((110 - combo * 15) + Math.random() * 30, 0.09 + combo * 0.03, s.combat * 0.9 * g);
    this.noiseBurst({ dur: 0.08, gain: s.combat * 0.6, type: 'lowpass', freq: 1200, q: 0.9, attack: 0.002 });
    this.noiseBurst({ dur: 0.05, gain: s.combat * 0.3, type: 'bandpass', freq: 2200, q: 2, attack: 0.001 });
  }
  /** 허수아비 쓰러짐 */
  dummyDown() {
    const s = settings.audio;
    if (this.bank.play('combat/down', { gain: s.combat, rate: 0.8 + Math.random() * 0.1 })) { this.thump(60, 0.3, s.combat * 0.4); return; }
    this.thump(70, 0.25, s.combat * 0.8);
    this.noiseBurst({ dur: 0.3, gain: s.combat * 0.4, type: 'lowpass', freq: 700, attack: 0.01 });
  }
  /** 장착/줍기 — 샘플(`combat/equip`) 또는 금속성 짧은 링 */
  equip() {
    if (!this.ready()) return;
    if (this.bank.play('combat/equip', { gain: settings.audio.combat * 0.8, rate: 0.95 + Math.random() * 0.1 })) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    for (const [f, g] of [[1800, 0.25], [2700, 0.15], [4100, 0.08]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g * settings.audio.combat, t0 + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      o.connect(gn).connect(this.out!); o.start(t0); o.stop(t0 + 0.4);
    }
    this.noiseBurst({ dur: 0.06, gain: settings.audio.combat * 0.2, type: 'highpass', freq: 5000, attack: 0.002 });
  }

  // --- 여름밤 앰비언스: 벌레·개구리·풍경 (H5 에서 실제 샘플로 교체 예정) ---
  private nightTimer = 0;
  private nightOn = false;
  /** 여름밤 벌레 소리 시작 (바람 앰비언스와 함께 쓴다) */
  startNight() { this.nightOn = true; }
  stopNight() { this.nightOn = false; }
  /**
   * 매 프레임 호출 — 랜덤 간격으로 벌레/개구리/풍경 원샷을 뿌린다.
   * 샘플 앰비언스(ambience.ts)가 해당 바탕을 돌리고 있으면 그 종류의 합성음은 내지 않는다 (폴백 전용)
   */
  updateNight(dt: number) {
    if (!this.nightOn || !this.ready()) return;
    this.nightTimer -= dt;
    if (this.nightTimer > 0) return;
    this.nightTimer = 0.35 + Math.random() * 0.9;
    const b = this.bank;
    const r = Math.random();
    if (r < 0.5) { if (!b.has('amb/crickets') && !b.has('amb/suzumushi')) this.cricket(); }
    else if (r < 0.82) { if (!b.has('amb/frogs')) this.frog(); }
    else if (!b.has('amb/furin')) this.windChime();
  }
  /** 귀뚜라미: 짧은 고역 트릴 */
  private cricket() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + Math.random() * 0.4;
    const base = 4200 + Math.random() * 1800;
    const n = 3 + Math.floor(Math.random() * 3);
    const g = ctx.createGain(); g.gain.value = settings.audio.ambient * (0.5 + Math.random() * 0.5);
    g.connect(this.ambientOut!);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.055;
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = base;
      const eg = ctx.createGain();
      eg.gain.setValueAtTime(0.0001, t);
      eg.gain.exponentialRampToValueAtTime(0.06, t + 0.004);
      eg.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = base; bp.Q.value = 8;
      o.connect(bp).connect(eg).connect(g);
      o.start(t); o.stop(t + 0.05);
    }
  }
  /** 개구리: 낮고 짧은 꾸룩 */
  private frog() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + Math.random() * 0.5;
    const f = 150 + Math.random() * 110;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t0);
    o.frequency.linearRampToValueAtTime(f * 0.72, t0 + 0.16);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(settings.audio.ambient * 0.55, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    o.connect(lp).connect(g).connect(this.ambientOut!);
    o.start(t0); o.stop(t0 + 0.25);
  }
  /** 풍경(風鈴): 맑은 금속 종 — 아주 가끔 */
  private windChime() {
    if (!this.ready()) return;
    if (Math.random() > 0.35) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + Math.random() * 0.8;
    const base = 1500 + Math.random() * 900;
    for (const [mul, gv] of [[1, 0.26], [2.76, 0.12], [5.4, 0.05]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gv * settings.audio.ambient * 2.2, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      o.connect(g).connect(this.ambientOut!);
      o.start(t0); o.stop(t0 + 1.7);
    }
  }

  // --- 규칙 이벤트 ---
  /** 공물 줍기: 맑은 종 한 번 */
  pickup() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    for (const [f, g, d] of [[1046, 0.22, 0.9], [2093, 0.09, 0.6], [1568, 0.06, 0.5]] as [number, number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(g, t0 + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(e).connect(this.out!); o.start(t0); o.stop(t0 + d + 0.05);
    }
  }
  /** 봉납: 낮은 종(梵鐘) 울림 */
  offer() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    for (const [f, g] of [[110, 0.5], [220, 0.25], [331, 0.12], [552, 0.05]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(g, t0 + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.5);
      o.connect(e).connect(this.out!); o.start(t0); o.stop(t0 + 4.6);
    }
  }
  /** 탈출: 새벽 — 높은 지속음 + 새 소리 한 마디 */
  escape() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.12, t0 + 1.5); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 6);
    o.connect(e).connect(this.out!); o.start(t0); o.stop(t0 + 6.1);
    for (let i = 0; i < 4; i++) { const t = t0 + 1.2 + i * 0.18; const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.setValueAtTime(2600 + i * 200, t); b.frequency.exponentialRampToValueAtTime(3400, t + 0.08);
      const be = ctx.createGain(); be.gain.setValueAtTime(0.0001, t); be.gain.exponentialRampToValueAtTime(0.08, t + 0.01); be.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); b.connect(be).connect(this.out!); b.start(t); b.stop(t + 0.15); }
  }

  // --- 연출형 요괴 스팅어 ---
  /** 놋페라보가 돌아본다: 낮은 현 한 번 + 종이 옷자락 */
  nopperaTurn() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(72, t0); o.frequency.exponentialRampToValueAtTime(58, t0 + 0.9);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    o.connect(lp).connect(g).connect(this.out!); o.start(t0); o.stop(t0 + 1.2);
    // 위에 얹는 숨: 샘플(사람 숨을 25% 속도로 늘린 것)이 있으면 그것을, 없으면 옷자락 노이즈
    if (!this.bank.play('yokai/breath', { gain: 0.9, rate: 0.95 + Math.random() * 0.1 })) {
      this.noiseBurst({ dur: 0.35, gain: 0.25, type: 'bandpass', freq: 1800, q: 0.8, attack: 0.05 });
    }
  }
  /** 놋페라보 소멸: 짧은 역재생 느낌의 고역 슬라이드 */
  nopperaVanish() {
    this.noiseBurst({ dur: 0.45, gain: 0.35, type: 'bandpass', freq: 600, freqEnd: 5200, q: 2.5, attack: 0.2 });
  }
  /** 초칭오바케 눈 뜸: 젖은 눈 깜빡임 — 아주 짧은 고역 틱 두 번 */
  eyeOpen() {
    if (!this.ready()) return;
    // 눈꺼풀이 열리는 축축한 소리 — 샘플 우선. 뒤따르는 하강 사인이 "눈" 의 성격을 만든다
    if (!this.bank.play('yokai/eye', { gain: 0.9, rate: 0.95 + Math.random() * 0.12 })) {
      this.noiseBurst({ dur: 0.04, gain: 0.5, type: 'highpass', freq: 4000, attack: 0.002 });
    }
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.07;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1900, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + 0.09);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    o.connect(g).connect(this.out!); o.start(t0); o.stop(t0 + 0.12);
  }

  /** 초칭 밝기 전환 — 종이가 부스럭거리고(샘플 `chochin/toggle` 또는 합성) 불이 커지는 소리 */
  lanternToggle(level: number) {
    if (!this.ready()) return;
    if (!this.bank.play('chochin/toggle', { gain: settings.audio.footstep * 0.9, rate: 1.05 + Math.random() * 0.15 })) {
      this.noiseBurst({ dur: 0.13, gain: settings.audio.footstep * 0.5, type: 'bandpass', freq: 2600 + Math.random() * 900, q: 0.8, attack: 0.004 });
    }
    if (level > 0) {
      const ctx = this.ctx!, t0 = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(level === 2 ? 320 : 220, t0);
      o.frequency.exponentialRampToValueAtTime(level === 2 ? 620 : 360, t0 + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(settings.audio.footstep * 0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g).connect(this.out!); o.start(t0); o.stop(t0 + 0.25);
    }
  }

  /** 도로타보 — 진흙이 갈라지며 솟는 소리: 샘플(`yokai/mud`) + 저역 럼블, 없으면 럼블 + 젖은 첨벙 합성 */
  mudRise() {
    if (!this.ready()) return;
    const s = settings.audio;
    if (this.bank.play('yokai/mud', { gain: s.combat, rate: 0.8 + Math.random() * 0.15 })) { this.thump(38, 0.7, s.combat * 0.7); return; }
    this.thump(38, 0.7, s.combat * 0.9);
    this.noiseBurst({ dur: 0.55, gain: s.combat * 0.55, type: 'lowpass', freq: 300, q: 0.8, attack: 0.03 });
    this.noiseBurst({ dur: 0.4, gain: s.combat * 0.45, type: 'bandpass', freq: 900, freqEnd: 380, q: 0.6, attack: 0.05 });
    for (let i = 0; i < 5; i++) {
      this.tap(this.ctx!.currentTime + 0.15 + Math.random() * 0.4, 1600 + Math.random() * 2400, 2.5, 0.05, s.combat * 0.25, 'bandpass');
    }
  }

  /** 도로타보 — 울부짖음: 샘플(`yokai/wail`) 또는 포먼트 있는 낮은 신음("논 돌려내라"의 자리) */
  dorotaboWail() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const s = settings.audio;
    if (this.bank.play('yokai/wail', { gain: s.combat, rate: 0.85 + Math.random() * 0.12 })) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t0);
    o.frequency.linearRampToValueAtTime(150, t0 + 0.5);
    o.frequency.linearRampToValueAtTime(78, t0 + 1.5);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 350; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 780; f2.Q.value = 6;
    const sum = ctx.createGain();
    f1.connect(sum); f2.connect(sum);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t0);
    e.gain.exponentialRampToValueAtTime(s.combat * 0.85, t0 + 0.25);
    e.gain.setValueAtTime(s.combat * 0.85, t0 + 0.9);
    e.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    // 목이 떨리는 비브라토
    const vib = ctx.createOscillator(); vib.frequency.value = 6.5;
    const vibG = ctx.createGain(); vibG.gain.value = 9;
    vib.connect(vibG).connect(o.frequency);
    o.connect(f1); o.connect(f2);
    sum.connect(e).connect(this.out!);
    o.start(t0); vib.start(t0); o.stop(t0 + 1.7); vib.stop(t0 + 1.7);
  }

  jump() {
    const s = settings.audio;
    if (this.bank.play('foot/jump', { gain: s.jump * 0.9, rate: 1.1 + Math.random() * 0.2 })) return;
    this.noiseBurst({ dur: 0.18, gain: s.jump * 0.5, type: 'bandpass', freq: 400, freqEnd: 1800, q: 1.2, attack: 0.02 });
    this.thump(120, 0.08, s.jump * 0.3);
  }

  land(impact: number) {
    const s = settings.audio;
    const k = Math.min(1, impact / 12);
    if (this.bank.play('foot/land', { gain: s.land * (0.5 + 0.7 * k), rate: 0.9 + Math.random() * 0.15 })) { this.thump(55, 0.12 + k * 0.08, s.land * 0.35 * k); return; }
    this.thump(60, 0.14 + k * 0.08, s.land * (0.4 + 0.6 * k));
    this.noiseBurst({ dur: 0.12 + k * 0.08, gain: s.land * (0.3 + 0.5 * k), type: 'lowpass', freq: 900, q: 0.8, attack: 0.004 });
  }

  // --- H3 규칙용 (다른 세션이 호출부를 연결한다): 던지기·소금·은신·숨소리. 샘플 우선 + 합성 폴백 ---
  /** 던지기 — 휘익 */
  throw() {
    const s = settings.audio;
    if (this.bank.play('throw/whoosh', { gain: s.combat * 0.8, rate: 1.1 + Math.random() * 0.2 }) || this.bank.play('combat/swing', { gain: s.combat * 0.6, rate: 1.25 + Math.random() * 0.2 })) return;
    this.noiseBurst({ dur: 0.2, gain: s.combat * 0.45, type: 'bandpass', freq: 500, freqEnd: 2200, q: 1.2, attack: 0.03 });
  }
  /** 던진 돌이 떨어짐 — 표면 발소리를 낮고 짧게 + 둔탁한 썸프. 요괴를 부르는 소음의 소리 */
  stoneLand(surface: Surface = 'dirt') {
    const s = settings.audio;
    const key = `foot/${surface}`;
    if (this.bank.has(key)) {
      this.bank.play(key, { gain: s.combat * 0.9, rate: 0.75 + Math.random() * 0.1 });
      if (surface !== 'water') this.bank.play(key, { gain: s.combat * 0.4, rate: 0.9 + Math.random() * 0.15, at: 0.09 + Math.random() * 0.05 }); // 튕김
      this.thump(surface === 'wood' ? 140 : 70, 0.12, s.combat * 0.45);
      return;
    }
    this.thump(surface === 'wood' ? 140 : 70, 0.14, s.combat * 0.7);
    this.noiseBurst({ dur: 0.1, gain: s.combat * 0.5, type: surface === 'water' ? 'bandpass' : 'lowpass', freq: surface === 'water' ? 1800 : 1100, q: 0.8, attack: 0.003 });
  }
  /**
   * 까마귀가 놀라 날아오름 — 까악 + 날갯짓.
   *
   * 까마귀 울음은 성대가 아니라 명관(鳴管)에서 나와 **배음이 촘촘하고 거칠다**.
   * 사인으로는 절대 안 나오고, 톱니를 좁은 밴드패스에 넣어 포먼트를 만들어야 그 소리가 된다.
   * 한 번 우는 동안 피치가 살짝 올랐다 내려오는 것(까아-악)이 특징이라 그것도 넣는다.
   *
   * @param dist 플레이어까지 거리(m) — 거리 감쇠에 쓴다
   * @param count 동시에 날아오른 마리 수 — 울음 횟수와 날갯짓 밀도
   */
  crowFlush(dist: number, count = 1) {
    const s = settings.audio;
    const near = Math.max(0, 1 - dist / 36);
    const gain = s.combat * 0.62 * near * near;
    if (gain < 0.012) return;
    const n = Math.max(1, Math.min(3, Math.round(1 + count * 0.45)));
    if (this.bank.has('amb/crow')) {
      for (let i = 0; i < n; i++) {
        this.bank.play('amb/crow', { gain: gain * (1 - i * 0.2), rate: 0.9 + Math.random() * 0.2, at: i * (0.19 + Math.random() * 0.14) });
      }
    } else {
      for (let i = 0; i < n; i++) this.caw(i * (0.19 + Math.random() * 0.14), gain * (1 - i * 0.2));
    }
    this.wingBeats(gain * 0.55, count);
  }

  /** 까악 한 번 */
  private caw(at: number, gain: number) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime + at;
    const f0 = 620 + Math.random() * 140;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.86, t0);
    o.frequency.linearRampToValueAtTime(f0, t0 + 0.045);      // 까아-
    o.frequency.linearRampToValueAtTime(f0 * 0.72, t0 + 0.26); // -악
    // 명관의 거친 떨림
    const lfo = ctx.createOscillator();
    lfo.type = 'square'; lfo.frequency.value = 42 + Math.random() * 18;
    const lfoG = ctx.createGain(); lfoG.gain.value = f0 * 0.06;
    lfo.connect(lfoG).connect(o.frequency);
    // 포먼트 — 이게 없으면 그냥 부저 소리다
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.setValueAtTime(1250, t0); f1.Q.value = 2.6;
    f1.frequency.linearRampToValueAtTime(900, t0 + 0.26);
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking'; f2.frequency.value = 2600; f2.Q.value = 1.4; f2.gain.value = 9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(gain * 0.55, t0 + 0.10);
    g.gain.exponentialRampToValueAtTime(gain * 0.8, t0 + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.30);
    o.connect(f1).connect(f2).connect(g).connect(this.out!);
    o.start(t0); o.stop(t0 + 0.35);
    lfo.start(t0); lfo.stop(t0 + 0.35);
    // 숨 섞인 쉿 소리
    const src = ctx.createBufferSource();
    src.buffer = this.noise!; src.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(gain * 0.3, t0 + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
    src.connect(nf).connect(ng).connect(this.out!);
    src.start(t0); src.stop(t0 + 0.3);
  }

  /** 날갯짓 — 큰 새의 날개는 "퍽" 하는 저역 공기 소리다. 마릿수만큼 겹치고 흩뜨린다 */
  private wingBeats(gain: number, count: number) {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const beats = 4 + Math.min(4, count);
    for (let k = 0; k < beats; k++) {
      const t0 = ctx.currentTime + k * (0.115 + Math.random() * 0.05) + Math.random() * 0.03;
      const amp = gain * (1 - k / (beats + 1.5)) * (0.7 + Math.random() * 0.5);
      const src = ctx.createBufferSource();
      src.buffer = this.noise!; src.loop = true;
      src.playbackRate.value = 0.5 + Math.random() * 0.3;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.setValueAtTime(700, t0); f.Q.value = 1.1;
      f.frequency.exponentialRampToValueAtTime(220, t0 + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), t0 + 0.014);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      src.connect(f).connect(g).connect(this.out!);
      src.start(t0); src.stop(t0 + 0.14);
    }
  }

  /** 소금이 닿음 — 치익 하는 고역 + 짧은 불꽃 */
  saltHit() {
    if (!this.ready()) return;
    const s = settings.audio;
    if (!this.bank.play('salt/hit', { gain: s.combat, rate: 0.95 + Math.random() * 0.1 })) {
      this.noiseBurst({ dur: 0.5, gain: s.combat * 0.55, type: 'highpass', freq: 3500, attack: 0.01 });
      this.noiseBurst({ dur: 0.25, gain: s.combat * 0.3, type: 'bandpass', freq: 1400, freqEnd: 600, q: 1.5, attack: 0.02 });
    }
    this.thump(90, 0.18, s.combat * 0.35);
  }
  /** 은신 들어감 — 옷자락 + 나무 삐걱 */
  hideIn() {
    const s = settings.audio;
    const ok = this.bank.play('hide/cloth', { gain: s.footstep * 0.9, rate: 0.9 + Math.random() * 0.1 }) || this.bank.play('chochin/toggle', { gain: s.footstep * 0.9, rate: 0.8 + Math.random() * 0.1 });
    this.bank.play('foot/creak', { gain: s.footstep * 0.6, rate: 0.8 + Math.random() * 0.15, at: 0.12 });
    if (!ok) this.noiseBurst({ dur: 0.35, gain: s.footstep * 0.45, type: 'bandpass', freq: 1600, freqEnd: 700, q: 0.7, attack: 0.04 });
  }
  /** 은신 나옴 */
  hideOut() {
    const s = settings.audio;
    const ok = this.bank.play('hide/cloth', { gain: s.footstep * 0.8, rate: 1.05 + Math.random() * 0.1 }) || this.bank.play('chochin/toggle', { gain: s.footstep * 0.8, rate: 1.0 + Math.random() * 0.15 });
    if (!ok) this.noiseBurst({ dur: 0.3, gain: s.footstep * 0.4, type: 'bandpass', freq: 800, freqEnd: 1800, q: 0.7, attack: 0.03 });
  }
  private breathT = 0;
  /**
   * 숨소리 — 매 프레임 호출. level 0 = 조용, 1 = 헐떡임(스태미나 바닥). 들숨/날숨을 번갈아 낸다.
   * 샘플 `breath/heavy` 가 있으면 그것을, 없으면 로우패스 노이즈 호흡
   */
  breath(level: number, dt = 1 / 60, opts: { rate?: number; gain?: number } = {}) {
    if (!this.ready() || level <= 0.02) { this.breathT = Math.min(this.breathT, 0.2); return; }
    this.breathT -= dt;
    if (this.breathT > 0) return;
    const k = Math.min(1, level);
    // `rate` 는 성대의 크기다 — 여섯 살 미오는 어른보다 성도가 짧아 공명이 높다(ACT 1)
    const rate = opts.rate ?? 1;
    this.breathT = (1.35 - 0.75 * k) / rate; // 빠를수록 잦게. 아이는 호흡도 빠르다
    const vol = settings.audio.footstep * (0.25 + 0.75 * k) * (opts.gain ?? 1);
    if (this.bank.play('breath/heavy', { gain: vol, rate: (0.95 + Math.random() * 0.1 + k * 0.1) * rate })) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const d = (0.32 - 0.1 * k) / rate;
    this.noiseBurst({ dur: d, gain: vol * 0.5, type: 'bandpass', freq: (500 + 400 * k) * rate, freqEnd: (900 + 500 * k) * rate, q: 0.6, attack: d * 0.45 });   // 들숨
    this.tap(t0 + d + 0.05, (380 + 250 * k) * rate, 0.5, d * 1.1, vol * 0.55, 'lowpass');                                                                      // 날숨
  }

  /**
   * 흐느낌 — 우는 아이의 **숨이 걸리는 소리**. 울음은 멜로디가 아니라 *끊긴 들숨* 이다.
   * 짧은 들숨 두세 번(점점 짧아진다) + 성대가 살짝 울리는 고역 훌쩍임.
   * ACT 1 에서 미오가 뒤를 돌아보려 할 때 운다 — 대사로 "울며"라고 쓰는 대신 들리게 한다.
   */
  sob(gain = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const vol = settings.audio.footstep * gain;
    const n = 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.16 - i * 0.02);
      const d = 0.13 - i * 0.025;
      // 걸린 들숨 — 좁은 밴드패스라 "흑" 하고 목이 잠긴다
      this.tap(t, 900 - i * 90, 2.4, d, vol * (0.6 - i * 0.12), 'bandpass', 1500);
      // 성대 훌쩍임 — 아이 음역
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(430 + i * 40, t);
      o.frequency.exponentialRampToValueAtTime(300, t + d * 1.6);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * (0.22 - i * 0.05), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d * 1.6);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
      o.connect(bp).connect(g).connect(this.out!);
      o.start(t); o.stop(t + d * 1.6 + 0.05);
    }
  }

  private heartT = 0;
  /**
   * 심장 — **내 몸의 소리**라 방향이 없다(패너를 안 쓴다). 매 프레임 호출하면 스스로 박자를 잡는다.
   * `matsuri.ts` 의 것과 같은 두근(lub-dub)이지만 그쪽은 요괴 근접도가 몰고, 이건 스크립트가 몬다.
   * @param level 0 = 안 뛴다 · 1 = 목까지 올라온다(≈150 bpm)
   */
  heartbeat(level: number, dt = 1 / 60) {
    if (!this.ready() || level <= 0.02) { this.heartT = Math.min(this.heartT, 0.25); return; }
    this.heartT -= dt;
    if (this.heartT > 0) return;
    const k = Math.min(1, level);
    this.heartT = 1.1 - 0.7 * k;
    const vol = settings.audio.heartbeat * (0.25 + 0.75 * k) * 0.55;
    if (this.bank.play('heart/beat', { gain: vol * 1.4, rate: 0.97 + Math.random() * 0.06 + k * 0.08, dest: this.dryOut! })) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const beat = (t: number, freq: number, v: number) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.12);
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(v, t + 0.012);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(e).connect(this.dryOut!);
      o.start(t); o.stop(t + 0.2);
    };
    beat(t0, 62, vol);
    beat(t0 + 0.17 - 0.04 * k, 50, vol * 0.6);
  }

  /**
   * 천둥 — 번개(`story/lightning.ts`)와 짝. 번쩍임과 **시차를 두고** 울려야 거리가 생긴다.
   *
   * 소리의 정체는 두 층이다: ① 갈라지는 **크랙**(가까울 때만 — 고역 노이즈) ② 오래 끄는 **럼블**
   * (저역 노이즈 + 초저역 사인). 멀수록 크랙이 사라지고 럼블만 남으며 길어진다 — 공기가 고역을 먹기 때문이다.
   * @param dist 0 = 머리 위 · 1 = 지평선 너머
   */
  thunder(gain = 0.7, dist = 0.5) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const near = 1 - Math.min(1, Math.max(0, dist));
    const vol = gain * settings.audio.combat * (0.35 + near * 0.65);
    // ① 크랙 — 가까운 낙뢰에만 있다
    if (near > 0.35) {
      this.noiseBurst({ dur: 0.28, gain: vol * 0.55 * near, type: 'highpass', freq: 1800, freqEnd: 420, q: 0.5, attack: 0.004 });
    }
    // ② 럼블 — 멀수록 길고 어둡다. 로우패스가 서서히 닫히며 "굴러가는" 꼬리를 만든다
    const dur = 2.2 + (1 - near) * 3.4;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!; src.loop = true; src.playbackRate.value = 0.22 + near * 0.18;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200 + near * 500, t0);
    lp.frequency.exponentialRampToValueAtTime(60 + near * 80, t0 + dur);
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    // 럼블은 즉시 최대가 아니다 — 여러 갈래에서 도착한 소리가 겹치며 부풀었다 꺼진다
    g.gain.exponentialRampToValueAtTime(vol * 0.9, t0 + 0.18 + (1 - near) * 0.5);
    g.gain.exponentialRampToValueAtTime(vol * 0.45, t0 + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(lp).connect(g).connect(this.out!);
    src.start(t0); src.stop(t0 + dur + 0.1);
    // 초저역 — 스피커가 아니라 몸으로 듣는 층
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(48 + near * 14, t0);
    o.frequency.exponentialRampToValueAtTime(26, t0 + dur * 0.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(vol * 0.5, t0 + 0.22);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.85);
    o.connect(og).connect(this.out!);
    o.start(t0); o.stop(t0 + dur);
  }
}
