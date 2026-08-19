# 3D_motion — 기획서 (v0.2)

> 한 줄 비전: **브라우저 안에서, 오픈월드 게임처럼 자유롭게 움직이는 단 한 명의 고품질 3D 캐릭터.**
> 많은 걸 만들지 않는다. 캐릭터 하나와 그 조작감을 끝까지 높게 만든다.

작성일: 2026-08-18 · 상태: v0.8 — Phase 0~6 구현 완료(6: 검·허수아비·인벤토리). 남은 것: 배포(호스팅 선택) + 사용자 최종 판정

---

## 0. 확정된 결정 (2026-08-18)

| 항목 | 결정 |
|---|---|
| 핵심 객체 | **오픈월드 스타일 3인칭 캐릭터** (WASD 이동 + 마우스 오빗 카메라) |
| 에셋 제작 | **Tripo API** — 생성 → 자동 리깅 → 프리셋 애니메이션 리타겟, GLB 출력 |
| 1차 타깃 | 데스크톱 마우스/키보드 우선. 터치는 Phase 5 |
| "오픈월드"의 의미 | **크기가 아니라 조작 방식**이다 — 심리스 카메라, 자유 이동, 로딩 없는 하나의 공간. 월드 자체는 작은 섬/다이오라마 하나로 시작한다 |
| 캐릭터 스타일 | **스타일라이즈드 반실사** (Genshin/BotW 계열). 웹 PBR 안정성·언캐니 밸리 회피. 필요 시 Blender MCP로 재질/본 보정 |
| 월드 톤 | **자연 — 초원·작은 섬**. 지형 높낮이, 바위, 나무 몇 그루, HDRI 하늘 |
| Tripo 입력 | **레퍼런스 이미지 → image-to-model**. API 키 보유(사용자가 `.env`에 `TRIPO_API_KEY=` 직접 기입) |

---

## 1. 목표와 원칙

| 항목 | 내용 |
|---|---|
| 형태 | 브라우저 웹게임 (설치 없음, URL 하나) |
| 핵심 | 캐릭터 1명 + 조작감 + 카메라 + 작은 월드. 캐릭터가 게임의 90% |
| 진행 방식 | 천천히. 단계마다 합격 기준을 통과해야 다음으로 |
| 하지 않을 것 | 큰 맵, 다수 NPC, 스토리, 멀티플레이. (전투·인벤토리는 v0.8 에서 사용자 요청으로 최소형만 추가) |

### "아주 퀄리티 높은"의 정의 (합격 기준)

**캐릭터 외형**
1. Tripo H-series(`v3.1`)로 생성, `texture_quality: detailed` + PBR. 정지 화면이 Sketchfab 스태프픽 수준.
2. 피부·눈·머리카락·의상 재질이 웹에서 그럴듯함 (필요 시 Blender에서 재질 보정: 눈 스페큘러, 머리카락 알파, 의상 러프니스).
3. 폴리·텍스처 예산: 캐릭터 ≤ 60k tris, 텍스처 2K×2~3장(KTX2). 로딩 3초 내.

**모션 (프로젝트 이름이 3D_motion인 이유)**
4. idle / walk / run / jump / fall / land / turn 이 **끊김 없이 크로스페이드**됨. 발 미끄러짐(foot sliding)이 눈에 안 띔 — 애니메이션 속도를 이동 속도에 동기화.
5. 조작감: 가속·감속, 회전 보간, 점프 아크, 착지 반응, 방향 전환 시 몸의 기울임. "손에 붙는" 느낌.
6. 카메라: 스프링 암 3인칭, 벽 충돌 시 당겨짐, 마우스 감도·관성, 달릴 때 FOV 살짝 넓어짐. 진입 시 시네마틱 1컷.

**렌더**
7. HDRI 환경광 + 태양광, 캐릭터에 고해상 그림자(단일 고해상 섀도맵 → 필요 시 CSM), 접촉 그림자.
8. 후처리: ACES 톤매핑, 은은한 블룸, SSAO, SMAA/TAA, 색보정, 비네트.
9. 소리: 발소리(지면 재질별), 점프/착지, 환경음. 소리 없으면 어색해야 정상.
10. 성능: 데스크톱 60fps 고정.

**UI**
11. 거의 없음. 조작 힌트는 첫 10초만. 화면 밖 UI는 제목·설정·리셋.

레퍼런스: *Zelda BotW / Genshin* 의 3인칭 조작감과 카메라, *Sketchfab* 스태프픽 수준의 캐릭터 PBR, *Bruno Simon* 포트폴리오의 웹 3D 완성도.

---

## 2. Tripo 캐릭터 파이프라인

확인된 API (2026-08-18 기준, `https://openapi.tripo3d.ai/v3`, `Authorization: Bearer <key>`):

| 단계 | 엔드포인트 | 핵심 파라미터 | 크레딧(대략) |
|---|---|---|---|
| ① 생성 | `POST /generation/text-to-model` 또는 `/generation/image-to-model` | `model: v3.1-20260211`(H3.1, 고품질) 또는 `P1-20260311`(게임용 정리 토폴로지), `texture: true`, `pbr: true`, `texture_quality: detailed`, `face_limit` | 10~20 (+10 detailed) |
| ② 리그 점검 | `rig-check` | 생성 task_id | — |
| ③ 자동 리깅 | `POST /animations/rig` | `input: task_id`, `rig_type: biped`, `spec: mixamo`(호환성) 또는 `tripo`, `out_format: glb`, `model: v1.0-20240301`(휴머노이드, 프리셋 90+) | ~30 |
| ④ 애니메이션 | `POST /animations/retarget` | `input: rig task_id`, `animations: ["preset:idle","preset:walk","preset:run","preset:jump","preset:fall","preset:turn", ...]`, `animate_in_place: true`, `bake_animation: true`, `out_format: glb` | ~20/클립 |
| ⑤ 폴링 | `GET /tasks/{task_id}` | 2초 간격, 1 req/s 이하 | — |

**주의사항**
- 출력 URL은 **5분 만에 만료** → 폴링 완료 즉시 다운로드하는 스크립트 필수 (`scripts/tripo/`).
- `animate_in_place: true` 로 받아 **이동은 코드가 담당**(루트모션 미사용). 발 속도 동기화가 쉬워짐.
- 클립을 여러 GLB로 받으면 **Blender에서 하나의 GLB(NLA 트랙 = 클립)로 병합**해 로드 1회로 끝낸다.
- 캐릭터 1회 반복 비용 추정: 생성 30 + 리깅 30 + 애니 8클립 × 20 = **약 220 크레딧**. 컨셉 탐색은 텍스처 없이 저비용으로 여러 번 → 확정 후 detailed 1회.
- API 키는 사용자가 `.env`에 `TRIPO_API_KEY=` 로 직접 넣는다 (커밋 금지, `.gitignore`).
- 입력은 **레퍼런스 이미지 → image-to-model** 을 추천 (텍스트보다 일관성·의도 반영이 좋음). 정면 T-포즈에 가까운 전신 이미지 1장(가능하면 multiview 3장).

**Blender 후처리 (Blender MCP로 이 세션에서 수행)**
병합 → 재질 점검(눈/머리카락/피부) → 불필요 본 정리 → 스케일/방향 정규화(Y-up, 1 unit = 1 m, 정면 -Z) → glTF 익스포트(Draco) → `gltf-transform`으로 KTX2 압축.

---

## 3. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 렌더러 | **Three.js** (vanilla, TypeScript) | 생태계 최대. 객체 하나짜리 프로젝트라 프레임 루프를 직접 쥐는 편이 조작감 튜닝에 유리 |
| 빌드 | **Vite** + TS | 즉시 HMR, 정적 배포 |
| 후처리 | `postprocessing` (pmndrs) | N8AO, SMAA, Bloom, ToneMapping |
| 물리/충돌 | `@dimforge/rapier3d-compat` | 캐릭터 컨트롤러(KinematicCharacterController: 경사·계단·벽 슬라이딩 내장), 지형·소품 콜라이더 |
| 애니메이션 | Three `AnimationMixer` + 자체 상태머신/블렌드 유틸 | 크로스페이드·속도 동기화 직접 통제 |
| 카메라 | 자체 3인칭 스프링암 (OrbitControls 미사용) | 충돌·관성·FOV 연출 필요 |
| 에셋 | Tripo API + Blender(MCP) + `@gltf-transform/cli` | 위 파이프라인 |
| 환경맵 | Poly Haven HDRI (Blender MCP로 다운로드 가능) | CC0 |
| 사운드 | Web Audio API (Howler 선택) | 원샷 위주 |
| 튜닝 | Tweakpane (dev only) | 조작감·조명 실시간 튜닝 |
| 배포 | 정적 호스팅 (Vercel/GitHub Pages) | 서버 불필요 |

---

## 4. 단계별 로드맵

각 단계 끝에 **합격 판정**. 통과 전엔 다음으로 안 넘어간다.

### Phase 0 — 기획 확정 ← 지금
- 캐릭터 컨셉 결정(스타일·인물), 레퍼런스 이미지 준비, Tripo API 키 발급, `.env` 준비
- ✅ 합격: "이 캐릭터가 이 공간에서 이렇게 움직인다"가 이미지 3장 + 문장 3줄로 설명됨

### Phase 1 — 조작감 + 렌더 파이프라인 (캐릭터 없이) ← 구현 완료 (2026-08-18), 사용자 체감 판정 대기
- Vite+TS+Three 뼈대, 프로시저럴 Sky → PMREM 환경광, 태양 그림자(캐릭터 추적·텍셀 스냅), 후처리(N8AO·Bloom·ACES·Vignette·SMAA), Tweakpane(`H`)
- **캡슐 플레이스홀더**로 캐릭터 컨트롤러(Rapier KinematicCharacterController) + 3인칭 스프링암 카메라 — 가속·회전·점프(코요테/버퍼/점프컷)·착지 스쿼시·기울임·카메라 충돌·근접 페이드·속도 FOV
- 테스트 지형: 박스(0.25/0.5/1.2/2.0), 계단 8단, 경사 25/35/50°, 기둥, 벽, 좁은 통로
- 자동 검증 완료: 평지 5.5 m/s 안정, 25/35° 등판, 50° 차단, 계단 자동 등반, 1.2 박스 점프 성공/2.0 실패, 1 m 통로 통과, 벽 뒤 카메라 0.5 m 당김, 60~120 fps
- 실행: `npm run dev` → http://localhost:5173 (클릭=포인터락, 드래그=오빗, WASD/Shift/Space)
- 발견/결정: (1) 접지 중 하향 stick 속도를 주면 Rapier 오프셋과 충돌해 평지에서 랜덤 멈칫 → `groundStick=0` + snapToGround 로 해결. (2) Sky 셰이더는 HDR이라 exposure 0.55·envIntensity 0.45 가 기준점.
- ✅ 합격 기준: 캡슐만으로도 10분 동안 돌아다니는 게 재밌음. 60fps. → **사용자 플레이 후 판정**

### Phase 2 — Tripo 캐릭터 확보 ← 완료 (2026-08-18)
- [x] `scripts/tripo/` 자동화: `balance` / `generate`(업로드→image-to-model→다운로드) / `rig`(rig-check→rig) / `animate`(클립별 retarget, 병렬) — `npm run tripo:*`. 로그 `docs/tripo-log.jsonl`, 산출물 `assets/tripo/<name>/`(gitignore)
- [x] 생성: 탐색(20) → v3.1 PBR detailed, face_limit 60k(40) → rig tripo 스펙(25; mixamo 스펙은 프리셋 리타겟 불가라 재리깅) → 9클립 retarget(90). **총 200 크레딧**. 상세: `docs/character-spec.md`
- [x] `scripts/build-character.ts`(`npm run build:character`): 클립 GLB 9개의 애니메이션만 base 스켈레톤에 병합 + 2K WebP + meshopt → **`public/models/character.glb` 1.70 MB** (48 MB → 1.7 MB)
- [x] 웹 로더 `src/character/model.ts`: 신장 1.7 m 정규화, 정면 +X→+Z 보정, Hip 원점 클립 대비 발바닥 재보정, 크로스페이드 `play()`. `src/character/animator.ts`: idle/walk/run/jump/fall 상태머신 + 속도 동기화(Phase 3 선행)
- Blender 보정은 불필요했음(재질·스킨 웨이트 현 상태로 합격 수준). 필요 시 Phase 5 폴리시에서
- ✅ 합격: 정지 스크린샷 레퍼런스 대비 양호(케이플릿·오버스커트·벨트·부츠 재현), 로딩 1.7 MB → 즉시. **→ 사용자 확인 대기**

### Phase 3 — 모션 결합 ← 구현 완료 (2026-08-18), 사용자 체감 판정 대기
- [x] 상태머신(idle/walk/run/jump/fall/variation) + 크로스페이드 + 속도 동기화 (`animator.ts`), 캡슐 → 캐릭터 교체
- [x] 발 미끄러짐: 클립 고유속도 측정(발 접지 구간 후방 속도 중앙값) → walk 1.15 m/s, run 3.6 m/s. 이동 속도를 walk 1.6 / run 5.0 으로 조정해 재생 1.4× 로 통일
- [x] 발 접지 이벤트(발목 본 높이 임계 교차) → 발소리. idle 7~14 s 후 `look_around`/`standing_relax` 변주 후 복귀. 착지 스쿼시(스케일 스프링)
- [x] 프로시저럴 사운드 `src/audio/sfx.ts`(Web Audio 합성: 발소리/점프/착지, 외부 에셋 없음). 첫 클릭/키 입력 시 AudioContext 언락
- [x] 렌더 룩: 색보정(채도 +0.15, 대비 +0.08) 추가, 블룸 낮춤(하늘 뿌옇게 됨), 하늘 turbidity 3.0/rayleigh 1.6, 태양 40°/2.8
- [x] 테스트용 결정적 스텝 `__dbg.step(dt, render)` — rAF 스로틀 환경에서도 시뮬 검증 가능. 검증: walk 발소리 0.43 s L/R 교대, run 0.22 s, jump→fall→착지→run, 13 s idle 후 변주
- 미사용 클립: `turn`, `jump_down` (Phase 5 폴리시 후보: 급전환·낙차 연출)
- ✅ 합격: 발 미끄러짐이 눈에 안 띄고, 전환에 끊김이 없음 → **사용자 플레이 후 판정**

### Phase 4 — 미니 월드 ← 구현 완료 (2026-08-18), 사용자 체감 판정 대기
- [x] 섬 지형 `world/terrain.ts`: Simplex fBm 하이트맵(180 m, 1 m 격자) + 원형 폴오프(가장자리 수면 아래) + 중앙 완만한 스폰 지대. 정점색(풀 톤/경사 흙/해변 모래) × Poly Haven CC0 `aerial_grass_rock` 2K(diff/normal/arm), 두 스케일 블렌드로 안티타일링. **Rapier heightfield** 콜라이더(메시와 일치 검증)
- [x] 물 `world/water.ts`: 프로시저럴 노멀맵 스크롤 + PBR 반사, 익사 시 리스폰. 거리 안개(하늘 톤)
- [x] 인스턴스 풀잎 `world/grass.ts`: 13.5만 다발, 정점 셰이더 바람 흔들림, 밀도 노이즈
- [x] 소품 `world/props.ts` + `propDefs.ts`: Tripo text-to-model(참나무·자작나무·이끼바위·각진바위·덤불, 각 20크레딧, `scripts/build-props.ts`로 WebP 1K + meshopt ≈ 350 KB/개) → InstancedMesh 스캐터(경사·수면·간격·스폰 반경 제약) + 콜라이더(나무 트렁크 원기둥, 바위 구). 밀 수 있는 다이내믹 바위 3개(스폰 근처)
- [x] 바람 앰비언스(프로시저럴), 그림자 4096/반경 30 m
- [x] 소품 5종 배치 완료(참나무 34·자작 26·이끼바위 22·돌무더기 16·덤불 40 + 밀기 바위 3). Tripo 크레딧 100 사용(잔여 1620)
- [x] **캐릭터가 하얗게 날아가던 문제** 원인: 하늘 PMREM 환경광에 태양 원반이 함께 구워져 제2의 태양처럼 작용 + Sky 셰이더 절대 밝기가 큼. 해결: 베이크용 하늘에서 sundisc 항 제거, envIntensity 0.12 로 낮추고 HemisphereLight(0.55)로 그림자 채움. 이제 크림/청록/살구색이 레퍼런스대로 보임
- `?scene=playground` 로 Phase 1 테스트 지형 유지
- ✅ 합격: 처음 보는 사람이 5분 동안 그냥 돌아다님 → **사용자 판정**

### Phase 5 — 폴리시·배포 ← 구현 완료 (2026-08-18)
- [x] 로딩 화면(DefaultLoadingManager 진행률 38개 에셋) → "클릭해서 시작" → 시네마틱 진입 카메라(3.4 s 반 바퀴 하강) → 조작 힌트 14 s 후 자동 숨김
- [x] 품질 프리셋 `core/quality.ts`: `?quality=low|medium|high` > localStorage > 자동 감지(터치/코어수/GPU 문자열). 픽셀비·그림자맵·풀 개수·AO·소품 개수 조절. `H` 패널 최상단 quality 셀렉터(변경 시 리로드)
- [x] 터치 컨트롤 `core/touch.ts`: 왼쪽 가상 조이스틱, 오른쪽 시점 드래그, 점프/걷기 버튼 (pointer: coarse 기기에서만 표시)
- [x] 단축키 R(리셋) M(음소거) F(전체화면) H(설정). 통계·튜닝 패널은 dev 또는 `?debug` 에서만
- [x] 발소리 표면 변주: 풀/모래(수면+1.1 m 이내)/물(수면+0.12 m 이내)
- [x] 빌드 최적화: 미사용 Draco/KTX2 디코더 제거(-1.9 MB), 지형 텍스처 JPEG 7.4 MB → WebP 3.2 MB, 소스맵 off. `npm run build` → `dist/` 11 MB(JS 4.0 MB/gz 1.47 MB — Rapier wasm 인라인 포함, 모델 3.5 MB, 텍스처 3.9 MB). `vite preview` 로 프로덕션 동작 확인(로드 ~1 s 로컬, 콘솔 에러 0)
- [ ] 배포: 정적 호스팅(Vercel `vercel deploy dist` / Netlify drop / GitHub Pages). 저장소·계정 선택 필요 → 사용자 결정
- [x] 피드백 반영(2026-08-18): (1) 캐릭터가 여전히 창백 → Tripo 알베도를 로드 시 캔버스로 색보정(채도 1.35·대비 1.12·밝기 0.95·따뜻함 +0.035, `Character` 패널에서 실시간 조정) (2) 고개 숙임(달릴 때 심함) → run 클립이 상체를 크게 숙이는 자세라 매 프레임 애니메이션 위에 **척추(Spine01/02)·목·머리 본 피치 보정**을 상태별로 덧씌움(idle 0.16 / walk 0.22 / run 머리 0.5+척추 0.32 rad). 정면·측면 스크린샷으로 확인
- [x] 렉 피드백(2026-08-18): 측정 결과 SSAO(N8AO) 가 프레임의 ~40%, 레티나 dpr 2 와 곱해져 큰 창에서 GPU 병목. 프리셋 재조정(high = dpr 1.5·AO Low 절반해상도·3072 그림자·풀 10만, medium = AO 없음·dpr 1.25, 기존 최고 설정은 ultra 로 분리) + **적응형 품질**: 시작 후 3 s 창 평균 프레임 24 ms 초과 시 리로드 없이 한 단계씩 하향(픽셀비·AO·그림자맵·풀 예산 즉시 적용, 토스트 안내, localStorage 저장, `?quality=` 고정 시 비활성). 풀은 8×8 청크 InstancedMesh 로 나눠 프러스텀 컬링
- [x] "동작이 어색하다" 피드백(2026-08-18): 절차적 모션의 한계 인정 → **Mixamo 모션캡처 도입**. 우리 캐릭터 업로드는 Mixamo 자동리거가 계속 실패(방향·스케일 보정해도) → **업로드 없이** 기본 캐릭터로 받은 FBX 를 우리 리그로 리타게팅하는 파이프라인 구축
  - `scripts/mixamo/retarget.py` (Blender 헤드리스): 발/발가락 본으로 두 리그 정면 자동 정렬 → 본별 "월드 회전의 rest 대비 델타"를 타깃 rest 에 적용(A포즈/T포즈 차이 흡수) → 파일명이 클립 이름. Mixamo↔Tripo 본 이름 매핑 내장(`BONE_MAP`)
  - 삽질 기록: Blender 5.1 은 액션 슬롯이 필요(액션 직접 생성하면 키가 안 들어감) / 본 행렬을 그대로 쓰면 rest 스케일이 basis 에 섞여 캐릭터가 터짐 → 쿼터니언 회전만 사용. three.js 저장소의 실제 Mixamo FBX(삼바 547프레임)로 검증
  - 적용: "One Hand Sword Combo"(5.6 s, 3연타) → `sword_combo` 클립으로 합류(캐릭터 GLB 1.83 MB)
  - 전투: `weapon.style: 'clip-combo'` — 한 클립의 구간 3개를 1·2·3타로 사용(0.62~1.72 / 1.72~2.62 / 2.62~4.30 s). 같은 클립이라 연타 시 끊김 없이 이어짐. 판정은 손 속도·칼날 거리 실측 후 **전방 히트박스**(반경 1.35 m, ±70°)로 결정 — 클립마다 칼날 궤적이 제각각이라 신뢰도가 낮았음. 데미지 25/30/40, 재생 1.25×
  - 검증: 3연타 95 데미지(clip 1.14/2.34/3.62 s 적중), 단타 시 1타만 후 복귀, 거리 1.67→1.32 m 로 좁혀짐
  - **버그 2건 수정**(사용자 "모션 이상, 공격하면 하늘로 올라감"): (1) 리타게팅 클립을 glTF 로 내보낼 때 모든 본의 위치/스케일이 함께 베이크됨 → Tripo 클립은 `Hip.position ≈ 0` 규약인데 리타겟 클립은 rest 값 0.557 을 써서 캐릭터가 0.95 m 부양(발이 공중). `build-character.ts --rot-only` 로 회전 외 채널 제거 + Hip 위치 0 고정 → 엉덩이 0.94 m·발 지면 접촉 확인. (2) Tripo `slash` 용으로 넣었던 머리·척추 피치 보정이 모캡 자세를 왜곡 → 공격 중에는 보정 0
- 미사용 클립 `turn`/`jump_down` 은 보류
- ✅ 합격: 링크 하나 보내면 끝 → **배포 후 판정**

---

### Phase 6 — 검·허수아비·인벤토리 ← 구현 완료 (2026-08-18, 사용자 요청으로 스코프 확장)
- [x] 에셋(Tripo, 60크레딧): `preset:biped:slash` 리타겟(10) → `build:character` 로 병합(1.76 MB), 검 text-to-model(20, 2.9k tris → `public/models/items/sword.glb` 128 KB), 허수아비(20, 3.9k tris → `props/dummy.glb`)
- [x] 아이템/인벤토리 `src/items/`: `items.ts`(정의: grip/sheath 오프셋·공격 데이터), `inventory.ts`(12칸 + 주무기, localStorage), `inventoryUI.ts`(**Tab**, 클릭 장착/해제, 드래그 교환, 툴팁; 열리면 포인터락 해제·입력 차단)
- [x] 장착 `character/equipment.ts`: 검 GLB 를 PCA 로 칼날 축 정렬(Tripo 는 대각선으로 생성) + 정점수 휴리스틱으로 자루 방향 판정 → `R_Hand` 마운트(자루가 주먹 안, 칼날은 손가락 방향) / 8 s 미사용 시 `Spine02` 칼집(왼쪽 엉덩이)로 이동. `H` 패널 Weapon 폴더로 오프셋 튜닝
- [x] 공격 `character/combat.ts`: 좌클릭/J. 정지 시 전신 원샷, 이동 중엔 **상체 전용 두 번째 AnimationMixer** 로 slash 서브클립(척추·팔·머리 트랙만)을 이동 애니 위에 덮어씀(감속 0.45×). Tripo slash 는 6.6 s 짜리라 1.15 s 부터 1.6× 로 1.0 s 만 사용, 활성 구간 0.48~0.74 s 에 칼날 3점 구체 판정, 스윙당 대상 1회. 히트스톱 60 ms + 카메라 흔들림 + 데미지 팝업(HTML 투영) + 프로시저럴 휘두름/타격/장착음
- [x] 허수아비 `world/dummies.ts`: HP 100(4타), 피격 스프링 흔들림·발광 플래시, 0 이면 밀린 방향으로 쓰러졌다 4.5 s 후 리스폰. 스폰 앞 3개, 원기둥 콜라이더
- [x] 월드 픽업: 스폰 옆 (3, 3)에 검이 꽂혀 있음 → 2.2 m 이내 `E` 프롬프트 → 획득·자동 장착(이미 가지고 있으면 스폰 안 함). 터치 UI 에 공격/인벤토리 버튼
- [x] 버그 픽스: meshopt 압축 GLB 는 정점이 정규화 Int16 이라 translate/scale 시 값이 잘림 → `core/geom.ts toFloatGeometry()` 로 Float32 변환 후 변환(소품·허수아비·무기 로더 공통)
- 검증: 정지 베기 → 0.58 s 에 히트(100→75), 이동 중 베기 → walk 위에 상체 레이어, 인벤토리 장착/해제/저장, 픽업 프롬프트
- [x] 공격 모션 피드백(2026-08-18): Tripo `slash` 는 두 손 머리 위 내려찍기(도끼질)라 어색 + 되감을 때 칼이 몸 관통. 대안 프리셋 5종(box_01~03·chop·golf, 50크레딧) 리타겟해 포즈 시트로 비교 → 전부 검과 부적합(권투 가드/도끼질). → **절차적 한손 수평 베기** `character/proceduralAttack.ts` 로 교체: 캐릭터 축 기준으로 척추 비틀기(−28°→+28°)·오른팔 옆으로 78° 들어 뒤로 코킹(−50°)·수평 스윕(+125°)·전완 코킹·손목·왼팔 균형·머리 정면 유지를 믹서 뒤 `postPose` 훅으로 얹음. 0.16 windup / 0.16 swing / 0.32 recover = 0.67 s, 정지·이동 공통(전신 클립 불필요). `H` 패널 Attack 폴더로 각도·타이밍 튜닝. 판정 0.19~0.36 s, 정지 시 0.30 s 히트 확인. 클립 방식은 `weapon.style:'clip'` 으로 남김
- [x] 피드백 "팔만 말고 전신 + 3타 콤보"(2026-08-18): `ProceduralAttack` + `COMBO[3]` 프리셋 — **1타** 수평 베기(오른→왼, 왼발 런지) → **2타** 백핸드(왼→오른, 오른발 런지) → **3타** 두 손 머리 위 내려찍기 피니셔(크게 내딛고 상체 30° 숙임). 각 타에 골반 비틀기·런지 다리·앞다리 무릎·양팔·머리 정면 유지 + 시작 시 전진 임펄스(2.6/2.6/4.2 m/s). 데미지 ×1.0/1.2/1.6(25/30/40), 히트스톱·카메라 흔들림·타격음 피치 타수별 증가. 연결: 진행 중 입력은 예약되어 스윙 끝나면 즉시 다음 타, 타 종료 후 0.45 s 안에 입력하면 이어짐, 3타 후 리셋. 검증: 25→30→40 히트, 창 지나면 1타로 복귀. `H` 패널 Attack: speed/amplitude/comboWindow/stepImpulse
- ✅ 합격: 검 줍고 → Tab 확인 → 허수아비 4타에 쓰러뜨리기 → **사용자 판정**

## 5. 프로젝트 구조 (예정)

```
3D_motion/
├─ PLAN.md
├─ .env                     ← TRIPO_API_KEY (gitignore)
├─ docs/
│  ├─ references/           ← 캐릭터/월드 레퍼런스 이미지
│  └─ character-spec.md     ← 캐릭터 컨셉·프롬프트·Tripo task_id 기록
├─ scripts/tripo/           ← generate.ts / rig.ts / retarget.ts / download.ts (Node)
├─ blender/                 ← .blend, 병합/익스포트 스크립트
├─ public/
│  ├─ models/               ← character.glb (압축), world.glb
│  ├─ hdri/  ├─ sfx/
└─ src/
   ├─ core/                 ← renderer, postfx, loop, assets
   ├─ character/            ← controller, animation state machine, foot audio
   ├─ camera/               ← third-person spring arm
   ├─ world/                ← terrain, colliders, props
   └─ main.ts
```

---

## 6. 결정 사항 체크 (Phase 0 종료 조건)

- [x] **캐릭터 스타일**: 스타일라이즈드 반실사
- [x] **월드 톤**: 자연 — 초원·작은 섬
- [x] **Tripo 입력 방식**: 레퍼런스 이미지 → image-to-model
- [x] **Tripo API 키**: 보유 → 사용자가 `.env`에 기입
- [x] **스택**: 3절 추천안 그대로
- [x] **캐릭터 인물 설정**: 젊은 여성 여행자 — 흑발 밥컷, 크림 후드 케이플릿, 청록 이너/오버스커트, 가죽 벨트·파우치·부츠. 상세: `docs/character-spec.md`
- [x] **레퍼런스 이미지**: `docs/references/character-{sheet,front,three-quarter,back}.png` (사용자 제공 3뷰 시트, A-포즈)
- [x] **`.env`에 `TRIPO_API_KEY`** 기입 완료 (2026-08-18)

**→ Phase 0 종료. 다음: Phase 1 착수** — Vite+TS+Three 뼈대 → HDRI/후처리 → 캡슐 컨트롤러(Rapier) + 3인칭 카메라 조작감

---

## 변경 이력
- v0.3 (2026-08-18) 캐릭터 인물 확정(여행자, 3뷰 레퍼런스 확보), API 키 설정, Phase 0 종료
- v0.2 (2026-08-18) 컨셉을 "오픈월드 스타일 3인칭 캐릭터"로 확정, Tripo API 파이프라인 반영, 로드맵 재구성
- v0.1 (2026-08-18) 초안 (퍼즐 박스 등 4개 후보)
