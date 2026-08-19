import * as THREE from 'three';
import { settings } from '@/core/settings';
import type { Sfx } from './sfx';

/**
 * 마츠리바야시(祭囃子) = 이 게임의 심박. **축제 음악이 요괴 근접도다.**
 *
 *   40 m: 북(太鼓)만 아득하게 → 25 m: 피리 가락 → 15 m: 스즈(방울) → 8 m: 게타 발소리
 *   발각(CHASE): 음악이 뚝 끊기고 0.6 s 정적 → "뽀… 뽀… 뽀…"
 *
 * 전부 프로시저럴 합성(H5 에서 샘플 교체). 소리는 요괴 위치의 PannerNode(HRTF)에서 난다 —
 * 헤드폰이면 방향이 들린다.
 */
export class Matsuri {
  private panner: PannerNode | null = null;
  private bus: GainNode | null = null;
  private layers: { drum: GainNode; flute: GainNode; bells: GainNode; geta: GainNode } | null = null;
  private started = false;
  private beatT = 0;
  private beatN = 0;
  private fluteT = 0;
  private fluteNote = 0;
  private bellT = 0;
  private getaT = 0;
  private poT = 0;
  private chase = false;
  private silence = 0;

  constructor(private sfx: Sfx) {}

  /** AudioContext 언락 후 매 프레임 시도해도 안전 */
  private ensure() {
    const ctx = this.sfx.context, master = this.sfx.masterGain;
    if (this.started || !ctx || !master || ctx.state !== 'running') return;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'exponential';
    this.panner.refDistance = 4;
    this.panner.rolloffFactor = 1.35;
    this.bus = ctx.createGain();
    this.bus.gain.value = settings.audio.matsuri;
    const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.panner!); return g; };
    this.layers = { drum: mk(), flute: mk(), bells: mk(), geta: mk() };
    this.panner.connect(this.bus).connect(master);
    this.started = true;
  }

  /** 발각 순간 — 음악을 끊는다 */
  onSpotted() {
    this.chase = true;
    this.silence = 0.6;
    const ctx = this.sfx.context;
    if (!ctx || !this.layers) return;
    const t = ctx.currentTime;
    for (const g of Object.values(this.layers)) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.12);
    }
  }

  onLost() { this.chase = false; }

  /**
   * @param hunterPos 요괴 월드 위치 (소리의 근원)
   * @param dist      요괴-플레이어 거리
   */
  update(dt: number, hunterPos: THREE.Vector3, camera: THREE.Camera, dist: number) {
    this.ensure();
    const ctx = this.sfx.context;
    if (!ctx || !this.panner || !this.layers) return;

    // 리스너 = 카메라
    const l = ctx.listener;
    const cp = camera.position;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      l.positionX.value = cp.x; l.positionY.value = cp.y; l.positionZ.value = cp.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    }
    this.panner.positionX.value = hunterPos.x;
    this.panner.positionY.value = hunterPos.y + 1.8;
    this.panner.positionZ.value = hunterPos.z;
    this.bus!.gain.value = settings.audio.matsuri;

    if (this.silence > 0) { this.silence -= dt; return; }

    if (this.chase) {
      // 추격: 음악 없음. "뽀… 뽀… 뽀…" + 빠른 북
      this.poT -= dt;
      if (this.poT <= 0) { this.poT = 1.6 + Math.random() * 0.5; this.po(ctx); }
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beatT = 0.42; this.drum(ctx, 1.0, 72); }
      this.layers.drum.gain.value = 0.9;
      return;
    }

    // --- 거리 게이트 (부드럽게) ---
    const g = this.layers;
    const fade = (gain: GainNode, target: number) => { gain.gain.value += (target - gain.gain.value) * Math.min(1, dt * 3); };
    fade(g.drum, THREE.MathUtils.smoothstep(45 - dist, 0, 14) * 0.75);
    fade(g.flute, THREE.MathUtils.smoothstep(28 - dist, 0, 10) * 0.6);
    fade(g.bells, THREE.MathUtils.smoothstep(16 - dist, 0, 7) * 0.55);
    fade(g.geta, THREE.MathUtils.smoothstep(9 - dist, 0, 4) * 0.8);

    // --- 패턴 ---
    this.beatT -= dt;
    if (this.beatT <= 0) {
      // 돈-돈-카 돈-카 (2박 + 잔박)
      const pat = [0.62, 0.62, 0.31, 0.62, 0.31];
      this.beatT = pat[this.beatN % pat.length]!;
      this.drum(ctx, this.beatN % 5 < 2 ? 1 : 0.55, this.beatN % 5 === 2 ? 130 : 62);
      this.beatN++;
      // 게타는 북에 반박 어긋나게
      if (this.layers.geta.gain.value > 0.05) {
        this.getaT = 0.13;
      }
    }
    if (this.getaT > 0) { this.getaT -= dt; if (this.getaT <= 0) this.geta(ctx); }

    this.fluteT -= dt;
    if (this.fluteT <= 0 && this.layers.flute.gain.value > 0.02) {
      // 미야코부시(도-레♭-파-솔-라♭) 계열 음계를 느리게
      const scale = [523, 554, 698, 784, 831, 698, 554];
      this.fluteT = 0.5 + Math.random() * 0.7;
      this.fluteNote = (this.fluteNote + (Math.random() < 0.75 ? 1 : -1) + scale.length) % scale.length;
      this.flute(ctx, scale[this.fluteNote]!);
    }
    this.bellT -= dt;
    if (this.bellT <= 0 && this.layers.bells.gain.value > 0.02) {
      this.bellT = 1.24;
      this.bell(ctx);
    }
  }

  // --- 악기 합성 ---
  private drum(ctx: AudioContext, vel: number, freq: number) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.22);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.9 * vel, t + 0.006);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(e).connect(this.layers!.drum);
    o.start(t); o.stop(t + 0.35);
  }

  private flute(ctx: AudioContext, freq: number) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vibG = ctx.createGain(); vibG.gain.value = freq * 0.008;
    vib.connect(vibG).connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq * 1.5; bp.Q.value = 1.2;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(0.25, t + 0.09);
    e.gain.setValueAtTime(0.25, t + 0.32);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(bp).connect(e).connect(this.layers!.flute);
    o.start(t); vib.start(t); o.stop(t + 0.6); vib.stop(t + 0.6);
  }

  private bell(ctx: AudioContext) {
    const t = ctx.currentTime;
    for (const [mul, gv] of [[1, 0.3], [2.71, 0.14], [4.95, 0.06]] as [number, number][]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2380 * mul;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(gv, t + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(e).connect(this.layers!.bells);
      o.start(t); o.stop(t + 0.75);
    }
  }

  private geta(ctx: AudioContext) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 660 + Math.random() * 120;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(0.24, t + 0.003);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(lp).connect(e).connect(this.layers!.geta);
    o.start(t); o.stop(t + 0.1);
  }

  /** "뽀… 뽀… 뽀…" — 여성 험 근사(포먼트 밴드패스). 추격 중 반복 */
  private po(ctx: AudioContext) {
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * 0.34;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(392, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.16);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 400; f1.Q.value = 5;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 800; f2.Q.value = 7;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(f1); o.connect(f2);
      const sum = ctx.createGain(); sum.gain.value = 1;
      f1.connect(sum); f2.connect(sum);
      sum.connect(e).connect(this.layers!.drum);
      o.start(t); o.stop(t + 0.24);
    }
  }
}
