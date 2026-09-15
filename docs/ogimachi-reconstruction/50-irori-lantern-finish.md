# 이로리 정문 석등 마감

기존 석등 9개 부품의 위치와 전체 형태를 유지하면서 8mm, 3분할 모서리 마감과 화강암 표면을 적용했다. 돌 입자색, 거칠기, 3mm 범위의 범프를 사용한다. 새 원본 사진 정합이나 실측 복원을 뜻하지 않는다.

- 변경 전 체크포인트: `assets/authored/ogimachi/irori-before-lantern-v6.blend`
- 편집본: `assets/authored/ogimachi/irori-lantern-v6.blend`
- 재생성: `scripts/blender/refine-irori-lantern-v6.py`
- 시험 렌더: `artifacts/ogimachi-phases/lantern-v6/render.png`
- 게임 변환: `scripts/blender/export-irori-runtime-v6.py`, `scripts/qa/optimize-irori-runtime-v6.mjs`

Blender 시험 렌더를 직접 확인했다. 건물 전체 재현 완료, 실내 제작, 액트 연결은 이번 작업 범위가 아니다.

게임용 GLB는 17,142,916 bytes, 메시 6개, 텍스처 12개다. SurveyWorld가 v6 식당을 로드하도록 연결했다. 배포용 파일 복사 목록에서 누락된 식당·매점 모델도 추가했다. 타입 검사와 빌드, 배포 폴더의 식당 GLB 존재 확인을 통과했다.
