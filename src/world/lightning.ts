import * as THREE from 'three';
import type { Sfx } from '@/audio/sfx';

/**
 * 번개 — 비 오는 밤(ACT 1)의 유일한 광원 사건.
 *
 * 왜 필요한가: `rainNight` 은 구름이 달을 먹은 프리셋이라 **8 m 앞이 안 보인다.** 그래서
 * 스토리보드의 두 그림 — *끝없이 이어지는 붉은 피안화 길* 과 *멀리 보이는 신사의 도리이* — 가
 * 자막으로만 존재하고 화면에는 없었다. 번개는 그 둘을 **1/10 초 동안 통째로 보여주고 다시 지운다.**
 * 계속 보이는 것보다 한 번 보였다 사라지는 쪽이 훨씬 오래 남는다.
 *
 * 구현: **새 광원을 만들지 않는다.** 라이트를 하나 더 켜면 밤 셰이더가 통째로 재컴파일된다
 * (`pursuers.ts` 의 횃불에서 이미 겪었다). 대신 이미 있는 달빛·반구광의 세기를 순간적으로
 * 끌어올렸다 되돌린다 — 씬 그래프가 그대로라 재컴파일이 없다. 화면 번쩍임은 CSS 오버레이가 맡는다.
 *
 * 파형: 진짜 번개는 한 번 번쩍이지 않는다. 같은 통로로 **되돌이 방전이 두세 번** 지나가며
 * 점점 약해진다 — 그 리듬(강·중·약)이 "전등이 켜졌다"가 아니라 "번개가 쳤다"로 읽히게 한다.
 */

/** 되돌이 방전 — [시작(초), 세기, 감쇠시간(초)] */
const STROKES: [number, number, number][] = [
  [0.00, 1.00, 0.10],
  [0.16, 0.68, 0.15],
  [0.40, 0.34, 0.22],
];
/** 소리는 초당 343 m 를 간다. dist 1 ≈ 2 km ≈ 6 초 */
const THUNDER_DELAY = 6.0;

export class Lightning {
  /** 번쩍임 0(없음) ~ 1(최대) — 이번 프레임 값 */
  value = 0;
  private t = -1;
  private strength = 1;
  /**
   * 이번 프레임에 **더한** 양. 복원할 때 기억해 둔 원래 값을 쓰지 않고 더한 만큼을 빼는 이유:
   * 번쩍이는 도중에 시간대가 바뀌면(`timeOfDay.set`) 원래 값이 이미 다른 숫자가 되어 있고,
   * 그때 옛 값을 되돌리면 새 프리셋의 조명이 통째로 어긋난다.
   */
  private addMoon = 0;
  private addHemi = 0;
  /** 안개도 함께 밝아진다 — 번개는 표면이 아니라 **공기**를 때린다 */
  private fog: THREE.FogExp2 | null = null;
  private fogBase = new THREE.Color();
  private fogLit = new THREE.Color(0x5d7196);
  private thunderIn = -1;
  private thunderDist = 0.5;
  private thunderGain = 0.7;
  /** 발작 위험 — 광과민 사용자에게는 진폭을 줄이고 되돌이 방전을 뺀다 */
  private readonly calm: boolean;

  constructor(
    private moon: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
    private sfx: Sfx,
    /** 화면 오버레이 (0~1). main 이 DOM 을 쥐고 있으므로 콜백으로 받는다 */
    private setFlash: (v: number) => void,
    private scene?: THREE.Scene,
  ) {
    this.calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 번개 한 번.
   * @param dist     0 = 머리 위(즉시 천둥·강한 크랙) · 1 = 지평선 너머(6 초 뒤 럼블만)
   * @param strength 밝기 배율
   */
  strike(opts: { dist?: number; strength?: number; thunder?: boolean } = {}) {
    const dist = opts.dist ?? 0.5;
    this.strength = (opts.strength ?? 1) * (this.calm ? 0.4 : 1);
    if (this.t < 0) {
      const f = this.scene?.fog as THREE.FogExp2 | undefined;
      this.fog = f && f.isFogExp2 ? f : null;
      if (this.fog) this.fogBase.copy(this.fog.color);
    }
    this.t = 0;
    if (opts.thunder !== false) {
      this.thunderIn = 0.12 + dist * THUNDER_DELAY;
      this.thunderDist = dist;
      this.thunderGain = 0.55 + (1 - dist) * 0.45;
    }
  }

  update(dt: number) {
    if (this.thunderIn > 0) {
      this.thunderIn -= dt;
      if (this.thunderIn <= 0) this.sfx.thunder(this.thunderGain, this.thunderDist);
    }
    if (this.t < 0) return;
    this.t += dt;
    // 되돌이 방전들의 **최댓값** — 겹쳐서 더하면 두 번째가 첫 번째보다 밝아진다
    let k = 0;
    const strokes = this.calm ? STROKES.slice(0, 1) : STROKES;
    for (const [at, amp, dur] of strokes) {
      const u = this.t - at;
      if (u < 0 || u > dur) continue;
      // 상승 8 ms, 그 뒤 지수 감쇠 — 방전은 켜지는 게 아니라 터진다
      const env = u < 0.008 ? u / 0.008 : Math.exp(-(u - 0.008) / (dur * 0.32));
      k = Math.max(k, amp * env);
    }
    k *= this.strength;
    this.value = k;
    // 지난 프레임에 더한 만큼을 먼저 걷어내고 이번 몫을 더한다 (누적·경합 방지)
    this.moon.intensity -= this.addMoon;
    this.hemi.intensity -= this.addHemi;
    // **밤의 번개는 밝기가 아니라 대비다.** 반구광을 크게 올리면 사방이 고르게 떠서
    // "누가 불을 켰다"가 되고 만다(실제로 그렇게 보였다) — 방향광에 몫을 몰아주고
    // 반구광·안개는 조금만 든다. 그래야 삼나무와 도리이가 **실루엣**으로 선다
    this.addMoon = k * 9;
    this.addHemi = k * 1.2;
    this.moon.intensity += this.addMoon;
    this.hemi.intensity += this.addHemi;
    // 빛나는 건 지면이 아니라 **비와 안개**다. 다만 안개까지 하얘지면 화면이 우유가 된다
    if (this.fog) this.fog.color.copy(this.fogBase).lerp(this.fogLit, Math.min(0.34, k * 0.34));
    this.setFlash(k * (this.calm ? 0.10 : 0.17));
    const last = strokes[strokes.length - 1]!;
    if (this.t > last[0] + last[2]) this.end();
  }

  /** 원래 밝기로 돌려놓는다 (중간에 ACT 가 끝나도 조명이 남지 않게) */
  end() {
    this.moon.intensity -= this.addMoon;
    this.hemi.intensity -= this.addHemi;
    this.addMoon = this.addHemi = 0;
    if (this.fog) this.fog.color.copy(this.fogBase);
    this.fog = null;
    this.t = -1;
    this.value = 0;
    this.thunderIn = -1;
    this.setFlash(0);
  }
}
