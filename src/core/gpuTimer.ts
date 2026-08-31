import * as THREE from 'three';

/** 비동기 GPU 타이머. query 완료를 기다리지 않고 준비된 결과만 읽어 동적 해상도에도 쓴다. */
export class GpuFrameTimer {
  private gl: WebGL2RenderingContext | null;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private active: WebGLQuery | null = null;
  private pending: WebGLQuery[] = [];
  private samples: number[] = [];
  ms = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    this.gl = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl : null;
    this.ext = this.gl?.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.ext;
  }

  begin() {
    this.poll();
    if (!this.gl || !this.ext || this.active || this.pending.length >= 6) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.gl || !this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  private poll() {
    const gl = this.gl, ext = this.ext;
    if (!gl || !ext) return;
    while (this.pending.length) {
      const q = this.pending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) {
        const value = Number(gl.getQueryParameter(q, gl.QUERY_RESULT)) / 1e6;
        if (Number.isFinite(value) && value > 0 && value < 1000) {
          this.samples.push(value);
          if (this.samples.length > 45) this.samples.shift();
          const ordered = [...this.samples].sort((a, b) => a - b);
          // 순간 스파이크보다 지속 부하를 보기 위해 중앙값을 HUD에 낸다.
          this.ms = ordered[Math.floor(ordered.length / 2)] ?? 0;
        }
      }
      gl.deleteQuery(q);
    }
  }

  get available() { return !!this.ext; }
  get sampleCount() { return this.samples.length; }

  /** 렌더 타깃 크기가 바뀌면 이전 해상도의 표본은 더 이상 비교값이 아니므로 버린다. */
  reset() {
    if (this.gl) for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending.length = 0;
    this.samples.length = 0;
    this.ms = 0;
  }
}
