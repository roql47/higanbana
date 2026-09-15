# 이로리 내부 v7 — 벽 테이블과 수납장

2026-09-13. 기존 실내를 기준으로 제작한 게임용 해석이며, 실존 실내의 정확한 복원으로 주장하지 않는다.

## 제작
- Blender MCP로 현재 편집 장면의 이로리 루트를 유지한 채 제작. 변경 전 별도 체크포인트 저장.
- 수납장: 네 칸 상단 서랍, 아래 프레임 문과 안쪽 패널, 실제 틈, 돌출된 철제 손잡이와 고정판, 모서리 기둥, 하부 받침, 세 장의 상판.
- 벽 쪽 리셉션 테이블: 네 장 상판, 앞판 세로 목재, 상하 틀, 장부 핀, 하부 가로대.
- 그릇 선반: 앞쪽 모서리와 받침 보강.
- 목재의 길이 방향 UV, 색상·거칠기·노멀 베이크. 기존 UV 패킹 수정 유지.
- 바닥·수납장·기존 가구·다다미·방석·목구조에 거리 0.38 m 접촉 AO를 베이크. 런타임 occlusion 강도 0.7. 실시간 그림자 광원 추가 없음.

## 산출물
- 편집 원본: assets/authored/ogimachi/irori-interior-v7.blend
- 모델링: scripts/blender/refine-irori-cabinet-v7.py
- 내보내기: scripts/blender/export-irori-interior-v7-runtime.py
- 최적화/메타데이터 검사: scripts/qa/optimize-irori-interior-v7.mjs
- 런타임: public/models/ogimachi/irori-restaurant-interior-v7.glb
- 렌더: artifacts/ogimachi-phases/irori-interior-v7.png 및 irori-cabinet-v7.png
- SurveyWorld 로드 경로와 정적 빌드 에셋 목록을 v7로 갱신.

## 검증
- Blender 실내 전체 및 수납장 근접 렌더 확인.
- 브라우저 실제 걷기 화면에서 v7 서랍장과 실내 텍스처 표시 확인.
- 게임용 GLB 약 36 MiB. 성능 수치는 별도 비교 측정하지 않음.
- 타입 검사 및 오기마치 빌드 통과. 기존 큰 JS 청크 안내 유지.
- 실제 v7 GLB를 사용하는 Rapier 출입 회귀 검사 통과: 닫힌 문 차단, 열림, 진입, 닫힘 보호, 출구.
- 충돌 프록시 20개, 광원 앵커 4개, 이동 문/유리 4개 유지. AO 재질 6개 확인.
- UV 검사의 검은 삼각형 중심 비율: 기존 가구 6.80%, 목구조 0.30%. 이는 작은 검정 금속 등도 포함하는 진단이며 무결점 판정이 아니다.

## 범위
서랍과 수납장 문은 고정 모델이다. 여닫는 애니메이션/상호작용은 아직 없다. 기존 미닫이 출입문 동작은 유지했다. 실내 전체의 Steam 성능 검증 또는 모든 액트 상호작용 완료를 의미하지 않는다.
