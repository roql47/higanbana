/**
 * **리그의 바인드 정면과 클립의 축이 맞는지 본다.**
 *
 *   node scripts/dev/axis.ts public/models/character.glb public/models/sayo.glb
 *
 * Tripo 프리셋 애니메이션(`preset:biped:*`)은 **정면 +X** 를 가정하고 만들어져 있다.
 * 그런데 리깅은 모델이 어느 쪽을 보든 그대로 해 주므로, 정면 +Z 인 모델을 리깅하면
 * **몸은 12시를 보는데 다리는 9시–3시로 흔들리는** 결과가 나온다(2026-08-22, 사요에서 겪었다).
 * 리깅에 크레딧을 쓰기 전에 여기서 `bind 발가락 방향` 이 **+X** 인지 확인할 것 —
 * 아니면 `scripts/dev/rotate-glb.ts` 로 돌려서 올린다.
 *
 * 같이 찍는 것: 클립별 주요 본의 회전 변화량. Head·L_Clavicle 이 0.000 인 것은 정상이다
 * (프리셋이 목·쇄골을 안 건드린다) — 정상 산출물인 `character.glb` 도 같은 값이다.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const path of process.argv.slice(2)) {
  const doc = await io.read(path);
  const sc = doc.getRoot().listScenes()[0]!;
  const byName = new Map<string, any>();
  sc.traverse((n) => byName.set(n.getName(), n));
  const wp = (n: string) => { const o = byName.get(n); if (!o) return null; const m = o.getWorldMatrix(); return [m[12]!, m[13]!, m[14]!]; };
  const foot = wp('L_Foot'), toe = wp('L_ToeBase');
  const bindFwd = foot && toe ? [ +(toe[0]-foot[0]).toFixed(3), +(toe[2]-foot[2]).toFixed(3) ] : null;
  console.log(`\n=== ${path}`);
  console.log(`  bind 발가락 방향 (x,z): ${bindFwd}  → ${bindFwd ? (Math.abs(bindFwd[0]!) > Math.abs(bindFwd[1]!) ? (bindFwd[0]! > 0 ? '+X' : '-X') : (bindFwd[1]! > 0 ? '+Z' : '-Z')) : '?'}`);
  const lu = wp('L_Upperarm'), ru = wp('R_Upperarm');
  if (lu && ru) console.log(`  bind 어깨선 (x,z): ${[+(ru[0]-lu[0]).toFixed(3), +(ru[2]-lu[2]).toFixed(3)]}  (팔 벌린 축)`);
  for (const anim of doc.getRoot().listAnimations()) {
    const ch = anim.listChannels();
    const varOf = (bone: string, path: string) => {
      const c = ch.find((c2) => c2.getTargetNode()?.getName() === bone && c2.getTargetPath() === path);
      if (!c) return '없음';
      const arr = c.getSampler()!.getOutput()!.getArray()!;
      const n = c.getSampler()!.getOutput()!.getElementSize();
      let maxd = 0;
      for (let i = 0; i < arr.length; i += n) for (let k = 0; k < n; k++) maxd = Math.max(maxd, Math.abs(arr[i + k]! - arr[k]!));
      return maxd.toFixed(3);
    };
    console.log(`  [${anim.getName()}] Head.rot 변화 ${varOf('Head','rotation')}  Spine02 ${varOf('Spine02','rotation')}  L_Clavicle ${varOf('L_Clavicle','rotation')}  Hip.rot ${varOf('Hip','rotation')}  L_Thigh ${varOf('L_Thigh','rotation')}`);
  }
}
