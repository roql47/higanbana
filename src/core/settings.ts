/**
 * 튜닝 가능한 파라미터의 단일 소스.
 * Tweakpane이 이 객체를 직접 바인딩하므로, 런타임 코드는 항상 여기서 값을 읽는다.
 */
export const settings = {
  movement: {
    walkSpeed: 1.5, // m/s (기본) — walk 클립 고유속도 1.15 → 재생 1.3×
    crouchSpeed: 0.9, // m/s 웅크림 (기획 3.4)
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
    walkClipSpeed: 1.19, // 클립이 timeScale 1 에서 표현하는 이동 속도 (2026-08-20 재측정 — final-v3 리그)
    runClipSpeed: 3.42,
    // 발목 본 높이(루트 기준)가 이 미만으로 내려오면 접지 이벤트.
    // 2026-08-22 재측정: 클립의 position 트랙을 버리면서(`character/model.ts` `addClip`) 다리가
    // **미오 제 길이**를 되찾아 발목이 통째로 올라왔다 — walk 최소 0.083 → **0.115**, run 0.17 → **0.202**.
    // 옛 문턱(0.12 / 0.24)은 여유가 5 mm / 10 mm 밖에 안 남아 발소리가 들쭉날쭉했다.
    //
    // 값은 여유로 정하지 않고 **한 걸음에 정확히 한 번 걸리는 구간**을 찾아 잡았다. 인게임 6 초
    // 정속 주행에서 좌·우 교차 횟수를 문턱별로 센 결과(발이 착지 뒤 한 번 더 살짝 내려앉는다):
    //   walk — 0.125·0.13·0.135 에서 [6, 6] · 0.14 [9, 7] · 0.15 [12, 7]  → 0.13
    //   run  — 0.24·0.25·0.26 에서 [10, 10] · 0.22 [10, 0](오른발 최소 0.230) · 0.27 [10, 11] → 0.25
    footContactWalk: 0.13, // (walk 클립 최소 0.115, 최대 0.312 · 정상 구간 0.125~0.135)
    footContactRun: 0.25, // (run 클립 최소 L 0.202 / R 0.230 · 정상 구간 0.24~0.26)
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
    /**
     * 고개 숙임 보정 (rad, + 가 들어올림). 상태별.
     *
     * **값의 근거(실측, 2026-08-21).** 보정을 전부 0 으로 두고 머리 본의 월드 피치를 쟀다
     * (바인드 자세의 「얼굴 축」을 발목→발가락 방향에서 뽑아 현재 쿼터니언에 태우는 방식,
     * − 가 아래를 봄). 클립 원본:
     *
     * | 클립 | Head | NeckTwist01 | Spine02 |
     * |---|---|---|---|
     * | idle | −18.0° | −18.0° | −2.1° |
     * | walk | −19.1° | −19.2° | −2.1° |
     * | fall | −40.6° | −40.6° | −9.6° |
     * | run  | −57.9° | −57.9° | −33.2° |
     *
     * **idle 과 walk 가 1° 안에서 일치한다** — 따로 만든 두 클립이 같은 값을 내면 그건 연기가
     * 아니라 리그 오차다(`torsoRoll` 의 어깨 처짐과 같은 종류: 클립은 `character.glb` 리그에서
     * 왔는데 게임은 `mio.glb` 를 쓴다). run·fall 의 추가분은 진짜 클립 내용이다 — 달리면 고개가
     * 내려가는 게 맞다.
     *
     * 옛 값(0.16/0.22/0.5/0.12)은 그 −18° 중 **절반만** 폈다. 실측으로 idle 머리가 −9.2° 에
     * 머물렀고, 그게 「구부정하다」는 리포트의 정체다(사용자, 2026-08-21).
     * 보정 1 rad ≈ 57° 로 거의 1:1 이므로 목표 각도에서 바로 역산했다.
     * 검증 후: idle −1.5° · walk −2.2° · run ≈ 0° · look_around −4.4°.
     */
    headPitchIdle: 0.30,
    headPitchWalk: 0.32,
    headPitchRun: 0.60,
    headPitchAir: 0.28,
    /**
     * 보정량 중 **목 전체**가 담당하는 비율, 나머지는 Head.
     * (목 몫은 다시 목 관절 수로 나뉜다 — 이 리그는 NeckTwist01·02 두 마디다)
     *
     * 0.4 였을 때 idle 에서 **머리 −9.2° / 목 −14.7°** 였다 — 턱만 들리고 목은 앞으로 뽑힌 채라
     * 「거북목」으로 읽힌다. 숙임의 원인이 머리 관절이 아니라 **목뿌리**(위 표에서 Head 와
     * NeckTwist01 의 각이 항상 같다 = 목·머리가 통째로 기운다)이므로 목이 더 가져가야 한다.
     * 0.6 에서 idle 머리 −1.5° / 목 −8.3°.
     */
    neckShare: 0.6,
    /**
     * 손목 롤 보정(rad) — 이 리그는 손이 팔뚝 축으로 **180° 돌아가** 나왔다(손바닥이 뒤를 본다).
     * 믹서 뒤에 손 본 로컬 Y 로 곱해 바로잡는다(`character/model.ts`).
     * 리그를 다시 뽑아 고치면 0 으로 두면 된다.
     */
    handRoll: Math.PI,
    /**
     * 어깨선 수평 보정(rad) — 클립(`character.glb` 리그)과 실제 모델(`mio.glb`)의 rest 차이로
     * 생기는 **상시 왼쪽 어깨 처짐**을 편다. 쇄골에 걸리므로 머리·척추는 움직이지 않는다.
     *
     * 값의 근거(실측, 클립 위상을 맞춘 3 초 평균 · 캐릭터 로컬 어깨 높이차):
     *   보정 0 에서 **−27.7 mm** · 민감도 **209 mm/rad** → 27.7 / 209 ≈ **−0.133 rad(−7.6°)**
     *   검증: idle −0.1 / run +1.8 / look_around +1.0 / standing_relax −1.2 / walk +8.8 mm
     *   (walk 의 8.8 mm 는 클립 고유 비대칭 — 다섯 클립이 같은 값을 낼 때만 리그 오차다)
     *
     * 2026-08-22: 클립의 **position 트랙을 버리면서**(`character/model.ts` `addClip`) 팔뼈가 제 길이를
     * 되찾아 같은 쇄골 각도가 만드는 높이차가 커졌다 — 그래서 −0.117 → −0.133 으로 재산정.
     * 0 이면 보정 없음. 리그를 다시 뽑아 바로잡으면 0 으로 둔다.
     */
    torsoRoll: -0.133,
    /**
     * 머리 좌우 기울기 보정(rad, − 가 오른쪽 기울기를 편다) — 고개가 상시 **오른쪽 어깨 쪽**으로
     * 기울어 있었다(사용자 지적, 2026-08-21).
     *
     * 클립별 원본(보정 0, 위상 맞춘 5 초 평균 · − 가 오른쪽):
     *   idle −6.5 · walk −5.4 · run −7.1 · look_around −2.6 · standing_relax −2.8 (평균 −4.9°)
     * 다섯 클립이 전부 같은 방향이면 연기가 아니라 편향이다. 민감도 ≈ 57°/rad →
     * 4.9 / 57.3 ≈ **−0.085**. 검증: idle −1.6 · walk −0.5 · run −2.1 · look_around +2.2 ·
     * standing_relax +2.1 (최대 잔차 2.2° — 눈에 띄는 문턱 아래).
     *
     * 축은 `torsoRoll` 과 같은 이유로 **컨트롤러 yaw 에서 구한 전방**이고,
     * `neckShare` 비율로 목·머리에 나눠 걸린다(`character/model.ts`). 0 이면 보정 없음.
     */
    headRoll: -0.085,
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
    /** 리버브 센드 전역 배율 (0 = 잔향 끔). 존별 절대량은 audio/space.ts 의 ZONES.wet */
    reverb: 1.0,
    /** 벽 오클루전 세기 (0 = 벽이 소리를 안 막음 — 예전 동작) */
    occlusion: 1.0,
  },
  night: {
    fogDensity: 0.018, // FogExp2 — 실질 시야 약 55 m (맵 경계 200 m 는 완전히 잠긴다)
    fogColor: 0x141d30,
    moonElevation: 34, // deg
    moonAzimuth: -55,
    moonIntensity: 1.5,
    hemiIntensity: 0.40,
    envIntensity: 0.42,
    /**
     * 달빛 방향광 그림자. **오래 꺼져 있었고, 그래서 밤 야외에 그림자가 통째로 없었다** —
     * 초칭(반경 13 m) 밖은 전부 납작했다. 실측 비용 +3.7 ms/frame(1440×900, high, M4 Pro)이라
     * 품질 프리셋 high·ultra 에서만 켠다(`core/quality.ts` moonShadow). 여기서 끄면 즉시 예전 상태.
     */
    moonShadow: true,
    mistOpacity: 0.30,
    mistHeight: 1.1, // m — 논 위 안개층 높이
  },
  chochin: {
    /** 0=끔 1=약 2=강 */
    level: 2,
    color: 0xffb063,
    rangeLow: 4.5,
    rangeHigh: 13,
    intensityLow: 0.85, // 사거리는 rangeHigh 로 고정 — 밝기로만 '약' 을 표현 (셰이더 재컴파일 방지)
    intensityHigh: 4.2, // decay 1.5 기준 (근접 포화 방지 — 2026-08-19)
    /** 감지 배율(H2 에서 senses 가 읽는다) — 끔/약/강 */
    detectionMul: [0.6, 1.4, 3.0],
    flicker: 0.14, // 0..1 불꽃 흔들림 세기
    swayLag: 9, // 1/s — 손을 따라가는 진자 감쇠(작을수록 크게 흔들림)
    /** 손 위치에 더하는 오프셋(m): [몸 바깥쪽, 위+/아래−, 앞+]. 바깥쪽은 골반→손 방향 */
    // 2026-08-21 주인공이 미오로 교체되면서 재조정. 이전 값 [0.22, -0.12, 0.02] 는 구 캐릭터(키 1.7,
    // 팔이 더 벌어진 A-포즈) 기준이라, 미오(키 1.62)에게 쓰면 등불이 **손에서 25.8 cm** 떨어져 옆에 떠 있었다.
    // 바깥쪽을 0.22 → 0.05 로 줄이고 아래로 더 내려 손잡이가 손바닥에 오게 한다(실측 간격 22.6 cm
    // = 등불 높이 0.34 의 절반 + 손잡이 몫). 초칭은 `isVillage`(히가사토) 씬에서만 생성되므로 이 값은 미오 전용이다.
    gripPos: [0.05, -0.22, 0.0] as [number, number, number],
    size: 0.34, // 초칭 전체 높이(m)
  },
  /**
   * 캐릭터 채움광 (light/faceFill.ts) — 초칭만으로는 정면에서 얼굴이 읽히지 않아 얹는 보조광.
   * 사거리가 짧아 캐릭터 상반신 밖으로는 새지 않는다. 끄려면 intensity 0.
   */
  fill: {
    color: 0x9fb4d8, // 달빛 계열 차가운 흰색 — 초칭의 주황과 섞여 피부색이 살아난다
    intensity: 0.8, // decay 2 · distance 1.5 기준 (2026-08-20 정면 뷰에서 실측 조정)
    distance: 1.5, // m — 이 밖으로는 빛이 0 (지면·건물·요괴 영향 없음)
    height: 1.5, // m — 발밑 기준 광원 높이 (머리보다 살짝 아래에서 얼굴을 훑는다)
    offset: 0.5, // m — 카메라 쪽으로 띄우는 거리
    /** 초칭 단계별 배율(끔/약/강) — 등불을 끄면 채움광도 같이 죽어야 어둠이 난이도로 남는다 */
    levelMul: [0.3, 0.7, 1.0],
  },

  stamina: {
    // 6 → **18** (사용자 지시 2026-08-21, 3배). `recover` 는 *시간*이라 회복 속도는
    // `max / recover` 로 같이 올라간다 — 빈 게이지가 차는 데 걸리는 시간은 그대로 8 초다.
    max: 18, // s — 전력 질주 지속 (기획 3.4 의 6 초에서 3배)
    recover: 8, // s — 빈 게이지가 다시 차는 시간
    standingBonus: 1.5, // 정지 시 회복 배율
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
    stunTime: 6, // s — 소금 피격 정지 (기획 3.5)
    crouchDetection: 0.7, // 웅크림 감지 배율
    noiseCrouch: 1.5, // m — 웅크림 발소리 소음 반경
    noiseWalk: 4, // m — 걷기 발소리 소음 반경
    noiseRun: 12, // m — 달리기
    gaitJitter: 0.35, // 0..1 — 걸음 어긋남(재생 속도 요동)
  },
  dorotabo: {
    threshold: 4.0, // 노출 임계(초 환산) — 넘으면 출현
    exposeMoving: 2.2, // 논에서 이동 시 노출 증가 배율
    exposeStill: 0.3, // 가만히 있을 때 (벼 은신은 허용, 남용만 벌한다)
    riseTime: 1.1, // s — 솟아오르는 시간
    slideSpeed: 1.6, // m/s — 진흙 위 미끄러짐
    pushRange: 2.2, // m — 밀어내기 시작 거리
    pushSpeed: 3.4, // m/s — 최대 밀어내기 속도
    noiseRadius: 22, // m — 울음 소음 반경 (추격자를 부른다)
    cooldown: 12, // s — 가라앉은 뒤 재출현 대기
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
    /**
     * 어깨 너머 오프셋(m) — 피벗을 카메라 오른쪽으로 밀어 캐릭터를 화면 왼쪽에 놓는다.
     * **0 = 정중앙.** 0.5 였을 때 2.6 m 거리에서 화면 반폭의 약 19 % 만큼 왼쪽으로 치우쳤다
     * (사용자 지적). 앞을 비워 주는 대신 미오가 가운데를 벗어나는 값이라 0 으로 되돌린다.
     */
    shoulderOffset: 0,
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
  /**
   * HUD 편의 기능 — 전부 **끌 수 있다.** 공포 게임의 화면을 조용하게 두고 싶은 사람과,
   * 길을 못 찾아 헤매는 사람 둘 다 있다 (사용자 지시 2026-08-22).
   * 값은 `H` 패널에서 바꾸고 localStorage 에 남는다.
   */
  hud: {
    /** 목표 지시자 — 지금 목표가 화면 어느 쪽인지 (`ui/waypoint.ts`) */
    waypoint: true,
    /** 팻말 가까이 가면 그 문구를 화면에 띄운다 */
    signRead: true,
    /**
     * 창 비율 고정(선택). 켜면 렌더 영역을 `aspect` 로 묶고 남는 자리를 검게 둔다 —
     * 세로로 긴 창에서 화면이 늘어나는 게 싫다는 요청(2026-08-22, 「창크기 고정 → 선택사항」).
     * 기본은 꺼짐: 창을 채우는 쪽이 몰입에 낫다.
     */
    lockAspect: false,
    aspect: 16 / 9,
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
    bloomThreshold: 0.62, // 포화 영역이 번져 질감을 더 뭉개지 않도록 임계 상향
    vignetteDarkness: 0.68,
    vignetteOffset: 0.22,
    saturation: -0.18, // -1..1 (밤: 채도를 빼고 붉은 계열만 살린다 — 피안화는 H4)
    contrast: 0.16, // -1..1
    brightness: 0.0,
    shadowRadius: 18, // 섀도 프러스텀 반경(캐릭터 중심) — 섬 월드는 넓게, 맵 4096
    // 프레임 상한(0 = 무제한). 상한이 없으면 120 Hz 화면에서 120 fps 를 그리느라 GPU 가 계속 100% 로 붙고,
    // 그게 그대로 노트북 발열이 된다. 60 이면 남는 시간에 GPU 가 쉰다 (2026-08-20 발열 피드백)
    maxFps: 60,
    showColliders: false,
  },
};

export type Settings = typeof settings;

/**
 * HUD 편의 설정은 **다음 판에도 남아야 한다.** 「목표 지시자를 껐다」는 취향이지 한 판짜리 선택이 아니다.
 * 알 수 없는 키는 무시하고 아는 키만 덮어쓴다 (예전 저장값이 새 필드를 지우지 않게).
 */
const HUD_KEY = '3dm.hud';
export function loadHudPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(HUD_KEY) ?? '{}') as Record<string, unknown>;
    for (const k of Object.keys(settings.hud) as (keyof typeof settings.hud)[]) {
      const v = saved[k];
      if (typeof v === typeof settings.hud[k]) (settings.hud[k] as unknown) = v;
    }
  } catch { /* 저장값이 깨졌으면 기본값 */ }
}
export function saveHudPrefs() {
  try { localStorage.setItem(HUD_KEY, JSON.stringify(settings.hud)); } catch { /* 사파리 프라이빗 등 */ }
}

/** `?scene=sandbox` (초원 섬, v0.8) 로 돌아갈 때 되돌리는 낮 세팅 */
export const DAY_PRESET = {
  movement: { walkSpeed: 1.6, runSpeed: 5.0, jumpHeight: 1.6 },
  camera: { distance: 4.6, pivotHeight: 1.45, minDistance: 1.8, maxDistance: 9, shoulderOffset: 0.35, baseFov: 55, runFovBoost: 7, minCollisionDistance: 0.5, fadeDistance: 1.3 },
  render: { exposure: 0.62, aoIntensity: 2.0, aoRadius: 1.2, bloomIntensity: 0.2, bloomThreshold: 1.0, vignetteDarkness: 0.55, vignetteOffset: 0.35, saturation: 0.15, contrast: 0.08, shadowRadius: 30 },
};

/** DAY_PRESET 을 settings 에 덮어쓴다 */
export function applyDayPreset() {
  Object.assign(settings.movement, DAY_PRESET.movement);
  Object.assign(settings.camera, DAY_PRESET.camera);
  Object.assign(settings.render, DAY_PRESET.render);
}
