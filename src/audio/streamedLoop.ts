import type { Voice } from './bank';

export interface LoopStream {
  sampleRate: number;
  channels: number;
  chunks: { file: string; frames: number }[];
}

/** Sample-clock scheduling with only the current and next decoded chunk resident.
 * A slow/failed read repeats the current chunk and retries, rather than stopping
 * the ambience. All routing, ducking and pause still use the existing AudioContext.
 */
export class StreamedLoopVoice implements Voice {
  readonly gain: GainNode;
  private trim: GainNode;
  private current: AudioBuffer | null;
  private next: AudioBuffer | null = null;
  private index = 0;
  private pending = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private tail: AudioBufferSourceNode | null = null;
  private tailGain: GainNode | null = null;
  constructor(private ctx: AudioContext, first: AudioBuffer, dest: AudioNode,
    private stream: LoopStream, private load: (index: number) => Promise<AudioBuffer>,
    private rate = 1, trimGain = 1, private onRelease: (() => void) | null = null) {
    this.current = first;
    this.gain = ctx.createGain();
    this.trim = ctx.createGain(); this.trim.gain.value = trimGain;
    this.trim.connect(this.gain).connect(dest);
  }
  start(at = 0, fadeIn = 0) {
    const time = this.ctx.currentTime + Math.max(0, at);
    if (fadeIn > 0) {
      this.gain.gain.setValueAtTime(0.0001, time);
      this.gain.gain.exponentialRampToValueAtTime(1, time + fadeIn);
    }
    this.schedule(time);
  }
  private preload() {
    if (this.pending || this.next || this.stopped) return;
    this.pending = true;
    void this.load((this.index + 1) % this.stream.chunks.length).then(buffer => {
      if (!this.stopped) this.next = buffer;
    }).catch(error => {
      if (!this.stopped) console.warn('[audio] stream chunk retry', error);
    }).finally(() => { this.pending = false; });
  }
  private schedule(time: number) {
    if (this.stopped || !this.current) return;
    const late = time < this.ctx.currentTime - 0.01;
    time = Math.max(time, this.ctx.currentTime + (late ? 0.01 : 0));
    const source = this.ctx.createBufferSource();
    source.buffer = this.current; source.playbackRate.value = this.rate;
    // Keep the tail looping on the audio thread until its replacement is scheduled.
    // Long shader compilation / GC pauses must not leave a silent hole.
    source.loop = true;
    const envelope = this.ctx.createGain(); source.connect(envelope).connect(this.trim);
    if (this.tail) {
      if (late) {
        envelope.gain.setValueAtTime(0, time); envelope.gain.linearRampToValueAtTime(1, time + 0.05);
        this.tailGain!.gain.setValueAtTime(1, time); this.tailGain!.gain.linearRampToValueAtTime(0, time + 0.05);
      }
      this.tail.stop(time + (late ? 0.05 : 0));
    }
    this.tail = source; this.tailGain = envelope;
    this.sources.add(source);
    source.onended = () => {
      source.disconnect(); envelope.disconnect(); source.buffer = null; this.sources.delete(source);
      if (this.stopped && !this.sources.size) this.release();
    };
    source.start(time);
    let end = time + this.current.duration / this.rate;
    this.preload();
    // Audio time does not advance while paused. Re-check instead of accumulating
    // scheduled sources every six wall-clock seconds in a suspended context.
    const pump = () => {
      if (this.stopped) return;
      const wait = end - this.ctx.currentTime - 1;
      if (wait > 0.01) { this.timer = setTimeout(pump, Math.max(50, wait * 1000)); return; }
      if (this.next) {
        this.current = this.next; this.next = null;
        this.index = (this.index + 1) % this.stream.chunks.length;
        this.schedule(end);
      } else {
        // No replacement yet: the audio-thread loop already covers this interval.
        this.preload();
        const duration = this.current!.duration / this.rate;
        end += Math.max(1, Math.ceil((this.ctx.currentTime + 1 - end) / duration)) * duration;
        this.timer = setTimeout(pump, Math.max(50, (end - this.ctx.currentTime - 1) * 1000));
      }
    };
    this.timer = setTimeout(pump, Math.max(50, (end - this.ctx.currentTime - 1) * 1000));
  }
  get decodedBytes() {
    const buffers = new Set<AudioBuffer>();
    if (this.current) buffers.add(this.current);
    if (this.next) buffers.add(this.next);
    for (const source of this.sources) if (source.buffer) buffers.add(source.buffer);
    let bytes = 0;
    for (const buffer of buffers) bytes += buffer.length * buffer.numberOfChannels * 4;
    return bytes;
  }
  stop(fade = 0.5) {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null; this.current = null; this.next = null;
    const time = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setValueAtTime(Math.max(0.0001, this.gain.gain.value), time);
    this.gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0, fade));
    for (const source of this.sources) { try { source.stop(time + Math.max(0, fade) + 0.02); } catch { /* ended */ } }
    if (!this.sources.size) this.release();
  }
  private release() {
    this.trim.disconnect(); this.gain.disconnect();
    this.tail = null; this.tailGain = null;
    const done = this.onRelease; this.onRelease = null; done?.();
  }
}
