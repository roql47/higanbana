# 페이즈 2 노면 초안

Blender MCP에서 북쪽 논 주변 7개 도로에 폭이 있는 노면과 양쪽 0.4m 길어깨를 생성했다. 저장된 도로 폭이 있으면 사용하고, 없으면 보행로 1.5m/기타 3.4m 가안이다. 노면은 세로 약 0.75m 간격으로 나누고 지형에 투영했다. 흙색은 검토용 재질이며 원본 포장 재질 복원은 아니다.

현재 9개 논의 경계와 도로 중심선 간 거리에 도로 반폭, 길어깨 0.4m, 논둑 반폭 0.35m를 제외한 여유를 계산했다. 최소값은 photo-north-0과 540155249 사이 0.982m. 이전 교차 없음 검사가 전제이며 접합부, 횡단면 전체, 실측 도로 폭의 검증은 아니다. 길을 실제 주행할 수 있도록 충돌을 적용한 상태도 아니다.

Blender 생성/저장/렌더 성공. 렌더에서 길이 논 옆을 따라 이어지는 것을 확인했다. 7번 논 보류와 임시 건물은 유지. 게임 맵과 Steam 패키지는 변경하지 않았다.

산출물:
- scripts/blender/add-ogimachi-phase2-roads.py
- scripts/gis/check-phase2-road-clearance.py
- artifacts/ogimachi-phases/road-mesh-inventory.json
- artifacts/ogimachi-phases/road-bank-clearance.json
- assets/authored/ogimachi/phase2-paddies.blend
- artifacts/ogimachi-phases/phase2-paddies.png

다음은 첫 가옥의 지붕/외벽을 원본 기준 사진에 맞춰 제작하는 단계다. 이번 도로 초안으로 페이즈 2 전체나 원본 일치 완료를 선언하지 않는다.
