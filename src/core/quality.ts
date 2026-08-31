/**
 * 품질 프리셋: URL `?quality=low|medium|high` > 저장값(localStorage) > 기본값 high.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  level: QualityLevel;
  /**
   * 동시에 켜는 점광원 수 (`light/lightPool.ts`). **픽셀당 조명 비용의 상한**이다 —
   * MeshStandardMaterial 은 픽셀마다 켜진 광원을 전부 순회하므로, 화면을 덮는 지형·숲에서
   * 이 값이 곧 프레임을 정한다. 실측(높음+100 %, 1440×900): 36개 12.9 fps · 16개 35.6 · 8개 60.2
   */
  lightBudget: number;
  pixelRatio: number; // devicePixelRatio 상한 (창이 작을 때의 최대치)
  /** 렌더 타깃 총 픽셀 예산(메가픽셀). 창이 커지면 픽셀비가 이 예산에 맞춰 자동으로 내려간다 */
  pixelBudget: number;
  shadowMap: number;
  shadowRadius: number;
  grassCount: number;
  ao: 'off' | 'Low' | 'Medium' | 'High';
  aoHalfRes: boolean;
  treeScale: number; // 소품 개수 배율
  /** 달빛 방향광 그림자(밤 씬). 섀도맵 패스가 하나 더 늘어난다 — low·medium 은 끈다 */
  moonShadow: boolean;
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
  //
  // 2026-08-23: high 1.3 → 1.1 MP. 1.3 은 위 공식으로 16.8 ms — 개발 기기(M4 Pro)에서조차 여유가 0 이라,
  // 픽셀당 처리량이 조금이라도 낮은 GPU 는 상시 100% + 45~55 fps 가 된다(M2 Max 「무겁다」 후기).
  // 1.1 MP ≈ 15.2 ms 로 한 프레임쯤 여유를 남긴다. medium 과 예산이 같아지지만 high 는 그 예산을
  // AO·달그림자·큰 섀도맵에 쓴다. 「프레임보다 화질」은 ultra 의 몫이다.
  low: { level: 'low', lightBudget: 4, pixelRatio: 1, pixelBudget: 0.9, shadowMap: 1024, shadowRadius: 20, grassCount: 25000, ao: 'off', aoHalfRes: true, treeScale: 0.6, moonShadow: false },
  medium: { level: 'medium', lightBudget: 5, pixelRatio: 1.25, pixelBudget: 1.1, shadowMap: 2048, shadowRadius: 26, grassCount: 60000, ao: 'off', aoHalfRes: true, treeScale: 0.85, moonShadow: false },
  high: { level: 'high', lightBudget: 6, pixelRatio: 1.5, pixelBudget: 1.1, shadowMap: 3072, shadowRadius: 30, grassCount: 100000, ao: 'Low', aoHalfRes: true, treeScale: 1, moonShadow: true },
  // ultra 는 "프레임보다 화질" 을 명시적으로 고른 경우 — 예산을 크게 두고 60 fps 를 보장하지 않는다
  // 깊이 인식 업샘플링이 켜진 N8AO는 반해상도에서도 윤곽을 보존한다. Ultra도 AO만 반해상도로
  // 유지해 전체 화면 픽셀 비용을 줄이고, 기본 렌더·재질·SMAA 해상도는 그대로 둔다.
  ultra: { level: 'ultra', lightBudget: 10, pixelRatio: 2, pixelBudget: 2.2, shadowMap: 4096, shadowRadius: 32, grassCount: 140000, ao: 'Medium', aoHalfRes: true, treeScale: 1, moonShadow: true },
};

/** 픽셀비 하한 — 이보다 낮추면 화면이 뭉개져서, 여기까지 내려도 느리면 품질 단계를 낮추는 게 맞다 */
const MIN_PIXEL_RATIO = 0.75;

/**
 * 이 창 크기에서 실제로 쓸 픽셀비.
 * `min(devicePixelRatio, 프로필 상한)` 에서 시작해, 렌더 픽셀 총량이 `pixelBudget` 을 넘으면 그만큼 더 낮춘다.
 * 창이 커질수록(전체화면·4K) 자동으로 내려가므로 부하가 화면 크기와 무관하게 일정해진다.
 * `scale` 은 Esc 메뉴의 수동 렌더 해상도 배율(축 기준 0.5~1) — 사용자가 직접 고른 값이므로
 * MIN_PIXEL_RATIO 하한의 **바깥**에서 곱한다(하한은 자동 예산이 뭉개는 것을 막는 장치다).
 */
export function effectivePixelRatio(profile: QualityProfile, cssWidth: number, cssHeight: number, dpr = window.devicePixelRatio, scale = 1): number {
  const cap = Math.min(dpr, profile.pixelRatio);
  const cssPixels = Math.max(1, cssWidth * cssHeight);
  const byBudget = Math.sqrt((profile.pixelBudget * 1e6) / cssPixels);
  return Math.max(MIN_PIXEL_RATIO, Math.min(cap, byBudget)) * scale;
}

export function detectQuality(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): QualityProfile {
  const url = new URLSearchParams(location.search).get('quality') as QualityLevel | null;
  if (url && PROFILES[url]) return PROFILES[url];
  const saved = localStorage.getItem('3dm.quality') as QualityLevel | null;
  if (saved && PROFILES[saved]) return PROFILES[saved];

  // 최초 실행 기본은 **높음**. URL과 사용자가 저장한 선택이 있으면 그 값을 우선한다.
  // 런타임 적응형 하향은 그대로 동작해 프레임이 지속적으로 낮을 때만 한 단계씩 낮춘다.
  void gl;
  return PROFILES.high;
}

export function saveQuality(level: QualityLevel) { localStorage.setItem('3dm.quality', level); }

/** Esc 메뉴의 수동 렌더 해상도 배율(축 기준 0.5~1). 화질 프리셋과 별개로 저장한다 */
const SCALE_KEY = '3dm.renderscale';
export function loadRenderScale(): number {
  // 최초 실행 기본 100 % — 저장된 슬라이더 값이 있으면 그쪽이 우선
  try {
    const v = Number(localStorage.getItem(SCALE_KEY));
    return v >= 0.5 && v <= 1 ? v : 1;
  } catch { return 1; }
}
export function saveRenderScale(v: number) {
  try { localStorage.setItem(SCALE_KEY, String(v)); } catch { /* 사파리 프라이빗 등 */ }
}
export function lowerLevel(level: QualityLevel): QualityLevel | null {
  const i = QUALITY_LEVELS.indexOf(level);
  return i > 0 ? QUALITY_LEVELS[i - 1]! : null;
}
export const QUALITY_LEVELS: QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
export function profileFor(level: QualityLevel) { return PROFILES[level]; }
