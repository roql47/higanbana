import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {massingSize} from '../src/world/ogimachi/massing.ts';
import {streetFronts,frontageGeometry,streetEdge} from '../src/world/ogimachi/streetStudy.ts';
import {MassingWorld} from '../src/world/ogimachi/massingWorld.ts';
import {ONSEN_ID,onsenParts} from '../src/world/ogimachi/onsenStudy.ts';
const data=JSON.parse(readFileSync(new URL('../public/data/ogimachi/survey.json',import.meta.url)));
test('onsen study targets one mapped identity and keeps its neighbours and road access unchanged',()=>{
  const before=JSON.stringify(data),b=data.buildings.find(b=>b.id===ONSEN_ID),parts=onsenParts(b);
  assert.ok(parts.some(p=>p.name==='entrance canopy')&&parts.some(p=>p.name==='projecting balcony base'));
  assert.equal(massingSize(b).roofDepth,b.depth);
  assert.equal(massingSize(b).roofWidth,b.width);
  for(const neighbour of data.buildings.filter(n=>n.id!==ONSEN_ID))assert.deepEqual(onsenParts(neighbour),[]);
  for(const p of parts)assert.ok([...p.size,...p.position].every(Number.isFinite)&&p.size.every(v=>v>0));
  assert.equal(streetFronts[b.model],undefined,'no automatic forecourt across neighbouring house plots');
  assert.equal(JSON.stringify(data),before);
});
test('identified silhouettes retain their individual authoring proportions',()=>{
  const profile=model=>massingSize(data.buildings.find(b=>b.model===model));
  assert.equal(profile('hakusuien').bodyWidth,10);
  assert.equal(profile('wada-main').roofWidth,15);
  assert.equal(profile('mori-workshop').wall,6.3);
  assert.ok(profile('irori-shop').rise>profile('irori-restaurant').rise);
  assert.ok(profile('irori-shop').roofWidth<profile('irori-restaurant').roofWidth);
});
test('front courts connect both sides of the road without crossing its edge and face upward',()=>{
  const road=data.roads.find(r=>r.id===1268046903),before=JSON.stringify(road);
  for(const b of data.buildings.filter(b=>streetFronts[b.model])){
    const {positions:p,indices}=frontageGeometry(b,road,()=>0);
    assert.ok(p.length>0&&p.every(Number.isFinite));
    for(let row=0;row<=Math.ceil(massingSize(b).bodyDepth);row++){
      const i=row*9*3,point=[p[i],p[i+2]],edge=streetEdge(point,road);
      assert.ok(Math.hypot(point[0]-edge[0],point[1]-edge[1])<1e-7);
      assert.equal(p[i+1],.48);
      assert.ok(Math.abs(p[i+8*3+1]-(b.height+.08))<1e-7);
    }
    for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3).map(v=>v*3);
      assert.ok((p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2])>0);
    }
  }assert.equal(JSON.stringify(road),before);
});
test('full design scene loads its mixed roof geometry, four forecourts and local onsen landing',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async path=>new Response(readFileSync(new URL(`../public${path}`,import.meta.url)));
  let world;
  try{world=new MassingWorld();await world.ready;
    assert.equal(world.stats.buildings,data.buildings.length);
    assert.equal(world.frontages.children.length,5);
    assert.equal(world.frontages.children.filter(m=>m.name.startsWith('street-study-forecourt')).length,4);
    const landing=world.frontages.getObjectByName('onsen-local-entrance-landing');assert.ok(landing);
    landing.geometry.computeBoundingBox();assert.ok(landing.geometry.boundingBox.max.x-landing.geometry.boundingBox.min.x<6);
    assert.ok(world.stats.canopies>100);
    world.buildings.traverse(mesh=>{if(!mesh.isMesh)return;assert.ok(mesh.geometry.getAttribute('position').count>0);assert.ok(Array.from(mesh.geometry.getAttribute('normal').array).every(Number.isFinite));});
  }finally{globalThis.fetch=originalFetch;world?.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
});
