/**
 * 품질 프리셋: URL `?quality=low|medium|high` > 저장값(localStorage) > 자동 감지.
 * 자동 감지는 보수적으로: 터치 기기/저코어/저해상도 → low, Apple Silicon·고급 dGPU 문자열 → high, 그 외 medium.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  level: QualityLevel;
  pixelRatio: number; // devicePixelRatio 상한 (창이 작을 때의 최대치)
  /** 렌더 타깃 총 픽셀 예산(메가픽셀). 창이 커지면 픽셀비가 이 예산에 맞춰 자동으로 내려간다 */
  pixelBudget: number;
  shadowMap: number;
  shadowRadius: number;
  grassCount: number;
  ao: 'off' | 'Low' | 'Medium' | 'High';
  aoHalfRes: boolean;
  treeScale: number; // 소품 개수 배율
}

const PROFILES: Record<QualityLevel, QualityProfile> = {
  // 2026-08-18 측정: 레티나(2×)에서 풀해상도 AO 가 프레임의 ~40%. high 도 AO 는 절반 해상도·Low, 픽셀비 1.5 로 제한
  //
  // 2026-08-20 측정(M4 Pro, 1440×900 창, high): 픽셀비 1.5=2.9 MP→31 fps · 1.25=2.0 MP→41 fps · 1.0=1.3 MP→59 fps.
  // AO 를 꺼도 +4 fps, 초칭 그림자까지 꺼도 +6 fps 뿐 — **부하가 거의 전부 픽셀 수에 비례한다**(후처리가 풀해상도).
  // 고정 배수는 창 크기에 따라 부하가 몇 배씩 벌어져서(전체화면 전환) GPU 가 100% 로 붙박이고, 그게 곧 발열이다.
  // → pixelBudget(총 픽셀 예산)으로 바꿔 큰 화면일수록 픽셀비가 자동으로 내려가게 한다.
  // 예산은 "60 fps 를 치고도 GPU 가 남는 시간에 쉬는" 지점으로 잡았다(프레임 시간 ≈ 6.4 + 8.0 × MP ms).
  // 1.5 MP 는 19.8 ms(50 fps)로 여전히 GPU 가 붙박이라 1.3 MP 로 낮췄다.
  low: { level: 'low', pixelRatio: 1, pixelBudget: 0.9, shadowMap: 1024, shadowRadius: 20, grassCount: 25000, ao: 'off', aoHalfRes: true, treeScale: 0.6 },
  medium: { level: 'medium', pixelRatio: 1.25, pixelBudget: 1.1, shadowMap: 2048, shadowRadius: 26, grassCount: 60000, ao: 'off', aoHalfRes: true, treeScale: 0.85 },
  high: { level: 'high', pixelRatio: 1.5, pixelBudget: 1.3, shadowMap: 3072, shadowRadius: 30, grassCount: 100000, ao: 'Low', aoHalfRes: true, treeScale: 1 },
  // ultra 는 "프레임보다 화질" 을 명시적으로 고른 경우 — 예산을 크게 두고 60 fps 를 보장하지 않는다
  ultra: { level: 'ultra', pixelRatio: 2, pixelBudget: 2.2, shadowMap: 4096, shadowRadius: 32, grassCount: 140000, ao: 'Medium', aoHalfRes: false, treeScale: 1 },
};

/** 픽셀비 하한 — 이보다 낮추면 화면이 뭉개져서, 여기까지 내려도 느리면 품질 단계를 낮추는 게 맞다 */
const MIN_PIXEL_RATIO = 0.75;

/**
 * 이 창 크기에서 실제로 쓸 픽셀비.
 * `min(devicePixelRatio, 프로필 상한)` 에서 시작해, 렌더 픽셀 총량이 `pixelBudget` 을 넘으면 그만큼 더 낮춘다.
 * 창이 커질수록(전체화면·4K) 자동으로 내려가므로 부하가 화면 크기와 무관하게 일정해진다.
 */
export function effectivePixelRatio(profile: QualityProfile, cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio): number {
  const cap = Math.min(dpr, profile.pixelRatio);
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const byBudget = Math.sqrt((profile.pixelBudget * 1e6) / cssPixels);
  return Math.max(MIN_PIXEL_RATIO, Math.min(cap, byBudget));
}

export function detectQuality(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): QualityProfile {
  const url = new URLSearchParams(location.search).get('quality') as QualityLevel | null;
  if (url && PROFILES[url]) return PROFILES[url];
  const saved = localStorage.getItem('3dm.quality') as QualityLevel | null;
  if (saved && PROFILES[saved]) return PROFILES[saved];

  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const smallScreen = Math.min(screen.width, screen.height) < 700;
  let rendererStr = '';
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* ignore */ }
  const strong = /Apple M\d|RTX|GeForce (30|40|50)|Radeon RX (6|7|8)|Radeon Pro/i.test(rendererStr);
  const weak = /Intel\(R\) (U)?HD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(rendererStr);
  if (coarse || smallScreen || cores <= 4 || weak) return PROFILES.low;
  if (strong && cores >= 8) return PROFILES.high;
  return PROFILES.medium;
}

export function saveQuality(level: QualityLevel) { localStorage.setItem('3dm.quality', level); }
export function lowerLevel(level: QualityLevel): QualityLevel | null {
  const i = QUALITY_LEVELS.indexOf(level);
  return i > 0 ? QUALITY_LEVELS[i - 1]! : null;
}
export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
export function profileFor(level: QualityLevel) { return PROFILES[level]; }
