/**
 * 튜닝 가능한 파라미터의 단일 소스.
 * Tweakpane이 이 객체를 직접 바인딩하므로, 런타임 코드는 항상 여기서 값을 읽는다.
 */
export const settings = {
  movement: {
    walkSpeed: 1.6, // m/s (Shift) — walk 클립 고유속도 1.15 → 재생 1.4×
    runSpeed: 5.0, // m/s (기본) — run 클립 고유속도 3.6 → 재생 1.4×
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
    distance: 4.6,
    minDistance: 1.8,
    maxDistance: 9,
    pivotHeight: 1.45,
    shoulderOffset: 0.35,
    sensitivity: 0.0022, // rad / px
    minPitch: -0.55, // rad (아래로)
    maxPitch: 1.15, // rad (위로)
    followLag: 12, // 1/s — 피벗 위치 추적 감쇠
    zoomLag: 10,
    baseFov: 55,
    runFovBoost: 7,
    fovLag: 6,
    collisionRadius: 0.25,
    minCollisionDistance: 0.5, // 벽에 막혔을 때 카메라가 피벗에 접근할 수 있는 최소 거리
    fadeDistance: 1.3, // 이 거리보다 가까우면 캐릭터를 반투명 처리 시작
    collisionPullSpeed: 40, // 벽 만나면 빠르게 당기고
    collisionReleaseSpeed: 6, // 풀릴 땐 천천히
  },
  render: {
    exposure: 0.62, // Sky 셰이더가 HDR로 밝아 1.0이면 완전히 날아감
    sunElevation: 40, // deg
    sunAzimuth: 150, // deg
    sunIntensity: 2.4,
    envIntensity: 0.12, // Sky 셰이더 절대 밝기가 매우 큼(태양 원반 제외해도) → 낮게. 그림자 채움은 hemi
    hemiIntensity: 0.55,
    turbidity: 3.0,
    rayleigh: 1.6,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.8,
    aoIntensity: 2.0,
    aoRadius: 1.2,
    bloomIntensity: 0.2, // 하늘이 블룸에 걸리면 뿌옇게 됨 → 낮게
    bloomThreshold: 1.0,
    vignetteDarkness: 0.55,
    vignetteOffset: 0.35,
    saturation: 0.15, // -1..1
    contrast: 0.08, // -1..1
    brightness: 0.0,
    shadowRadius: 30, // 섀도 프러스텀 반경(캐릭터 중심) — 섬 월드는 넓게, 맵 4096
    showColliders: false,
  },
};

export type Settings = typeof settings;
