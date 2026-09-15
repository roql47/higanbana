# 신사 Blender 1차 형태

검토 화면: `/ogimachi.html?view=detail&layout=1&site=shrine`

- Blender에서 별도 장면을 만들어 본전·기단·기둥·박공지붕·문살·계단·도리이·석등·공물 받침대 7개를 제작했다.
- 기존 목재/지붕 색상 텍스처를 재사용. 세부 풍화, 지붕 끝 곡선, 장식, 실내·지하·문 상호작용은 미완료.
- 출력: `public/models/ogimachi/story-shrine.glb` (585,552 bytes, 재질별 5개 메시 그룹).
- 원본: `assets/authored/ogimachi/Story-shrine.blend`.
- 기존 Blender 활성 장면은 복원했으며 기존 마을 모델은 삭제하지 않았다.
- layout=1 검토 화면에서만 겹치는 기존 건물 660927473, 660927475, 1465225103을 로딩 제외한다. 실제 story/play 및 원본 데이터는 유지한다.
- 신사는 기존 배치 중심 (-90,-260)에 배치. 주변 평탄화와 실제 플레이 충돌은 별도 작업이다.

검증: Blender 내보내기 성공, TypeScript 검사 및 Ogimachi 빌드 통과.
