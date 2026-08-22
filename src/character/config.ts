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
 * **Tripo 웹 스튜디오에서 생성 + 리깅까지 끝낸 GLB** 를 받아서 쓴다(OpenAPI 리깅 아님).
 * 원본 `assets/tripo/mio-web-hi/model_url.glb` — 1,985,298 tris · 4096 텍스처 3장 · **41본 리깅 포함**.
 *
 *   node scripts/build-character.ts --base assets/tripo/mio-web-hi/model_url.glb \
 *     --clips <clips dir> --out public/models/mio.glb --tex 4096 --quality 92 --simplify 0.06
 *
 * **애니 클립은 사지 않았다.** 본 이름 41개가 `character.glb` 와 완전히 일치하고 rest 포즈도
 * 충분히 가까워서, 기존 클립 GLB 를 그대로 붙이면 정상 재생된다(리타겟 크레딧 0).
 *
 * > 함정 기록 — 같은 모델의 **저폴리 내보내기(22,217 tris)** 를 OpenAPI 로 직접 리깅했더니
 * > `L_Clavicle` rest 가 기준보다 **95° 틀어져서**(172.8° → 77.5°) run 처럼 팔이 크게 벌어지는
 * > 클립이 통째로 무너졌다. 유료 리타겟으로도 못 고쳤다. 웹 스튜디오 리깅은 15° 차이라 문제없다.
 * > **리깅된 채로 받을 수 있으면 그걸 쓴다.**
 */
export const MIO: CharacterModelOptions = {
  url: '/models/mio.glb',
  clips: {},
  targetHeight: 1.62, // 16세. 위 1.7 보다 낮게 — ACT 19 에서 사요(12세)와 키 대비가 단서다
  yawOffset: -Math.PI / 2, // character.glb 와 같은 규약(정면 +X)
};
