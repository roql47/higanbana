# B004 시라카와고노유 · 마을 레퍼런스 제작 재개

2026-09-13. 사용자 정정: ‘다음 건물’은 폐교/사당 등 스토리 장소가 아니라 실제 오기마치 마을 레퍼런스의 건물이다. 앞으로 이 요청에서 스토리 장소 순서를 자동으로 이어가지 않는다.

## 대상과 이번 변경

B003 전승관 다음 대장 항목 B004, 필지 236248626. 대장에는 queued였지만 기존 온천 모델과 출입 구현이 이미 있었다. 이를 기반으로 입구를 보강했다.

- 편집본 `assets/authored/ogimachi/B004-onsen-v2.blend`
- 게임 파일 `public/models/ogimachi/onsen-v2.glb`
- 재현 스크립트 `scripts/blender/refine-onsen-entry-v2.py`
- 확인 렌더 `artifacts/ogimachi-phases/onsen-v2/entry.png`
- 게임 로더 `src/world/ogimachi/onsenAsset.ts`, 배포 목록 `vite.ogimachi.config.ts`

밝은 입구 문틀·상부 보·좌우 고정 격자를 추가하고, 세 폭 노렌 가운데 하단을 0.52m 올렸다. 기존 외벽의 큰 면에 가로 판재 방향 UV를 적용했다. 원래 `onsen.glb`와 `.blend`는 보존한다. 기존 GIS 위치, 지붕 외곽 15.135×54.613m, 출입구 중심 로컬 (-6.55,14), 미닫이문 사용자 속성을 유지했다. 추가 구조는 한 메시로 합쳤다.

## 레퍼런스와 한계

- [시라카와촌 공식 소개](https://www.vill.shirakawa.lg.jp/1175.htm)
- [직접 관찰한 입구 사진](https://www.vill.shirakawa.lg.jp/secure/1171/kiji_shirakawagonoyu01.jpg)
- [시설 공식 사이트](https://www.shirakawagou-onsen.jp/)

사진에서 밝은 목재 입구, 측면 격자, 가운데가 짧은 노렌, 가로 외벽 판재를 관찰했다. 사진 촬영일·정확한 치수는 확인하지 못했다. 수치와 보이지 않는 면은 추정이다. 기존 차양 크기·층고·길게 반복되는 입면, 계단/주변 조경, 노렌 문양은 정밀 대조가 남아 있다. 실제 사진과 완전히 일치하는 최종 복원이 아니다. 실제 배경 이미지 합성 작업과 별개다.

## 검증

Blender 별도 프로세스에서 파일을 열고 보강·저장·게임 모델 내보내기·900×600 렌더를 수행했다. 연결된 미저장 Blender 장면은 변경하지 않았다. 렌더를 직접 확인해 외벽 결 방향을 한 번 수정했다.

신규 GLB를 대상으로 기존 모델/문 검사 경로를 갱신했다. 출입·충돌·30/60/120 FPS 문 개방 등 8개 검사 통과. 모델에는 이미지가 내장되고 UV/노멀맵, 문 속성 2개가 유지된다. 물리 테스트의 GLB 로딩 대체 범위는 기존 `ogimachi-actual-onsen-walk.md` 참고. 이번 추가 고정 격자는 별도 충돌을 추가하지 않으며 문 개구 밖에 둔다.

확인 주소: `http://127.0.0.1:5188/ogimachi.html?view=detail&building=onsen`
