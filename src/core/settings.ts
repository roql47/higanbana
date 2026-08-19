/**
 * 튜닝 가능한 파라미터의 단일 소스.
 * Tweakpane이 이 객체를 직접 바인딩하므로, 런타임 코드는 항상 여기서 값을 읽는다.
 */
export const settings = {
  movement: {
    walkSpeed: 1.5, // m/s (기본) — walk 클립 고유속도 1.15 → 재생 1.3×
    runSpeed: 3.6, // m/s (Shift 달리기) — run 클립 고유속도 3.6 → 재생 1.0×
    accelGround: 14, // 1/s — 목표 속도로 수렴하는 지수 감쇠 계수
    decelGround: 18,
    accelAir: 4,
    turnSpeed: 14, // 1/s — 바라보는 방향 회전 감쇠
    gravity: 26, // m/s²
    groundStick: 0, // m/s — 접지 중 아래로 누르는 속도. 0이 아니면 Rapier 오프셋과 충돌해 평지에서 랜덤 멈칫(검증됨). 경사 하강은 snapToGround가 담당
    jumpHeight: 1.6, // m
    coyoteTime: 0.12, // s
    jumpBuffer: 0.12, // s
    jumpCutMultiplier: 0.45, // 점프 키를 일찍 떼면 상승 속도에 곱함
    airControl: 0.55, // 공중에서 목표 속도 반영 비율
    leanAmount: 0.10, // rad — 가속 방향으로 기울이는 양
    squashOnLand: 0.18, // 착지 스쿼시 강도
  },
  animation: {
    idleThreshold: 0.15, // m/s — 이 미만이면 idle
    walkRunThreshold: 2.6, // m/s — 이 이상이면 run 클립
    walkClipSpeed: 1.15, // 클립이 timeScale 1 에서 표현하는 이동 속도 (2026-08-18 발 접지 속도 측정값)
    runClipSpeed: 3.6,
    footContactWalk: 0.12, // 발목 본 높이(루트 기준)가 이 미만으로 내려오면 접지 이벤트 (walk 클립 최소 0.07)
    footContactRun: 0.24, // (run 클립 최소 0.16)
    idleVariationMin: 7, // s — idle 지속 후 look_around 등 변주까지 최소/최대 대기
    idleVariationMax: 14,
    fadeIdleWalk: 0.25,
    fadeWalkRun: 0.2,
    fadeToJump: 0.08,
    fadeToFall: 0.25,
    fadeLand: 0.15,
    jumpToFallAfter: 0.45, // s — 점프 클립 후 fall 로 넘어가는 시간
    fallDelay: 0.18, // s — 이보다 짧은 공중 시간(계단 등)엔 fall 을 띄우지 않음
    landSquash: 0.06, // 착지 스쿼시(스케일) 강도
  },
  character: {
    // 알베도 색보정 (Tripo 텍스처가 레퍼런스보다 창백함): 로드 시 캔버스로 재가공
    saturation: 1.35, // 1 = 원본
    contrast: 1.12, // 1 = 원본 (중간값 기준)
    brightness: 0.95, // 1 = 원본
    warmth: 0.035, // +R −B
    // 고개 숙임 보정 (rad, + 가 들어올림). 상태별
    headPitchIdle: 0.16,
    headPitchWalk: 0.22,
    headPitchRun: 0.5,
    headPitchAir: 0.12,
    neckShare: 0.4, // 보정량 중 목(NeckTwist01)이 담당하는 비율, 나머지는 Head
    // 상체 숙임 보정 (rad, + 가 펴줌) — run 클립이 상체를 많이 숙임
    spinePitchIdle: 0.0,
    spinePitchWalk: 0.06,
    spinePitchRun: 0.32,
    spinePitchAir: 0.05,
  },
  attack: {
    // 절차적 3타 콤보 (character/proceduralAttack.ts COMBO 프리셋 사용)
    speed: 1.25, // 모션 재생 배율(>1 빠르게) — 콤보 클립에도 적용
    amplitude: 1.0, // 각도 배율
    comboWindow: 0.45, // 타가 끝난 뒤 다음 타를 이어갈 수 있는 시간(초)
    stepImpulse: 1.0, // 내딛기 세기 배율
  },
  audio: {
    master: 0.6,
    footstep: 0.5,
    jump: 0.4,
    land: 0.6,
    ambient: 0.12,
    combat: 0.7,
    matsuri: 0.5,
    heartbeat: 0.6,
  },
  night: {
    fogDensity: 0.018, // FogExp2 — 실질 시야 약 55 m (맵 경계 200 m 는 완전히 잠긴다)
    fogColor: 0x141d30,
    moonElevation: 34, // deg
    moonAzimuth: -55,
    moonIntensity: 1.5,
    hemiIntensity: 0.40,
    envIntensity: 0.42,
    mistOpacity: 0.30,
    mistHeight: 1.1, // m — 논 위 안개층 높이
  },
  chochin: {
    /** 0=끔 1=약 2=강 */
    level: 2,
    color: 0xffb063,
    rangeLow: 4.5,
    rangeHigh: 11,
    intensityLow: 1.3,
    intensityHigh: 4.6,
    /** 감지 배율(H2 에서 senses 가 읽는다) — 끔/약/강 */
    detectionMul: [0.6, 1.4, 3.0],
    flicker: 0.14, // 0..1 불꽃 흔들림 세기
    swayLag: 9, // 1/s — 손을 따라가는 진자 감쇠(작을수록 크게 흔들림)
    /** 손 위치에 더하는 오프셋(m): [몸 바깥쪽, 위+/아래−, 앞+]. 바깥쪽은 골반→손 방향 */
    gripPos: [0.13, -0.21, 0.0] as [number, number, number],
    size: 0.34, // 초칭 전체 높이(m)
  },
  ai: {
    baseDetection: 6, // m — 시야 기본 거리. 초칭 배율·이동 배율이 곱해진다
    patrolSpeed: 1.0, // m/s
    chaseSpeed: 3.2, // m/s (플레이어 달리기 3.6 — 초반엔 도망 가능)
    investigateTime: 8, // s — 소음 지점 배회
    searchTime: 12, // s — 마지막 목격 지점 수색
    loseSightTime: 3, // s — 시야가 이 시간 끊기면 추격 포기
    mercyTime: 1.2, // s — 발견 직후 가속 금지
    grabDistance: 1.15, // m
    noiseWalk: 4, // m — 걷기 발소리 소음 반경
    noiseRun: 12, // m — 달리기
    gaitJitter: 0.35, // 0..1 — 걸음 어긋남(재생 속도 요동)
  },
  physics: {
    controllerOffset: 0.02, // Rapier 캐릭터 컨트롤러가 장애물과 유지하는 간격
    autostepHeight: 0.35,
    autostepMinWidth: 0.2,
    snapToGround: 0.35,
    maxSlopeClimb: 48, // deg
    minSlopeSlide: 52, // deg
  },
  camera: {
    distance: 2.6,
    minDistance: 1.4,
    maxDistance: 5.0,
    pivotHeight: 1.38,
    shoulderOffset: 0.5,
    sensitivity: 0.0022, // rad / px
    minPitch: -0.55, // rad (아래로)
    maxPitch: 1.15, // rad (위로)
    followLag: 12, // 1/s — 피벗 위치 추적 감쇠
    zoomLag: 10,
    baseFov: 58,
    runFovBoost: 6,
    fovLag: 6,
    collisionRadius: 0.25,
    minCollisionDistance: 0.65, // 벽에 막혔을 때 카메라가 피벗에 접근할 수 있는 최소 거리
    fadeDistance: 1.15, // 이 거리보다 가까우면 캐릭터를 반투명 처리 시작
    collisionPullSpeed: 40, // 벽 만나면 빠르게 당기고
    collisionReleaseSpeed: 6, // 풀릴 땐 천천히
  },
  render: {
    exposure: 0.95, // 밤: 초칭 하나가 유일한 광원이라 노출을 올린다
    sunElevation: 40, // deg
    sunAzimuth: 150, // deg
    sunIntensity: 2.4,
    envIntensity: 0.12, // Sky 셰이더 절대 밝기가 매우 큼(태양 원반 제외해도) → 낮게. 그림자 채움은 hemi
    hemiIntensity: 0.55,
    turbidity: 3.0,
    rayleigh: 1.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.8,
    aoIntensity: 2.4,
    aoRadius: 1.0,
    bloomIntensity: 0.75, // 밤 축제 = 등불 번짐이 주인공
    bloomThreshold: 0.55,
    vignetteDarkness: 0.68,
    vignetteOffset: 0.22,
    saturation: -0.18, // -1..1 (밤: 채도를 빼고 붉은 계열만 살린다 — 피안화는 H4)
    contrast: 0.16, // -1..1
    brightness: 0.0,
    shadowRadius: 18, // 섀도 프러스텀 반경(캐릭터 중심) — 섬 월드는 넓게, 맵 4096
    showColliders: false,
  },
};

export type Settings = typeof settings;

/** `?scene=sandbox` (초원 섬, v0.8) 로 돌아갈 때 되돌리는 낮 세팅 */
export const DAY_PRESET = {
  movement: { walkSpeed: 1.6, runSpeed: 5.0 },
  camera: { distance: 4.6, pivotHeight: 1.45, minDistance: 1.8, maxDistance: 9, shoulderOffset: 0.35, baseFov: 55, runFovBoost: 7, minCollisionDistance: 0.5, fadeDistance: 1.3 },
  render: { exposure: 0.62, aoIntensity: 2.0, aoRadius: 1.2, bloomIntensity: 0.2, bloomThreshold: 1.0, vignetteDarkness: 0.55, vignetteOffset: 0.35, saturation: 0.15, contrast: 0.08, shadowRadius: 30 },
};

/** DAY_PRESET 을 settings 에 덮어쓴다 */
export function applyDayPreset() {
  Object.assign(settings.movement, DAY_PRESET.movement);
  Object.assign(settings.camera, DAY_PRESET.camera);
  Object.assign(settings.render, DAY_PRESET.render);
}
