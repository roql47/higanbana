/**
 * 품질 프리셋: URL `?quality=low|medium|high` > 저장값(localStorage) > 자동 감지.
 * 자동 감지는 보수적으로: 터치 기기/저코어/저해상도 → low, Apple Silicon·고급 dGPU 문자열 → high, 그 외 medium.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  level: QualityLevel;
  pixelRatio: number; // 최대 devicePixelRatio 상한
  shadowMap: number;
  shadowRadius: number;
  grassCount: number;
  ao: 'off' | 'Low' | 'Medium' | 'High';
  aoHalfRes: boolean;
  treeScale: number; // 소품 개수 배율
}

const PROFILES: Record<QualityLevel, QualityProfile> = {
  // 2026-08-18 측정: 레티나(2×)에서 풀해상도 AO 가 프레임의 ~40%. high 도 AO 는 절반 해상도·Low, 픽셀비 1.5 로 제한
  low: { level: 'low', pixelRatio: 1, shadowMap: 1024, shadowRadius: 20, grassCount: 25000, ao: 'off', aoHalfRes: true, treeScale: 0.6 },
  medium: { level: 'medium', pixelRatio: 1.25, shadowMap: 2048, shadowRadius: 26, grassCount: 60000, ao: 'off', aoHalfRes: true, treeScale: 0.85 },
  high: { level: 'high', pixelRatio: 1.5, shadowMap: 3072, shadowRadius: 30, grassCount: 100000, ao: 'Low', aoHalfRes: true, treeScale: 1 },
  ultra: { level: 'ultra', pixelRatio: 2, shadowMap: 4096, shadowRadius: 32, grassCount: 140000, ao: 'Medium', aoHalfRes: false, treeScale: 1 },
};

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
