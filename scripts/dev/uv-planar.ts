/**
 * **평평한 시트 모델에 그림을 평면 투영으로 입힌다** (UV 재계산 + 텍스처 교체).
 *
 *   node scripts/dev/uv-planar.ts <in.glb> <image> <out.glb>
 *
 * 왜: Tripo 는 **형태**는 잘 뽑지만 그 위에 우리 그림을 얹을 수는 없다. 텍스트로 「말린 인화지」를
 * 받은 뒤(`prop-photo-symbol`), 그 시트에 가족사진을 이 스크립트로 인쇄했다.
 * Tripo 가 만든 UV 는 제멋대로라 쓰지 않고, **가장 얇은 축에서 본 평면 투영**으로 다시 만든다.
 *
 * ⚠️ 정면(얇은 축)에서 볼 때 화면 오른쪽은 **−u** 다. 뒤집지 않으면 사진이 거울상이 된다(그랬다).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync } from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inPath, imgPath, outPath] = process.argv.slice(2);
const doc = await io.read(inPath!);
const root = doc.getRoot();
// bbox
let mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
for (const mesh of root.listMeshes()) for (const pr of mesh.listPrimitives()) {
  const pos = pr.getAttribute('POSITION')!; const v = [0,0,0];
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k]!, v[k]!); mx[k] = Math.max(mx[k]!, v[k]!); } }
}
const size = [mx[0]!-mn[0]!, mx[1]!-mn[1]!, mx[2]!-mn[2]!];
const thin = size.indexOf(Math.min(...size));
const ax = [0,1,2].filter((i) => i !== thin);   // 시트 평면의 두 축
const [uAx, vAx] = size[ax[0]!]! >= size[ax[1]!]! ? [ax[0]!, ax[1]!] : [ax[1]!, ax[0]!];
console.log(`bbox ${size.map(v=>v.toFixed(3))}  thin=${'xyz'[thin]}  u=${'xyz'[uAx]} v=${'xyz'[vAx]}  비율 ${(size[uAx]!/size[vAx]!).toFixed(2)}`);
// UV 재계산
for (const mesh of root.listMeshes()) for (const pr of mesh.listPrimitives()) {
  const pos = pr.getAttribute('POSITION')!;
  const uv = new Float32Array(pos.getCount() * 2);
  const v = [0,0,0];
  for (let i = 0; i < pos.getCount(); i++) {
    pos.getElement(i, v);
    // 정면(얇은 축)에서 볼 때 화면 오른쪽 = **−u 축**이라 뒤집는다. 안 뒤집으면 사진이 거울상이 된다
    uv[i*2] = 1 - (v[uAx]! - mn[uAx]!) / size[uAx]!;
    uv[i*2+1] = 1 - (v[vAx]! - mn[vAx]!) / size[vAx]!;
  }
  const acc = doc.createAccessor().setType('VEC2').setArray(uv);
  pr.setAttribute('TEXCOORD_0', acc);
}
// 텍스처 교체
const tex = doc.createTexture('photo').setMimeType('image/webp').setImage(readFileSync(imgPath!));
for (const mat of root.listMaterials()) {
  mat.setBaseColorTexture(tex);
  mat.setBaseColorFactor([1,1,1,1]);
  mat.setMetallicFactor(0);
  mat.setRoughnessFactor(0.72);
  mat.setNormalTexture(null);
  mat.setMetallicRoughnessTexture(null);
}
await io.write(outPath!, doc);
console.log(`✓ ${outPath}`);
