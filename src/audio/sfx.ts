import { settings } from '@/core/settings';

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
 * 프로시저럴 효과음 (Web Audio 합성 — 외부 에셋 없음).
 * 첫 사용자 제스처 후에만 AudioContext 가 재생 가능하므로 `unlock()` 을 pointerdown/keydown 에 연결한다.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

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
    if (this.ctx.state === 'running') this.startAmbient();
    else void this.ctx.resume().then(() => this.startAmbient());
  }

  setMaster(v: number) { if (this.master) this.master.gain.value = v; }

  /** 다른 오디오 모듈(마츠리바야시 등)이 같은 컨텍스트/마스터를 쓰도록 노출 */
  get context() { return this.ctx; }
  get masterGain() { return this.master; }

  private ambientNodes: { gain: GainNode } | null = null;
  /** 은은한 바람 앰비언스 (로우패스 노이즈 + 느린 LFO). 한 번만 시작 */
  startAmbient() {
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

  /** 발소리 — 표면별 3단 합성. `foot` 으로 좌우 음색을 미세하게 바꿔 반복감을 줄인다 */
  footstep(speed: number, surface: Surface = 'grass', foot: 'L' | 'R' = 'L') {
    if (!this.ready()) return;
    const s = settings.audio;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + 0.001;
    const k = Math.min(1, Math.max(0, speed / 3.6)); // 걷기 ≈ 0.42, 달리기 = 1
    const vol = s.footstep * (0.5 + 0.8 * k);
    const vary = 0.9 + Math.random() * 0.2;
    const side = foot === 'R' ? 0.93 : 1.07; // 좌우 발 음색 차

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

  /** 검 휘두름 — 밴드패스 노이즈 스윕 */
  swing(combo = 0) {
    const s = settings.audio;
    const p = 1 + combo * 0.18; // 타수가 올라갈수록 높고 길게
    this.noiseBurst({ dur: 0.22 + combo * 0.05, gain: s.combat * (0.55 + combo * 0.1), type: 'bandpass', freq: 600 * p, freqEnd: 2600 * p, q: 1.4, attack: 0.03 });
    this.noiseBurst({ dur: 0.12, gain: s.combat * 0.2, type: 'highpass', freq: 3500, attack: 0.05 });
  }
  /** 타격(나무·짚) — 둔탁한 썸프 + 짧은 노이즈 */
  hit(combo = 0) {
    const s = settings.audio;
    const g = 1 + combo * 0.25;
    this.thump((110 - combo * 15) + Math.random() * 30, 0.09 + combo * 0.03, s.combat * 0.9 * g);
    this.noiseBurst({ dur: 0.08, gain: s.combat * 0.6, type: 'lowpass', freq: 1200, q: 0.9, attack: 0.002 });
    this.noiseBurst({ dur: 0.05, gain: s.combat * 0.3, type: 'bandpass', freq: 2200, q: 2, attack: 0.001 });
  }
  /** 허수아비 쓰러짐 */
  dummyDown() {
    const s = settings.audio;
    this.thump(70, 0.25, s.combat * 0.8);
    this.noiseBurst({ dur: 0.3, gain: s.combat * 0.4, type: 'lowpass', freq: 700, attack: 0.01 });
  }
  /** 장착/줍기 — 금속성 짧은 링 */
  equip() {
    if (!this.ready()) return;
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
  /** 매 프레임 호출 — 랜덤 간격으로 벌레/개구리/풍경 원샷을 뿌린다 */
  updateNight(dt: number) {
    if (!this.nightOn || !this.ready()) return;
    this.nightTimer -= dt;
    if (this.nightTimer > 0) return;
    this.nightTimer = 0.35 + Math.random() * 0.9;
    const r = Math.random();
    if (r < 0.5) this.cricket();
    else if (r < 0.82) this.frog();
    else this.windChime();
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
    this.noiseBurst({ dur: 0.35, gain: 0.25, type: 'bandpass', freq: 1800, q: 0.8, attack: 0.05 });
  }
  /** 놋페라보 소멸: 짧은 역재생 느낌의 고역 슬라이드 */
  nopperaVanish() {
    this.noiseBurst({ dur: 0.45, gain: 0.35, type: 'bandpass', freq: 600, freqEnd: 5200, q: 2.5, attack: 0.2 });
  }
  /** 초칭오바케 눈 뜸: 젖은 눈 깜빡임 — 아주 짧은 고역 틱 두 번 */
  eyeOpen() {
    if (!this.ready()) return;
    this.noiseBurst({ dur: 0.04, gain: 0.5, type: 'highpass', freq: 4000, attack: 0.002 });
    const ctx = this.ctx!, t0 = ctx.currentTime + 0.07;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1900, t0); o.frequency.exponentialRampToValueAtTime(900, t0 + 0.09);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    o.connect(g).connect(this.master!); o.start(t0); o.stop(t0 + 0.12);
  }

  /** 초칭 밝기 전환 — 종이가 부스럭거리고 불이 커지는 소리 */
  lanternToggle(level: number) {
    if (!this.ready()) return;
    this.noiseBurst({ dur: 0.13, gain: settings.audio.footstep * 0.5, type: 'bandpass', freq: 2600 + Math.random() * 900, q: 0.8, attack: 0.004 });
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

  /** 도로타보 — 진흙이 갈라지며 솟는 소리: 저역 럼블 + 젖은 첨벙 */
  mudRise() {
    if (!this.ready()) return;
    const s = settings.audio;
    this.thump(38, 0.7, s.combat * 0.9);
    this.noiseBurst({ dur: 0.55, gain: s.combat * 0.55, type: 'lowpass', freq: 300, q: 0.8, attack: 0.03 });
    this.noiseBurst({ dur: 0.4, gain: s.combat * 0.45, type: 'bandpass', freq: 900, freqEnd: 380, q: 0.6, attack: 0.05 });
    for (let i = 0; i < 5; i++) {
      this.tap(this.ctx!.currentTime + 0.15 + Math.random() * 0.4, 1600 + Math.random() * 2400, 2.5, 0.05, s.combat * 0.25, 'bandpass');
    }
  }

  /** 도로타보 — 울부짖음: 포먼트 있는 낮은 신음("논 돌려내라"의 자리). H5 에서 샘플 교체 */
  dorotaboWail() {
    if (!this.ready()) return;
    const ctx = this.ctx!, t0 = ctx.currentTime;
    const s = settings.audio;
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
    this.noiseBurst({ dur: 0.18, gain: s.jump * 0.5, type: 'bandpass', freq: 400, freqEnd: 1800, q: 1.2, attack: 0.02 });
    this.thump(120, 0.08, s.jump * 0.3);
  }

  land(impact: number) {
    const s = settings.audio;
    const k = Math.min(1, impact / 12);
    this.thump(60, 0.14 + k * 0.08, s.land * (0.4 + 0.6 * k));
    this.noiseBurst({ dur: 0.12 + k * 0.08, gain: s.land * (0.3 + 0.5 * k), type: 'lowpass', freq: 900, q: 0.8, attack: 0.004 });
  }
}
