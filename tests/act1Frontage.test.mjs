import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds} from '@gltf-transform/functions';
import {ACT1_FRONTAGE_IDS,ACT1_WEST_IDS,ACT1_SIDE_IDS,ACT1_NORTH_IDS,JUNCTION_IDS,JUNCTION_REAR_IDS} from '../src/world/ogimachi/act1Frontage.ts';
test('ACT1 frontage exports each surveyed replacement once, upright and within its lot envelope',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/ogimachi/act1-frontage.glb');
 const nodes=doc.getRoot().listScenes()[0].listChildren();
 const survey=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
 assert.equal(nodes.length,ACT1_WEST_IDS.size);
 const south=getBounds(nodes.find(n=>n.getExtras().osm_id===236248688));
 const north=getBounds(nodes.find(n=>n.getExtras().osm_id===236248633));
 assert.ok(south.max[1]-north.max[1]>1.5,'2010 reference: south workshop roof is taller than north annex');
 let triangles=0;
 for(const id of ACT1_WEST_IDS){
  const matches=nodes.filter(n=>n.getExtras().osm_id===id);assert.equal(matches.length,1);
  const b=survey.buildings.find(b=>b.id===id),{min,max}=getBounds(matches[0]);
  assert.ok(min[1]>-.1 && max[1]>3 && max[1]<10,`${id}: upright height`);
  assert.ok(max[0]-min[0]<b.width+2,`${id}: width`);
  assert.ok(max[2]-min[2]<b.depth+2,`${id}: depth`);
 }
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;
 assert.ok(triangles<25000,`static frontage triangles ${triangles}`);
 assert.ok(statSync('public/models/ogimachi/act1-frontage.glb').size<4e6);
});


test('ACT1 side inventory replaces every remaining generic model in the reviewed corridor',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/ogimachi/act1-sides.glb');
 const nodes=doc.getRoot().listScenes()[0].listChildren(),survey=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
 assert.equal(nodes.length,9);
 for(const id of ACT1_SIDE_IDS){
  const matches=nodes.filter(n=>n.getExtras().osm_id===id);assert.equal(matches.length,1,`missing ${id}`);
  const b=survey.buildings.find(b=>b.id===id),{min,max}=getBounds(matches[0]);
  assert.ok(min[1]>-.1 && max[1]>3 && max[1]<12,`${id}: height`);
  assert.ok(max[0]-min[0]<b.width+2.5,`${id}: width`);assert.ok(max[2]-min[2]<b.depth+2.5,`${id}: depth`);
 }
 const missing=survey.buildings.filter(b=>b.x>-130&&b.x<40&&b.z>-120&&b.z<30&&['merchant','storehouse'].includes(b.model)&&!ACT1_FRONTAGE_IDS.has(b.id));
 assert.deepEqual(missing.map(b=>b.id),[],'generic fallback remains in ACT1 corridor');
 assert.ok(statSync('public/models/ogimachi/act1-sides.glb').size<5e6);
});

test('north continuation replaces eight neighbours without taking over the onsen lot',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/ogimachi/act1-north.glb');
 const nodes=doc.getRoot().listScenes()[0].listChildren(),survey=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
 assert.equal(nodes.length,8);assert.equal(ACT1_NORTH_IDS.has(236248626),false);
 for(const id of ACT1_NORTH_IDS){
  const match=nodes.filter(n=>n.getExtras().osm_id===id);assert.equal(match.length,1,`${id}: unique model`);
  const b=survey.buildings.find(b=>b.id===id),{min,max}=getBounds(match[0]);
  assert.ok(min[1]>-.05&&max[1]>2.5&&max[1]<9,`${id}: upright`);
  assert.ok(max[0]-min[0]<b.width+1.6&&max[2]-min[2]<b.depth+1.6,`${id}: lot envelope`);
 }
 const missing=survey.buildings.filter(b=>b.x>-155&&b.x<20&&b.z>=-230&&b.z<=-120&&b.id!==236248626&&!ACT1_NORTH_IDS.has(b.id));
 assert.deepEqual(missing.map(b=>b.id),[]);
 let triangles=0,primitives=0;
 for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;primitives++;}
 assert.ok(triangles<45000,`${triangles} triangles`);assert.ok(primitives<=56,`${primitives} draws`);
 assert.ok(statSync('public/models/ogimachi/act1-north.glb').size<4e6);
});

test('junction exports four unique building envelopes within its geometry budget',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/ogimachi/junction.glb');
 const nodes=doc.getRoot().listScenes()[0].listChildren(),survey=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
 assert.equal(nodes.length,4);
 for(const id of JUNCTION_IDS){
  const matches=nodes.filter(n=>n.getExtras().osm_id===id);assert.equal(matches.length,1);
  const b=survey.buildings.find(b=>b.id===id),{min,max}=getBounds(matches[0]);
  assert.ok(min[1]>-.05&&max[1]>3&&max[1]<8,`${id}: upright`);
  assert.ok(max[0]-min[0]<b.width+1.6&&max[2]-min[2]<b.depth+1.6,`${id}: footprint envelope`);
  assert.ok(!ACT1_NORTH_IDS.has(id)&&!ACT1_SIDE_IDS.has(id)&&!ACT1_WEST_IDS.has(id));
 }
 let triangles=0,primitives=0;
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;primitives++;}
 assert.ok(triangles<25000);assert.ok(primitives<=28);assert.ok(statSync('public/models/ogimachi/junction.glb').size<3e6);
});

test('rear junction closes the nine-building replacement inventory within bounds and budget',async()=>{
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/models/ogimachi/junction-rear.glb');
 const nodes=doc.getRoot().listScenes()[0].listChildren(),survey=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
 assert.equal(nodes.length,9);
 for(const id of JUNCTION_REAR_IDS){
  const matches=nodes.filter(n=>n.getExtras().osm_id===id);assert.equal(matches.length,1);
  const b=survey.buildings.find(b=>b.id===id),{min,max}=getBounds(matches[0]);
  assert.ok(min[1]>-.05&&max[1]>2.5&&max[1]<8,`${id}: upright`);
  assert.ok(max[0]-min[0]<b.width+1.6&&max[2]-min[2]<b.depth+1.6,`${id}: lot envelope`);
  assert.ok(!JUNCTION_IDS.has(id)&&!ACT1_NORTH_IDS.has(id)&&!ACT1_SIDE_IDS.has(id)&&!ACT1_WEST_IDS.has(id));
 }
 const missing=survey.buildings.filter(b=>b.x>-160&&b.x<30&&b.z< -230&&b.z> -330&&!ACT1_FRONTAGE_IDS.has(b.id));
 assert.deepEqual(missing.map(b=>b.id),[]);
 let triangles=0,primitives=0;
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3;primitives++;}
 assert.ok(triangles<45000);assert.ok(primitives<=63);assert.ok(statSync('public/models/ogimachi/junction-rear.glb').size<4e6);
});
