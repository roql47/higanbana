/**
 * Tripo 에마 걸이대에서 프롬프트를 무시하고 따라온 에마 판만 잘라 낸다.
 *
 * 원본은 위쪽 목제 프레임과 아래쪽 에마가 한 primitive 에 들어 있다. y=-0.02 아래는
 * 끈과 에마뿐이고 프레임은 그 위에서 시작하므로, 삼각형 중심을 기준으로 아래 조각을 제거한다.
 * 글씨가 있는 실제 에마 판은 `hokora.ts`의 캔버스 레이어를 계속 사용한다.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Accessor, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const input = resolve('assets/tripo/prop-ema-rack/model_url.glb');
const output = resolve('assets/tripo/prop-ema-rack-frame/model_url.glb');
const cutoffY = -0.02;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
let before = 0;
let after = 0;

for (const mesh of doc.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    if (!position || !indices) continue;
    const kept: number[] = [];
    const v = [0, 0, 0];
    before += indices.getCount() / 3;
    for (let i = 0; i < indices.getCount(); i += 3) {
      const ia = indices.getScalar(i);
      const ib = indices.getScalar(i + 1);
      const ic = indices.getScalar(i + 2);
      const cy = (
        position.getElement(ia, v)[1]! +
        position.getElement(ib, v)[1]! +
        position.getElement(ic, v)[1]!
      ) / 3;
      if (cy < cutoffY) continue;
      kept.push(ia, ib, ic);
    }
    after += kept.length / 3;
    const next = doc.createAccessor('ema-rack-frame-indices')
      .setType(Accessor.Type.SCALAR)
      .setArray(new Uint32Array(kept))
      .setBuffer(indices.getBuffer());
    primitive.setIndices(next);
  }
}

await doc.transform(prune());
mkdirSync(dirname(output), { recursive: true });
await io.write(output, doc);
console.log(`ema rack: ${before} → ${after} tris, ${output}`);
