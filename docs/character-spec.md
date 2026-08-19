# 캐릭터 스펙 — "여행자" (가칭)

작성일: 2026-08-18 · 상태: 레퍼런스 확보 완료, Tripo 생성 대기

## 레퍼런스
| 파일 | 내용 |
|---|---|
| `references/character-sheet.png` | 원본 3뷰 시트 (1024×1024, Higgsfield 생성) |
| `references/character-front.png` | 정면 A-포즈 (900×900, Tripo 1차 입력용) |
| `references/character-three-quarter.png` | 3/4 뷰 (재질·실루엣 참고용, Tripo 사이드뷰로는 부적합) |
| `references/character-back.png` | 뒷모습 (Tripo multiview back 후보) |

## 외형 명세 (이미지에서 추출)
- **인물**: 젊은 여성 여행자. 담담한 표정, 검은 눈.
- **머리**: 흑발 턱선 길이 밥컷, 앞머리 일자. 왼쪽 관자놀이에 가는 땋은 머리 + 끈/리본 장식.
- **상의**: 크림/베이지 **후드 케이플릿**(어깨 망토). 앞 금속 클래스프, 밑단 갈색 트림 + 잎사귀 문양, 뒷 후드에 다이아 장식·태슬.
- **이너**: 짙은 청록(teal) 하이넥. 크림색 볼륨 슬리브 + 갈색 가죽 커프.
- **하의**: 크림색 튜닉 스커트(잎 문양) 위에 **비대칭 청록 오버스커트**(금색 기하 문양, 태슬).
- **장비**: 갈색 가죽 벨트 + 허리 파우치, 어깨 크로스 스트랩, 늘어진 태슬.
- **신발**: 크림 니삭스 + 갈색 가죽 부츠(끈 장식, 낮은 굽).
- **팔레트(3색 원칙 준수)**: 크림 `#E8DFC9` · 짙은 청록 `#2F5C5A` · 다크브라운 가죽 `#5A3E2B` (+ 흑발, 금색 문양 액센트)
- **포즈**: A-포즈 → Tripo 자동 리깅에 적합

## Tripo 생성 계획 (Phase 2에서 실행)
1. **저비용 탐색**: `image-to-model` (front 1장, `texture: false`) 로 형태 확인 ×1~2회
2. **확정 생성**: `model: v3.1-20260211`, `texture: true`, `pbr: true`, `texture_quality: detailed`, `face_limit` 미지정(후에 리토폴로지/P-series로 최적화 검토)
   - multiview(front + back)가 뒷 후드/태슬 재현에 유리하면 사용, 아니면 front 단일
3. `rig-check` → `/animations/rig` (`rig_type: biped`, `spec: mixamo`, `glb`)
4. `/animations/retarget` (`animations: [idle, walk, run, jump, fall, turn]`, `animate_in_place: true`)

## 예상 리스크
- **스커트/케이플릿 vs 다리·팔 클리핑**: 자동 리깅은 천 본을 만들지 않음. 짧은 스커트라 걷기/달리기는 괜찮을 가능성 높으나 점프·낙하에서 확인 필요 → Blender에서 스킨 웨이트 보정 또는 허용
- **머리카락·태슬**: 정적 메시로 나옴. 필요 시 Blender에서 태슬에 본 추가(선택)
- **눈/피부 재질**: Tripo PBR이 평면적이면 Blender MCP로 눈 스페큘러·피부 러프니스 보정
- **뒷면 디테일**: 단일 이미지 입력 시 후드 태슬·뒷 문양이 뭉개질 수 있음 → back 이미지 multiview로 보강

## 기록 (2026-08-18, 총 200 크레딧 · 잔여 1700)
| 단계 | name | task_id | 크레딧 | 비고 |
|---|---|---|---|---|
| image_to_model (탐색, texture off) | explore1 | 2f343987-9492-4a85-b3de-e30b58ba263c | 20 | 1.43M tris — 형태 확인용 |
| image_to_model (v3.1, PBR detailed, face_limit 60000) | final | d3b25518-dcd3-465f-8f0d-2663339385a7 | 40 | 59.8k tris, Color/ORM/Normal 4K JPEG |
| rig (spec **mixamo**) | final | db109ee4-e133-42f8-8852-8c405769f1cd | 25 | ✗ 프리셋 리타겟 불가 ("mixamo 스켈레톤 리타겟 미지원") |
| rig (spec **tripo**) | final-tripo | d85c34be-c88f-40cc-8520-39b9e6f3efbb | 25 | 41본. 이걸 사용 |
| retarget ×9 (idle/walk/run/jump/fall/turn/jump_down/look_around/standing_relax, in-place) | final-tripo | 24937b77…, 2292029a…, 97ae7413…, 46dcab65…, 663bb64e…, 6d750f85…, b36e2e8b…, 7ab6055e…, 29ad606c… | 10 each | 각 4.5~5 MB GLB(지오메트리 중복 포함) |

전체 목록: `docs/tripo-log.jsonl`

## 웹 에셋 빌드
`npm run build:character` → `public/models/character.glb` (**1.70 MB**): 리깅 메시 + 애니 9클립 병합, 텍스처 2K WebP q85, 애니 리샘플, meshopt.
로더 보정: 정면 +X → `yawOffset -π/2`; 클립이 Hip 원점 기준이라 idle 첫 프레임 스킨 바운딩박스로 발바닥 재보정(`calibrateOffset`).

## 배운 것
- **Tripo 프리셋 애니메이션은 `spec: tripo` 리그에만** 적용된다. mixamo 스펙으로 리깅하면 retarget 이 error 1004 로 실패(크레딧은 환불).
- API 키는 `tsk_` 로 시작. 콘솔에 보이는 `tcli_…` 는 고객 ID(스토리지 키 접두사)이지 API 키가 아님.
- retarget 은 클립당 10 크레딧, 동시 실행 가능(3개 병렬로 8클립 약 1분).
