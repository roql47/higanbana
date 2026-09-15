import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('B004 GLB has embedded wood and stone textures, UVs and the correct entrance side',()=>{
  const b=readFileSync(new URL('../public/models/ogimachi/onsen-v3.glb',import.meta.url)),g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  const root=g.nodes.find(n=>n.extras?.osm_id===236248626);assert.equal(root.extras.archetype,'onsen');assert.deepEqual(root.extras.roof_envelope_m,[15.135,54.613]);
  assert.ok(g.images.length>=4);assert.ok(g.images.every(i=>i.bufferView!==undefined));
  assert.ok(g.materials.filter(m=>m.normalTexture).length>=2);
  for(const name of ['weathered sheet metal','indigo entrance linen']){
    const mat=g.materials.find(m=>m.name.includes(name));
    assert.ok(mat.normalTexture,`${name} needs exported microrelief`);
    assert.ok(mat.pbrMetallicRoughness.metallicRoughnessTexture,`${name} needs exported roughness`);
  }
  let triangles=0;for(const mesh of g.meshes)for(const p of mesh.primitives){assert.ok(p.attributes.TEXCOORD_0!==undefined);triangles+=g.accessors[p.indices].count/3;}
  assert.ok(triangles<12000);assert.ok(g.meshes.length<=16);assert.ok(b.length<2500000);
  assert.equal(g.nodes.filter(n=>Math.abs(n.extras?.onsenDoorSide)===1).length,2);
  const cloth=g.nodes.find(n=>n.name.includes('indigo entrance linen')),a=g.accessors[g.meshes[cloth.mesh].primitives[0].attributes.POSITION];
  assert.ok(a.min[2]>11&&a.max[2]<17,'fabric must face the existing local +Z entrance camera');
});
