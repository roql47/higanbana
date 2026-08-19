/** 2D Simplex noise (Stefan Gustavson 방식) — 지형/물 등 프로시저럴 생성용. 시드 고정. */
export class Simplex2D {
  private perm = new Uint8Array(512);
  private permMod12 = new Uint8Array(512);
  private static grad3 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [1, 0], [-1, 0],
    [0, 1], [0, -1], [0, 1], [0, -1],
  ];

  constructor(seed = 1337) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // xorshift 셔플
    let s = seed >>> 0 || 1;
    const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i]!; p[i] = p[j]!; p[j] = t;
    }
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]!; this.permMod12[i] = this.perm[i]! % 12; }
  }

  /** -1..1 */
  noise(xin: number, yin: number): number {
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    const g = Simplex2D.grad3;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const gi = this.permMod12[ii + this.perm[jj]!]!; t0 *= t0; n0 = t0 * t0 * (g[gi]![0]! * x0 + g[gi]![1]! * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const gi = this.permMod12[ii + i1 + this.perm[jj + j1]!]!; t1 *= t1; n1 = t1 * t1 * (g[gi]![0]! * x1 + g[gi]![1]! * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const gi = this.permMod12[ii + 1 + this.perm[jj + 1]!]!; t2 *= t2; n2 = t2 * t2 * (g[gi]![0]! * x2 + g[gi]![1]! * y2); }
    return 70 * (n0 + n1 + n2);
  }

  /** 프랙탈 합 (fBm), 대략 -1..1 */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }
}
