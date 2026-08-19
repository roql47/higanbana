/**
 * 샘플 뱅크 — `public/audio/manifest.json`(scripts/audio/fetch.ts 가 생성)에 실린 MP3 를 받아 디코딩해 둔다.
 *
 *  · 네트워크 선로드(`prefetch`)는 AudioContext 없이 바로 시작 → 로딩 화면에서 받아 둔다
 *  · 디코딩(`attach`)은 첫 제스처로 AudioContext 가 생긴 뒤
 *  · 키가 없거나 로드에 실패한 소리는 `has()` 가 false → 호출부는 프로시저럴 합성으로 폴백한다
 *  · variation 은 직전 것과 다른 것을 고른다 (반복감 제거)
 *  · 루프는 파이프라인에서 크로스페이드 루프로 만들어 두었다. 디코더가 MP3 패딩을 정확히 잘라 길이가 맞으면
 *    네이티브 loop(샘플 정확), 아니면 런타임 크로스페이드로 돌린다 → 어느 브라우저에서도 끊김이 없다
 */
export interface BankEntry { files: string[]; gain: number; loop: boolean; license: string; durations?: number[] }
export interface BankManifest { version: number; generated: string; sounds: Record<string, BankEntry> }

export interface PlayOpts {
  /** 선형 게인 (manifest 기본 게인에 곱해진다) */
  gain?: number;
  /** 재생 속도(피치 포함) */
  rate?: number;
  /** 지금부터 몇 초 뒤에 (기본 0) */
  at?: number;
  /** 출력 노드 (기본 master) */
  dest?: AudioNode;
  /** 특정 variation 강제 */
  index?: number;
  /** 버퍼 시작 오프셋·길이 */
  offset?: number;
  duration?: number;
  fadeIn?: number;
  /** 원샷에 로우패스 (Hz) — 먼 소리 */
  lp?: number;
}

export interface Voice {
  readonly gain: GainNode;
  stop(fade?: number): void;
}

/** 끊김 없는 루프 보이스 — 네이티브 loop 또는 런타임 크로스페이드 */
export class LoopVoice implements Voice {
  readonly gain: GainNode;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sources: AudioBufferSourceNode[] = [];
  constructor(private ctx: AudioContext, private buffer: AudioBuffer, dest: AudioNode, private native: boolean, private rate = 1) {
    this.gain = ctx.createGain();
    this.gain.connect(dest);
  }
  start(at = 0, fadeIn = 0) {
    const t0 = this.ctx.currentTime + at;
    if (fadeIn > 0) { this.gain.gain.setValueAtTime(0.0001, t0); this.gain.gain.exponentialRampToValueAtTime(1, t0 + fadeIn); }
    if (this.native) {
      const s = this.mk(); s.loop = true; s.connect(this.gain); s.start(t0);
      this.sources.push(s);
    } else {
      this.schedule(t0);
    }
  }
  private mk() { const s = this.ctx.createBufferSource(); s.buffer = this.buffer; s.playbackRate.value = this.rate; return s; }
  /** 한 바퀴를 t 에 시작하고, 끝나기 xfade 전에 다음 바퀴를 겹쳐 시작한다 (등파워 크로스페이드) */
  private schedule(t: number) {
    if (this.stopped) return;
    const dur = this.buffer.duration / this.rate;
    const x = Math.min(2.5, dur * 0.25);
    const g = this.ctx.createGain();
    g.connect(this.gain);
    const s = this.mk(); s.connect(g); s.start(t); s.stop(t + dur + 0.05);
    // in: 0→1 (sin), out: 1→0 (cos) — 첫 바퀴는 페이드인 없이
    const steps = 24;
    const curveIn = new Float32Array(steps), curveOut = new Float32Array(steps);
    for (let i = 0; i < steps; i++) { const p = (i / (steps - 1)) * Math.PI / 2; curveIn[i] = Math.sin(p); curveOut[i] = Math.cos(p); }
    if (this.sources.length > 0) g.gain.setValueCurveAtTime(curveIn, t, x);
    else g.gain.setValueAtTime(1, t);
    g.gain.setValueCurveAtTime(curveOut, t + dur - x, x);
    this.sources.push(s);
    if (this.sources.length > 3) this.sources.shift();
    // 다음 바퀴: 끝나기 x 전에 시작. 타이머는 그보다 1.5 s 앞서 깨어 오디오 클럭으로 정확히 예약한다
    const next = t + dur - x;
    const wait = Math.max(0, (next - this.ctx.currentTime - 1.5) * 1000);
    this.timer = setTimeout(() => this.schedule(next), wait);
  }
  stop(fade = 0.5) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), t);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    for (const s of this.sources) { try { s.stop(t + fade + 0.05); } catch { /* 이미 끝남 */ } }
  }
}

export class SampleBank {
  private specs: Record<string, BankEntry> = {};
  private bytes = new Map<string, ArrayBuffer>();
  private buffers = new Map<string, AudioBuffer[]>();
  private last = new Map<string, number>();
  private ctx: AudioContext | null = null;
  private master: AudioNode | null = null;
  private prefetchP: Promise<void> | null = null;
  private readyP: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;
  /** 디코딩까지 끝났나 */
  ready = false;
  /** manifest 에 있는 소리 수 · 디코딩된 소리 수 */
  total = 0;
  decoded = 0;

  constructor(private manifestUrl = '/audio/manifest.json') {
    this.readyP = new Promise<void>((r) => { this.resolveReady = r; });
  }

  /** 네트워크 선로드 — AudioContext 없이 호출 가능 (GLB 로딩과 병렬, 로딩 바에는 안 잡는다 — 작고 없어도 폴백이 있다) */
  prefetch(): Promise<void> {
    if (this.prefetchP) return this.prefetchP;
    this.prefetchP = (async () => {
      let man: BankManifest;
      try {
        const res = await fetch(this.manifestUrl, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        man = await res.json() as BankManifest;
      } catch (e) {
        console.info('[audio] 샘플 manifest 없음 → 프로시저럴만 사용', (e as Error).message);
        return;
      }
      this.specs = man.sounds ?? {};
      const base = this.manifestUrl.replace(/manifest\.json$/, '');
      const files = [...new Set(Object.values(this.specs).flatMap((s) => s.files))];
      this.total = Object.keys(this.specs).length;
      let i = 0;
      const worker = async () => {
        while (i < files.length) {
          const f = files[i++]!;
          const url = base + f;
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.bytes.set(f, await res.arrayBuffer());
          } catch (e) {
            console.warn('[audio] 로드 실패', url, (e as Error).message);
          }
        }
      };
      const n = Math.min(6, files.length);
      const ps: Promise<void>[] = [];
      for (let k = 0; k < n; k++) ps.push(worker());
      await Promise.all(ps);
    })();
    return this.prefetchP;
  }

  /** AudioContext 가 생기면 디코딩. 여러 번 불러도 한 번만 */
  attach(ctx: AudioContext, master: AudioNode): Promise<void> {
    if (this.ctx) return this.readyP!;
    this.ctx = ctx; this.master = master;
    void (async () => {
      await this.prefetch();
      const keys = Object.keys(this.specs);
      await Promise.all(keys.map(async (key) => {
        const spec = this.specs[key]!;
        const bufs: AudioBuffer[] = [];
        for (const f of spec.files) {
          const b = this.bytes.get(f);
          if (!b) continue;
          try { bufs.push(await ctx.decodeAudioData(b.slice(0))); }
          catch (e) { console.warn('[audio] 디코딩 실패', f, (e as Error).message); }
        }
        if (bufs.length) { this.buffers.set(key, bufs); this.decoded++; }
      }));
      this.bytes.clear();
      this.ready = true;
      console.info(`[audio] 샘플 뱅크 ${this.decoded}/${this.total} 키 준비`);
      this.resolveReady?.();
    })();
    return this.readyP!;
  }

  whenReady() { return this.readyP!; }
  has(key: string) { return this.buffers.has(key); }
  entry(key: string): BankEntry | undefined { return this.specs[key]; }
  count(key: string) { return this.buffers.get(key)?.length ?? 0; }

  /** variation 하나 — 직전 것과 다르게 */
  buffer(key: string, index?: number): AudioBuffer | null {
    const bufs = this.buffers.get(key);
    if (!bufs || bufs.length === 0) return null;
    if (index !== undefined) return bufs[((index % bufs.length) + bufs.length) % bufs.length] ?? null;
    let i = Math.floor(Math.random() * bufs.length);
    if (bufs.length > 1 && i === this.last.get(key)) i = (i + 1 + Math.floor(Math.random() * (bufs.length - 1))) % bufs.length;
    this.last.set(key, i);
    return bufs[i] ?? null;
  }

  /** 원샷 재생. 키가 없으면 null (호출부가 폴백) */
  play(key: string, opts: PlayOpts = {}): Voice | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const buf = this.buffer(key, opts.index);
    if (!buf) return null;
    const spec = this.specs[key];
    const t0 = ctx.currentTime + Math.max(0, opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = ctx.createGain();
    const vol = (opts.gain ?? 1) * (spec?.gain ?? 1);
    if (opts.fadeIn && opts.fadeIn > 0) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + opts.fadeIn); }
    else g.gain.setValueAtTime(vol, t0);
    let head: AudioNode = src;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; f.Q.value = 0.5; head.connect(f); head = f; }
    head.connect(g).connect(opts.dest ?? this.master!);
    if (opts.duration !== undefined) src.start(t0, opts.offset ?? 0, opts.duration);
    else src.start(t0, opts.offset ?? 0);
    return {
      gain: g,
      stop(fade = 0.05) {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
        try { src.stop(t + fade + 0.02); } catch { /* */ }
      },
    };
  }

  /** 루프 재생 (앰비언스 바탕·마츠리 bed). 반환된 Voice.gain 으로 볼륨을 움직인다 */
  loop(key: string, opts: { dest?: AudioNode; rate?: number; fadeIn?: number; index?: number; at?: number } = {}): LoopVoice | null {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const buf = this.buffer(key, opts.index ?? 0);
    if (!buf) return null;
    const spec = this.specs[key];
    // 파이프라인이 기록한 길이와 디코딩 길이가 같으면 디코더가 패딩을 잘라낸 것 → 네이티브 루프
    const want = spec?.durations?.[opts.index ?? 0];
    const native = want !== undefined && Math.abs(buf.duration - want) < 0.003;
    const v = new LoopVoice(ctx, buf, opts.dest ?? this.master!, native, opts.rate ?? 1);
    v.start(opts.at ?? 0, opts.fadeIn ?? 0);
    return v;
  }
}
