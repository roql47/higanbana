import * as THREE from 'three';
import { settings } from '@/core/settings';

/**
 * 시간대(時分) — 장면마다 하늘·빛·안개·색보정을 한 벌로 바꾼다.
 *
 * 스토리보드는 시간대를 계속 옮겨 다닌다: 10년 전 **비 오는 밤**(ACT 1) → **저녁**(ACT 16-1 오후 5시 10분,
 * 피안제 준비) → **한밤**(ACT 16-3 밤 11시 47분) → **붉은 달**(ACT 24 피안의 밤) → **새벽**(ACT 21·33)
 * → **봄 낮**(ACT 34 에필로그). 이걸 매번 손으로 조명값을 만지면 장면마다 톤이 어긋난다.
 *
 * 그래서 **한 곳에 정의하고 이름으로 부른다.** 각 프리셋은 다섯 층을 한꺼번에 정한다:
 *   ① 하늘 돔 색 (천정·지평선·지면 반사)   ② 주광원(달/해)의 고도·방위·세기·색
 *   ③ 환경광(hemi/env)                     ④ 안개 색·밀도
 *   ⑤ 톤매핑·채도·대비 (색보정)
 *
 * 전환은 **보간**된다 — 조명이 한 프레임에 튀면 컷이 잘린 것처럼 보인다.
 */

export type TimeOfDayName =
  | 'rainNight'    // ACT 1 — 10년 전, 비 오는 밤. 달이 구름에 먹혀 거의 안 보인다
  | 'afternoon'    // ACT 2 — 버스에서 내리는 오후 3시. 아직 아무 일도 일어나지 않은 시간
  | 'night'        // 기본 — 현재의 히가사토. 달이 있고 별이 보인다
  | 'dusk'         // ACT 16-1 — 해가 막 넘어간 저녁. 마지막으로 평화로웠던 시간
  | 'evening'      // 현재의 히가사토 기본 — **늦은 저녁**. 해는 갔는데 하늘에 아직 빛이 남아 있다
  | 'dawn'         // ACT 21·33 — 새벽. 살아남은 아이가 발견되는 시간
  | 'day'          // ACT 34 — 1년 후 봄. 이 게임에서 유일하게 밝은 장면
  | 'bloodMoon';   // ACT 24 — 피안의 밤. 거대한 붉은 달, 별이 없다

export interface TimeOfDay {
  sky: { zenith: number; horizon: number; ground: number; moonColor: number; moonSize: number; stars: number };
  light: { elevation: number; azimuth: number; intensity: number; color: number };
  ambient: { hemi: number; env: number; hemiSky: number; hemiGround: number };
  fog: { color: number; density: number };
  grade: { exposure: number; saturation: number; contrast: number; vignette: number };
  /** 논 위 안개층 */
  mist: number;
}

export const TIMES: Record<TimeOfDayName, TimeOfDay> = {
  // 비구름이 달을 먹었다. 별이 없고, 하늘이 땅보다 조금 밝을 뿐이다.
  //
  // ⚠️ 이 프리셋은 한 번 **너무 어두웠다** — 발밑조차 안 보이는 순검은 화면이었고,
  // 스토리보드의 두 그림(피안화 길·도리이)이 화면에 존재할 수가 없었다. 범인은 밝기가 아니라
  // **대비**였다: `BrightnessContrastEffect` 는 contrast k 에서 `(c−0.5)(1+k)+0.5` 이므로
  // c < 0.5 − 0.5/(1+k) 가 통째로 0 이 된다. k 0.16 → **6.9 % 이하가 전부 순검정**.
  // 비 오는 밤의 지면 밝기가 딱 그 아래였다. 대비를 낮추고(2.4 % 로) 노출·환경광을 올려
  // "어둡지만 보이는" 자리로 옮겼다. 어둠은 여전히 안개(0.024)가 만든다 — 발밑은 보이고
  // 20 m 앞은 안 보인다. 그래야 번개가 앞을 열어 주는 사건이 된다
  rainNight: {
    sky: { zenith: 0x0d1626, horizon: 0x24334f, ground: 0x0a0e18, moonColor: 0xa8bcdc, moonSize: 0.006, stars: 0.2 },
    light: { elevation: 42, azimuth: -70, intensity: 1.9, color: 0xa8bee4 },
    ambient: { hemi: 0.95, env: 0.72, hemiSky: 0x36486e, hemiGround: 0x161d28 },
    fog: { color: 0x1c2a44, density: 0.017 },
    grade: { exposure: 0.90, saturation: -0.08, contrast: 0.04, vignette: 0.46 },
    mist: 0.42,
  },
  // **오후 3시** — 미오가 버스에서 내리는 시간(ACT 2).
  // 밝지만 즐겁지는 않게: 채도를 거의 올리지 않고 안개를 조금 남긴다. 피안(9월 하순)의 오후라
  // 해가 서남서로 기울어 있고(고도 34°) 빛이 살짝 노랗다 — `dusk`(방위 −108°)로 자연스럽게 이어진다.
  // 이 장면이 밝을수록 20 초 뒤의 밤이 **떨어져 나간 것**처럼 보인다
  afternoon: {
    sky: { zenith: 0x3f74b4, horizon: 0xbcd0e2, ground: 0x7d8a6a, moonColor: 0xfff3dc, moonSize: 0.008, stars: 0 },
    light: { elevation: 34, azimuth: -80, intensity: 2.9, color: 0xffeed0 },
    // hemiGround 는 **아래에서 올라오는 반사광**이라 아래를 보는 면(버스 천장 같은)을 물들인다.
    // 올리브를 그대로 쓰면 실내 천장이 통째로 초록이 된다 — 채도를 뺀 흙색으로
    ambient: { hemi: 1.05, env: 1.15, hemiSky: 0x93b6dc, hemiGround: 0x6e6a5c },
    fog: { color: 0xb8c6d2, density: 0.006 },
    grade: { exposure: 0.78, saturation: 0.08, contrast: 0.04, vignette: 0.32 },
    mist: 0.06,
  },
  // 기본 — 맑은 여름밤. 달이 논 수면에 반사된다
  night: {
    sky: { zenith: 0x0a1226, horizon: 0x243550, ground: 0x070a12, moonColor: 0xe8f0ff, moonSize: 0.0085, stars: 1 },
    light: { elevation: 34, azimuth: -55, intensity: 1.5, color: 0xaec6ff },
    ambient: { hemi: 0.40, env: 0.42, hemiSky: 0x2a3a5c, hemiGround: 0x0a0d12 },
    fog: { color: 0x141d30, density: 0.018 },
    grade: { exposure: 0.62, saturation: 0.15, contrast: 0.08, vignette: 0.55 },
    mist: 0.30,
  },
  // 해가 막 넘어간 저녁 — 서쪽 하늘만 주황, 동쪽은 벌써 남색. 축제 준비가 한창인 시간
  dusk: {
    sky: { zenith: 0x1e2a4e, horizon: 0xd07a3c, ground: 0x241a14, moonColor: 0xffd8a0, moonSize: 0.012, stars: 0.12 },
    light: { elevation: 6, azimuth: -108, intensity: 2.6, color: 0xffb066 },
    ambient: { hemi: 0.85, env: 0.95, hemiSky: 0x8a7ca0, hemiGround: 0x3a2a1e },
    fog: { color: 0x6a5a5e, density: 0.010 },
    grade: { exposure: 0.72, saturation: 0.22, contrast: 0.06, vignette: 0.40 },
    mist: 0.18,
  },
  /**
   * **늦은 저녁** — 현재 히가사토의 기본 시간대 (사용자 지시 2026-08-21).
   *
   * `dusk`(해가 걸쳐 있다)와 `night`(캄캄하다) 사이. 해는 이미 넘어갔는데 하늘이 아직 빛을 물고 있어서
   * **등불 없이도 형체가 보이는** 밝기다 — 폐촌의 생활 흔적(ACT 4)이 보이려면 이 정도는 있어야 한다.
   *
   * 밤과 다른 점은 밝기만이 아니다: 저녁의 빛은 **주광원이 아니라 하늘 전체**에서 온다.
   * 그래서 달을 세게 하지 않고 **환경광을 올린다**(hemi 1.02 · env 1.10) —
   * 그림자가 흐리고 어디에도 검은 구멍이 없는, 해가 진 직후의 공기.
   * 서쪽 지평선에만 죽은 장밋빛이 남고 천정은 이미 남색이다.
   *
   * ⚠️ 한 번 **더 올렸다**(2026-08-21, 사용자 지시 — 「버스에서 내렸을 때 너무 어둡다」).
   * 이전 값(exposure 0.72 · hemi 0.72 · env 0.80 · vignette 0.44)은 프롤로그의 오후 3시에서
   * 떨어지는 낙차가 커서 인계 직후 화면이 통째로 잠겼다. 밝기를 세 곳에서 나눠 올린다 —
   * **노출**(0.86)로 전체를, **환경광**으로 그림자 속을, **비네트**(0.32)로 화면 가장자리를.
   * 한 곳만 크게 올리면 저녁이 아니라 회색 낮이 된다(안개 색만 올렸을 때 실제로 그랬다).
   * 어둠은 여전히 **안개**(0.0085)가 만든다 — 발밑은 잘 보이고 먼 곳은 흐리다.
   */
  evening: {
    sky: { zenith: 0x1e2c52, horizon: 0x9a8090, ground: 0x2a2a32, moonColor: 0xf4f7ff, moonSize: 0.0095, stars: 0.3 },
    light: { elevation: 14, azimuth: -96, intensity: 2.5, color: 0xdccfd8 },
    ambient: { hemi: 1.02, env: 1.10, hemiSky: 0x7a83a6, hemiGround: 0x35353e },
    fog: { color: 0x59617a, density: 0.0085 },
    grade: { exposure: 0.86, saturation: 0.14, contrast: 0.03, vignette: 0.32 },
    mist: 0.18,
  },
  // 새벽 — 아직 해가 안 떴다. 푸른 시간(blue hour). 미오가 혼자 발견되는 빛
  dawn: {
    sky: { zenith: 0x1a2a4a, horizon: 0x9aa8b8, ground: 0x1a1d22, moonColor: 0xfff0d8, moonSize: 0.010, stars: 0.25 },
    light: { elevation: 4, azimuth: 82, intensity: 1.9, color: 0xd8dcea },
    ambient: { hemi: 0.95, env: 1.05, hemiSky: 0x8fa2bc, hemiGround: 0x2a2c30 },
    fog: { color: 0x8892a0, density: 0.016 },
    grade: { exposure: 0.74, saturation: 0.02, contrast: 0.04, vignette: 0.34 },
    mist: 0.55,   // 새벽 물안개가 가장 두껍다
  },
  // 1년 후 봄 — 이 게임에서 유일하게 그림자가 짧고 색이 있는 장면
  day: {
    sky: { zenith: 0x4a86c8, horizon: 0xc8dcf0, ground: 0x8a9a78, moonColor: 0xfffcf0, moonSize: 0.009, stars: 0 },
    light: { elevation: 52, azimuth: 40, intensity: 3.1, color: 0xfff4e2 },
    ambient: { hemi: 1.25, env: 1.35, hemiSky: 0x9cc4ec, hemiGround: 0x6a7458 },
    fog: { color: 0xcadcec, density: 0.004 },
    grade: { exposure: 0.80, saturation: 0.18, contrast: 0.02, vignette: 0.26 },
    mist: 0.05,
  },
  // 피안의 밤 — 거대한 붉은 달. 별이 사라졌다(하늘이 이미 저쪽이다)
  bloodMoon: {
    sky: { zenith: 0x1a0508, horizon: 0x4e0d10, ground: 0x0e0406, moonColor: 0xff5a48, moonSize: 0.055, stars: 0 },
    light: { elevation: 28, azimuth: -40, intensity: 1.7, color: 0xff8a72 },
    ambient: { hemi: 0.55, env: 0.60, hemiSky: 0x5a1418, hemiGround: 0x140608 },
    fog: { color: 0x2c0a10, density: 0.024 },
    grade: { exposure: 0.66, saturation: 0.30, contrast: 0.14, vignette: 0.60 },
    mist: 0.40,
  },
};

interface SkyLike {
  moon: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  updateSun: () => void;
  setSkyColors: (o: { zenith?: number; horizon?: number; ground?: number; moonColor?: number; moonSize?: number; stars?: number }) => void;
}

/**
 * 시간대를 건다. `seconds > 0` 이면 그 시간에 걸쳐 **보간**한다.
 * 하늘 돔 색과 PMREM 굽기는 비싸므로 보간 중에는 6 Hz 로만 갱신한다.
 */
export class TimeOfDayController {
  private cur: TimeOfDay;
  private from: TimeOfDay;
  private to: TimeOfDay;
  private t = 0;
  private dur = 0;
  private bakeAcc = 0;
  name: TimeOfDayName;

  constructor(private sky: SkyLike, private scene: THREE.Scene, private onGrade: () => void, start: TimeOfDayName = 'night') {
    this.name = start;
    this.cur = clone(TIMES[start]);
    this.from = clone(this.cur);
    this.to = clone(this.cur);
    this.apply(true);
  }

  /** @param seconds 0 이면 즉시 */
  set(name: TimeOfDayName, seconds = 0) {
    if (name === this.name && this.dur <= 0) return;
    this.name = name;
    this.from = clone(this.cur);
    this.to = clone(TIMES[name]);
    this.dur = seconds;
    this.t = 0;
    if (seconds <= 0) { this.cur = clone(this.to); this.apply(true); }
  }

  update(dt: number) {
    if (this.dur <= 0) return;
    this.t += dt;
    const k = THREE.MathUtils.smoothstep(Math.min(1, this.t / this.dur), 0, 1);
    lerpInto(this.cur, this.from, this.to, k);
    this.bakeAcc += dt;
    const done = this.t >= this.dur;
    // 하늘 굽기는 비싸다 — 보간 중엔 6 Hz, 끝날 때 한 번 확실히
    const bake = done || this.bakeAcc >= 1 / 6;
    if (bake) this.bakeAcc = 0;
    this.apply(bake);
    if (done) this.dur = 0;
  }

  private apply(bakeSky: boolean) {
    const c = this.cur;
    // ① 하늘 + ② 주광원 — settings.night 를 경유해야 기존 튜닝 패널과 값이 어긋나지 않는다
    settings.night.moonElevation = c.light.elevation;
    settings.night.moonAzimuth = c.light.azimuth;
    settings.night.moonIntensity = c.light.intensity;
    settings.night.hemiIntensity = c.ambient.hemi;
    settings.night.envIntensity = c.ambient.env;
    settings.night.fogColor = c.fog.color;
    settings.night.fogDensity = c.fog.density;
    settings.night.mistOpacity = c.mist;
    this.sky.moon.color.setHex(c.light.color);
    this.sky.hemi.color.setHex(c.ambient.hemiSky);
    this.sky.hemi.groundColor.setHex(c.ambient.hemiGround);
    if (bakeSky) {
      this.sky.setSkyColors(c.sky);
      this.sky.updateSun();   // 하늘 굽기(PMREM)가 여기 들어 있다
    } else {
      this.sky.moon.intensity = c.light.intensity;
      this.sky.hemi.intensity = c.ambient.hemi;
      this.scene.environmentIntensity = c.ambient.env;
    }
    // ④ 안개
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog && (fog as THREE.FogExp2).isFogExp2) {
      fog.color.setHex(c.fog.color);
      fog.density = c.fog.density;
    }
    // ⑤ 색보정
    settings.render.exposure = c.grade.exposure;
    settings.render.saturation = c.grade.saturation;
    settings.render.contrast = c.grade.contrast;
    settings.render.vignetteDarkness = c.grade.vignette;
    this.onGrade();
  }
}

function clone(t: TimeOfDay): TimeOfDay {
  return { sky: { ...t.sky }, light: { ...t.light }, ambient: { ...t.ambient }, fog: { ...t.fog }, grade: { ...t.grade }, mist: t.mist };
}

const mixHex = (a: number, b: number, k: number) =>
  _ca.setHex(a).lerp(_cb.setHex(b), k).getHex();
const _ca = new THREE.Color();
const _cb = new THREE.Color();
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

function lerpInto(out: TimeOfDay, a: TimeOfDay, b: TimeOfDay, k: number) {
  out.sky.zenith = mixHex(a.sky.zenith, b.sky.zenith, k);
  out.sky.horizon = mixHex(a.sky.horizon, b.sky.horizon, k);
  out.sky.ground = mixHex(a.sky.ground, b.sky.ground, k);
  out.sky.moonColor = mixHex(a.sky.moonColor, b.sky.moonColor, k);
  out.sky.moonSize = mix(a.sky.moonSize, b.sky.moonSize, k);
  out.sky.stars = mix(a.sky.stars, b.sky.stars, k);
  out.light.elevation = mix(a.light.elevation, b.light.elevation, k);
  out.light.azimuth = mix(a.light.azimuth, b.light.azimuth, k);
  out.light.intensity = mix(a.light.intensity, b.light.intensity, k);
  out.light.color = mixHex(a.light.color, b.light.color, k);
  out.ambient.hemi = mix(a.ambient.hemi, b.ambient.hemi, k);
  out.ambient.env = mix(a.ambient.env, b.ambient.env, k);
  out.ambient.hemiSky = mixHex(a.ambient.hemiSky, b.ambient.hemiSky, k);
  out.ambient.hemiGround = mixHex(a.ambient.hemiGround, b.ambient.hemiGround, k);
  out.fog.color = mixHex(a.fog.color, b.fog.color, k);
  out.fog.density = mix(a.fog.density, b.fog.density, k);
  out.grade.exposure = mix(a.grade.exposure, b.grade.exposure, k);
  out.grade.saturation = mix(a.grade.saturation, b.grade.saturation, k);
  out.grade.contrast = mix(a.grade.contrast, b.grade.contrast, k);
  out.grade.vignette = mix(a.grade.vignette, b.grade.vignette, k);
  out.mist = mix(a.mist, b.mist, k);
}
