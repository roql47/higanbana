import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the shipped gown retains the patch UVs needed for Korean/Japanese name textures', () => {
  const bytes=readFileSync(new URL('../public/models/props/haru-hanging-gown.glb',import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  const patch=json.materials.findIndex(m=>m.name==='Sewn name label');
  assert.ok(patch>=0);
  assert.ok(json.materials[patch].pbrMetallicRoughness.baseColorTexture,'a constant swatch is pruned, losing its UVs');
  const primitives=json.meshes.flatMap(m=>m.primitives).filter(p=>p.material===patch);
  assert.ok(primitives.length>0);
  for(const p of primitives) assert.ok(Number.isInteger(p.attributes.TEXCOORD_0),'localized labels require authored UVs');
});
