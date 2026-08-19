import { settings } from '@/core/settings';

/** 발밑 표면 — 발소리 합성에 쓴다 */
export type Surface = 'grass' | 'sand' | 'water' | 'dirt' | 'gravel' | 'wood';

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

  /** 발소리 — 표면별 합성 (풀/흙/자갈: 노이즈 성격, 물: 첨벙) */
  footstep(speed: number, surface: Surface = 'grass') {
    const s = settings.audio;
    const k = Math.min(1, speed / 5);
    if (surface === 'water') {
      this.noiseBurst({ dur: 0.16 + k * 0.08, gain: s.footstep * (0.5 + 0.6 * k), type: 'bandpass', freq: 900 + Math.random() * 600, q: 0.5, attack: 0.008 });
      this.noiseBurst({ dur: 0.22, gain: s.footstep * 0.35 * k, type: 'highpass', freq: 3000, attack: 0.02 });
      this.thump(90, 0.08, s.footstep * 0.2 * k);
      return;
    }
    if (surface === 'gravel') { // 참배로 자갈 — 잘게 부서지는 고역
      this.noiseBurst({ dur: 0.11 + k * 0.04, gain: s.footstep * (0.45 + 0.6 * k), type: 'bandpass', freq: 2200 + Math.random() * 1400, q: 0.9, attack: 0.003 });
      this.noiseBurst({ dur: 0.06, gain: s.footstep * 0.3 * k, type: 'highpass', freq: 5200, attack: 0.002 });
      this.thump(72 + Math.random() * 18, 0.06, s.footstep * 0.22 * k);
      return;
    }
    if (surface === 'dirt') { // 마른 흙 논두렁 — 둔탁하고 짧게
      this.noiseBurst({ dur: 0.10 + k * 0.03, gain: s.footstep * (0.4 + 0.6 * k), type: 'lowpass', freq: 900 + Math.random() * 400, q: 0.7, attack: 0.004 });
      this.noiseBurst({ dur: 0.05, gain: s.footstep * 0.16 * k, type: 'bandpass', freq: 1800, q: 1.2, attack: 0.002 });
      this.thump(58 + Math.random() * 16, 0.08, s.footstep * 0.32 * k);
      return;
    }
    if (surface === 'wood') { // 툇마루·다리 — 울리는 중역
      this.thump(150 + Math.random() * 40, 0.12, s.footstep * 0.5 * (0.4 + 0.6 * k));
      this.noiseBurst({ dur: 0.09, gain: s.footstep * 0.3 * k, type: 'bandpass', freq: 1100, q: 1.6, attack: 0.002 });
      return;
    }
    if (surface === 'sand') {
      this.noiseBurst({ dur: 0.13 + k * 0.04, gain: s.footstep * (0.4 + 0.6 * k), type: 'bandpass', freq: 1400 + Math.random() * 800, q: 0.6, attack: 0.006 });
      this.noiseBurst({ dur: 0.08, gain: s.footstep * 0.2 * k, type: 'highpass', freq: 4000, attack: 0.003 });
      this.thump(65 + Math.random() * 15, 0.07, s.footstep * 0.28 * k);
      return;
    }
    this.noiseBurst({ dur: 0.09 + k * 0.03, gain: s.footstep * (0.35 + 0.65 * k), type: 'bandpass', freq: 500 + Math.random() * 500, q: 0.7, attack: 0.004 });
    this.noiseBurst({ dur: 0.05, gain: s.footstep * 0.25 * k, type: 'highpass', freq: 2500 + Math.random() * 1500, attack: 0.002 });
    this.thump(70 + Math.random() * 20, 0.06, s.footstep * 0.25 * k);
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
