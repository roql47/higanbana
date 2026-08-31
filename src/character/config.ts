import type { CharacterModelOptions } from './model';

/** Phase 2 산출물 위치. 파일이 없으면 캡슐 플레이스홀더로 동작한다. */
export const CHARACTER: CharacterModelOptions = {
  // scripts/build-character.ts 산출물: 리깅 메시 + 애니 클립(idle/walk/run/jump/fall/turn/jump_down/look_around/standing_relax) 내장, meshopt + WebP 2K
  url: '/models/character.glb',
  clips: {}, // 별도 클립 GLB 를 쓰려면 { name: url } 로 지정
  targetHeight: 1.7,
  yawOffset: -Math.PI / 2, // Tripo 출력은 정면이 +X → +Z 로 보정 (final 모델 기준, 2026-08-18 확인)
};

/**
 * 아마미야 미오 — 《피안화》 주인공.
 *
 * 사용자가 교체한 세일러 교복 모델을 +Z→+X로 회전 베이크한 뒤 Tripo biped v1.0으로 리깅했다.
 * 정규화본 `assets/tripo/mio-school-v3/source-x.glb` — 53,284 verts · 텍스처 3장 · 정적 A포즈.
 * 리그 `assets/tripo/mio-school-v3/rig/model_url.glb` — **41본**, 발끝 기준 정면 +X 검증.
 *
 *   node scripts/build-character.ts --base assets/tripo/mio-school-v3/rig/model_url.glb \
 *     --clips assets/tripo/final-tripo/anim --out public/models/mio.glb --tex 4096 --quality 92
 *
 * 본 이름 41개가 `character.glb` 와 일치한다. 기존 11개 클립을 회전 + Root/Hip 이동만 적용해
 * 실렌더 검증했고 idle/walk/run에서 팔·치마·가방 스킨이 무너지지 않아 추가 리타겟은 생략했다.
 *
 * 원본은 정면 +Z였으므로 리깅 전에 Y +90°를 정점에 베이크했다. 이를 생략하면 이동 방향과
 * 팔다리 운동축이 90° 어긋난다.
 */
export const MIO: CharacterModelOptions = {
  url: '/models/mio.glb',
  clips: {},
  targetHeight: 1.62, // 16세. 위 1.7 보다 낮게 — ACT 19 에서 사요(12세)와 키 대비가 단서다
  yawOffset: -Math.PI / 2, // character.glb 와 같은 규약(정면 +X)
  constrainLocomotionArms: true, // 리그 간 rest 차이로 생기는 팔 과외전·머리 위 스윙 제한
};
