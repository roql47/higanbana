/**
 * 스킨드 GLB 의 **텍스처만** 줄인다 — 지오메트리·스킨·애니메이션은 건드리지 않는다.
 *
 *   node scripts/dev/shrink-tex.ts --in public/models/mio.glb --out /tmp/mio-2k.glb --max 2048
 *
 * ⚠️ `optimize-glb.ts` 를 쓰면 안 되는 자리다: 그쪽은 `prune()`·`resample()` 을 돌리는데,
 * 스킨드 모델에서 prune 은 Skin 을 지울 수 있다(`build-props.ts` 의 까마귀 교훈).
 * 그래서 이 스크립트는 **textureCompress + meshopt 재인코딩만** 한다.
 *
 * 4K 알베도는 다운로드보다 **VRAM** 이 문제다: 4096² RGBA = 67 MB(+밉맵 ≈ 89 MB),
 * 2048² 면 ≈ 22 MB. 밤 3인칭에서 캐릭터가 차지하는 화면 높이를 생각하면 2K 로 충분하다.
 *
 * 끝에 지오메트리·본·클립이 그대로인지 **스스로 검증**하고, 다르면 교체하지 말라고 찍는다.
 */
import { writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { parseArgs, ROOT } from '../tripo/lib.ts';

const a = parseArgs();
const inPath = resolve(ROOT, String(a['in']));
const outPath = resolve(ROOT, String(a['out']));
const max = Number(a['max'] ?? 2048);
const quality = Number(a['quality'] ?? 88);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
// **디코더도 등록해야 한다** — 이미 meshopt 로 압축된 산출물을 다시 읽기 때문
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(inPath);
const root = doc.getRoot();
const snap = () => ({
  tris: Math.round(root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0)),
  bones: root.listSkins()[0]?.listJoints().length ?? 0,
  anims: root.listAnimations().map((x) => x.getName()).join(','),
  tex: root.listTextures().map((t) => (t.getSize() ?? []).join('x')).join(' '),
});
const before = snap();

await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [max, max], quality }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

const glb = await io.writeBinary(doc);
writeFileSync(outPath, glb);
const after = snap();
console.log('before:', JSON.stringify(before));
console.log('after :', JSON.stringify(after));
console.log(`size  : ${(statSync(inPath).size / 1048576).toFixed(2)} MB → ${(glb.byteLength / 1048576).toFixed(2)} MB`);
const same = before.tris === after.tris && before.bones === after.bones && before.anims === after.anims;
console.log(same ? '✓ 지오메트리·본·클립 동일 — 교체해도 된다' : '✗ 변형 감지 — 교체 금지');
