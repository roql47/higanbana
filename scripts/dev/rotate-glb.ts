/**
 * **GLB 를 Y 축으로 돌려 정점에 구워 넣는다** (노드 변환이 아니라 정점 자체를 돌린다 —
 * Tripo 에 올릴 때 노드 회전은 무시될 수 있다).
 *
 *   node scripts/dev/rotate-glb.ts <in.glb> <out.glb> <deg>
 *
 * 왜: Tripo 프리셋 애니메이션은 **정면 +X** 를 가정한다(`scripts/dev/axis.ts` 참고).
 * 정면 +Z 로 생성된 모델은 리깅 **전에** 여기서 +90° 돌려야 클립이 몸과 같은 축으로 재생된다.
 * 사요(`assets/tripo/sayo-dress/source.glb` → `source-x.glb`)가 이 경로로 다시 만들어졌다.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { transformMesh } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inPath, outPath, degStr] = process.argv.slice(2);
const rad = (Number(degStr ?? 90) * Math.PI) / 180;
const c = Math.cos(rad), s = Math.sin(rad);
// 열 우선(column-major) 4×4 — Y 축 회전
const m = [c, 0, -s, 0,  0, 1, 0, 0,  s, 0, c, 0,  0, 0, 0, 1] as unknown as Parameters<typeof transformMesh>[1];
const doc = await io.read(inPath!);
for (const mesh of doc.getRoot().listMeshes()) transformMesh(mesh, m);
await io.write(outPath!, doc);
console.log(`✓ ${outPath}  (Y ${degStr ?? 90}°)`);
