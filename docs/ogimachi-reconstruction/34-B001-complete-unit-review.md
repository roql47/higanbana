# B001 외관·지형 통합 검토

2026-09-12. 요청: 단조로운 소규모 변경을 반복하지 않고 밀도와 완성도를 높인다.

## 범위와 참조

백수원(白水園), OSM 236248693 한 채를 대상으로 기존 Blender 저작 모델을 보강했다. 전체 건물을 새로 만들었다고 세지 않는다. 기존 지붕 형상, 창호, 노렌, 벤치와 재질을 재사용했다.

[NAVITIME 외관 사진](https://japantravel.navitime.com/zh-tw/area/jp/spot/02301-4100048/)의 두 번째 확대 사진을 직접 보고 두꺼운 초가 처마, 짙은 목구조, 격자창과 불투명 창, 보라색 세 폭 노렌, 깊은 출입구, 기단을 비교했다. 촬영 날짜와 실제 치수는 확인하지 못했다. 사진을 텍스처로 다운로드하지 않았다. 원본 영상과 전체 마을의 동일성 검증을 대신하는 작업은 아니다.

## 구현

- Blender MCP로 재생성·렌더·GLB 내보내기를 실행했다.
- 처마 아래 서까래, 잘린 볏짚 끝, 불규칙한 기단 돌을 추가했다.
- 처마 측면에 별도 재질을 지정해 기존 표면 텍스처가 길게 늘어지는 문제를 줄였다.
- 목재 주요 모서리를 작게 둥글려 빛을 받도록 했다.
- 출입구 벽체를 실제로 파고 안쪽 어두운 면을 배치했다. 플레이 가능한 실내는 아니다.
- Phase 2 장면에서 해당 임시 건물 한 채를 교체했다. 건물 바닥 주변을 평탄화하고 2m 범위에서 기존 지형으로 연결했다. 앞마당은 추정 흙면이다.

## 검토와 수정 반복

Blender 근접·구역 전경 렌더와 Three.js 웹의 출입구 확대를 확인했다. 첫 결과에서 처마 텍스처 늘어짐, 뾰족한 볏짚 표현, 평평하게 막힌 입구를 발견하여 수정 후 다시 내보냈다. 최종 웹에서도 깊어진 입구와 재질 로딩을 확인했다.

최종 모델은 삼각형 27,770개, 메시 14개, 재질 14개, 텍스처 6개다. 웹용 변환은 중복 제거 및 최대 1024px WebP 압축을 적용했다. 파일 크기 9,698,960 → 3,332,992바이트. 변환 결과를 다시 읽어 메시와 텍스처 존재를 확인했다. 이 수치는 전송·저장 크기이며 RAM·VRAM 절감이나 목표 하드웨어 성능 측정값이 아니다.

## 산출물

- `assets/authored/ogimachi/phase3-hakusuien.blend`: 개별 건물
- `assets/authored/ogimachi/phase3-village-context.blend`: Phase 2 지형 통합 장면
- `artifacts/ogimachi-phases/phase3-house-close.png`: 단독 근접 렌더
- `artifacts/ogimachi-phases/phase3-house-in-village.png`: 지형 위 근접 렌더
- `artifacts/ogimachi-phases/phase3-village-overview.png`: 주변 배치 렌더
- `artifacts/ogimachi-phases/phase3-hakusuien-web.glb`: 웹 검토 모델
- `phase3-house.html`: 정면·사선·출입구 검토 화면
- `scripts/blender/build-phase3-hakusuien.py`, `assemble-phase3-hakusuien.py`: 재생성
- `scripts/qa/optimize-phase3-house.mjs`: 웹 변환

## 미완료 및 다음 기준

처마 끝이 여전히 균일한 띠와 작은 블록처럼 보이고, 목재의 세로 무늬 반복과 석재 표현도 근접 거리에서 인공적이다. 다음 시각 보정은 이 부분의 표면 방향·크기·명암과 불규칙한 실루엣을 우선한다. 간판 글자, 뒷면·박공·실내는 확인 자료가 부족하다. 원본과 동일한 건물이라고 판정하지 않는다.

주변 흰 건물들은 여전히 임시 볼륨이다. 지형은 검토용 고밀도 메시이며 게임용 최적화가 끝나지 않았다. 실제 게임 맵 교체, 충돌·이동 검증, Steam 패키징 반영은 이번 범위에서 수행하지 않았다.
