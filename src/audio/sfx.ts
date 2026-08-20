import { settings } from '@/core/settings';
import { SampleBank } from './bank';

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
  private noise: AudioBuffer | null = null;
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
    // 2초 백색소음 버퍼
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    void this.bank.attach(this.ctx, this.master);
    if (this.ctx.state === 'running') this.startAmbient();
    else void this.ctx.resume().then(() => this.startAmbient());
  }

  setMaster(v: number) { if (this.master) this.master.gain.value = v; }

  /** 다른 오디오 모듈(마츠리바야시 등)이 같은 컨텍스트/마스터를 쓰도록 노출 */
  get context() { return this.ctx; }
  get masterGain() { return this.master; }

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
    src.connect(lp).connect(bp).connect(gain).connect(this.master!);
    src.start(); lfo.start(); lfo2.start();
    this.ambientNodes = { gain };
  }
  setAmbient(v: number) { if (this.ambientNodes) this.ambientNodes.gain.gain.value = v; }

  private ready() { return this.ctx && this.master && this.noise && this.ctx.state === 'running'; }

  private noiseBurst(opts: { dur: number; gain: number; type: BiquadFilterType; freq: number; q?: number; freqEnd?: number; attack?: number }) {
    if (!this.ready()) return;
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
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0); src.stop(t0 + opts.dur + 0.05);
  }

  private thump(freq: number, dur: number, gain: number) {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.5), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master!);
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
    src.connect(f).connect(g).connect(this.master!);
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
    o.connect(g).connect(this.master!);
    o.start(t); o.stop(t + dur + 0.03);
    this.tap(t, freq * 4.5, 0.6, dur * 0.7, gain * 0.5, 'lowpass');
  }

  /** 발소리 — 샘플(`foot/<surface>`)이 있으면 샘플, 없으면 표면별 3단 합성. `foot` 으로 좌우 음색을 미세하게 바꿔 반복감을 줄인다 */
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
      const rate = (0.96 + Math.random() * 0.08) * (foot === 'R' ? 0.985 : 1.015) * (surface === 'water' ? 1 - 0.08 * k : 1);
      this.bank.play(`foot/${surface}`, { gain: vol * 1.15, rate });
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
      o.connect(gn).connect(this.master!); o.start(t0); o.stop(t0 + 0.4);
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
    g.connect(this.master!);
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
    o.connect(lp).connect(g).connect(this.master!);
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
      o.connect(g).connect(this.master!);
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
      o.connect(e).connect(this.master!); o.start(t0); o.stop(t0 + d + 0.05);
    }
  }
  /** 봉납: 낮은 종(梵鐘) 울림 */
  offer() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    for (const [f, g] of [[110, 0.5], [220, 0.25], [331, 0.12], [552, 0.05]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(g, t0 + 0.02); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.5);
      o.connect(e).connect(this.master!); o.start(t0); o.stop(t0 + 4.6);
    }
  }
  /** 탈출: 새벽 — 높은 지속음 + 새 소리 한 마디 */
  escape() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.12, t0 + 1.5); e.gain.exponentialRampToValueAtTime(0.0001, t0 + 6);
    o.connect(e).connect(this.master!); o.start(t0); o.stop(t0 + 6.1);
    for (let i = 0; i < 4; i++) { const t = t0 + 1.2 + i * 0.18; const b = ctx.createOscillator(); b.type = 'sine'; b.frequency.setValueAtTime(2600 + i * 200, t); b.frequency.exponentialRampToValueAtTime(3400, t + 0.08);
      const be = ctx.createGain(); be.gain.setValueAtTime(0.0001, t); be.gain.exponentialRampToValueAtTime(0.08, t + 0.01); be.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); b.connect(be).connect(this.master!); b.start(t); b.stop(t + 0.15); }
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
    o.connect(lp).connect(g).connect(this.master!); o.start(t0); o.stop(t0 + 1.2);
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
    o.connect(g).connect(this.master!); o.start(t0); o.stop(t0 + 0.12);
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
      o.connect(g).connect(this.master!); o.start(t0); o.stop(t0 + 0.25);
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
    sum.connect(e).connect(this.master!);
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
  breath(level: number, dt = 1 / 60) {
    if (!this.ready() || level <= 0.02) { this.breathT = Math.min(this.breathT, 0.2); return; }
    this.breathT -= dt;
    if (this.breathT > 0) return;
    const k = Math.min(1, level);
    this.breathT = 1.35 - 0.75 * k; // 빠를수록 잦게
    const vol = settings.audio.footstep * (0.25 + 0.75 * k);
    if (this.bank.play('breath/heavy', { gain: vol, rate: 0.95 + Math.random() * 0.1 + k * 0.1 })) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const d = 0.32 - 0.1 * k;
    this.noiseBurst({ dur: d, gain: vol * 0.5, type: 'bandpass', freq: 500 + 400 * k, freqEnd: 900 + 500 * k, q: 0.6, attack: d * 0.45 });            // 들숨
    this.tap(t0 + d + 0.05, 380 + 250 * k, 0.5, d * 1.1, vol * 0.55, 'lowpass');                                                                      // 날숨
  }
}
