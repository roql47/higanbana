# 이로리 실내 모서리 침범 수정

사용자 화면의 갈색 돌출 면을 조사했다. 외관용 V3 deep window backing 4개가 로컬 X=-3.65까지, window recess cheek 8개가 X=-4.33~-3.67까지 들어와 있었다. 실내 앞쪽 마감선 X=-4.32보다 약 0.65m 돌출된 상태였다.

Blender MCP로 이 12개 객체의 깊이만 외벽 범위 X=-4.38~-4.31로 축소했다. 원본 체크포인트와 irori-interior-v8.blend를 저장했다. 기존 런타임 UV/텍스처를 보존하며 소스의 평가된 꼭짓점 좌표를 대조해 GLB body 정점 4608개를 이동했다. 다른 가구와 출입문, 지형은 변경하지 않았다. 기존 AO는 재사용하므로 이전 판 주변의 작은 음영 차이는 남을 수 있다.

재현: scripts/qa/fix-irori-window-v8.mjs와 artifacts/ogimachi-phases/irori-window-v8-remap.json. 게임/정적 빌드는 irori-restaurant-interior-v8.glb를 사용한다.

검증: 실제 GLB 창문 뒤판의 실내 돌출 회귀 검사와 Rapier 출입 검사 통과. 타입 검사 및 오기마치 빌드 통과(기존 JS 청크 크기 안내 유지).
