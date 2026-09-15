/** rAF 주사율과 별개인 렌더 상한. 남은 시간을 이월해 144 Hz에서 60 fps가 48 fps로 떨어지지 않게 한다. */
export class FrameClock {
  private last: number;
  private phase = 0;
  private elapsed = 0;
  private cap = 0;

  constructor(now: number) { this.last = now; }

  reset(now: number) {
    this.last = now;
    this.phase = 0;
    this.elapsed = 0;
  }

  /** 그릴 프레임이면 실제 경과 초, 상한 대기 중이면 null. 물리 dt 제한은 호출부에서 한다. */
  sample(now: number, maxFps: number): number | null {
    const delta = Math.max(0, now - this.last);
    this.last = now;
    if (this.cap !== maxFps) { this.cap = maxFps; this.phase = 0; }
    this.elapsed += delta;
    this.phase += delta;
    if (maxFps > 0) {
      const period = 1000 / maxFps;
      if (this.phase < period - 0.5) return null; // vsync 시각의 작은 반올림 오차만 허용
      this.phase -= period;
      // 오래 멈춘 탭·컴파일 지연을 수십 프레임으로 따라잡지 않는다.
      if (this.phase >= period) this.phase %= period;
    } else this.phase = 0;
    const dt = this.elapsed / 1000;
    this.elapsed = 0;
    return dt > 0 ? dt : null;
  }
}
