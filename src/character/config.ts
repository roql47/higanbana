import type { CharacterModelOptions } from './model';

/** Phase 2 산출물 위치. 파일이 없으면 캡슐 플레이스홀더로 동작한다. */
export const CHARACTER: CharacterModelOptions = {
  // scripts/build-character.ts 산출물: 리깅 메시 + 애니 클립(idle/walk/run/jump/fall/turn/jump_down/look_around/standing_relax) 내장, meshopt + WebP 2K
  url: '/models/character.glb',
  clips: {}, // 별도 클립 GLB 를 쓰려면 { name: url } 로 지정
  targetHeight: 1.7,
  yawOffset: -Math.PI / 2, // Tripo 출력은 정면이 +X → +Z 로 보정 (final 모델 기준, 2026-08-18 확인)
};
