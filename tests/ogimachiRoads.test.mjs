import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clipRoad,roadStrip,roadWidth,roadSurface} from '../src/world/ogimachi/roadGeometry.ts';
const survey=JSON.parse(readFileSync(new URL('../public/data/ogimachi/survey.json',import.meta.url)));
test('road surfaces face upward, including bends, and use shared corner cross-sections',()=>{
  for(const points of [[[0,0],[0,12]],[[0,0],[12,0],[12,15]],[[0,0],[9,5],[7,16]]]){
    const strip=roadStrip(points,3,()=>0);
    for(let i=0;i<strip.indices.length;i+=3){
      const [a,b,c]=strip.indices.slice(i,i+3).map(k=>strip.positions.slice(k*3,k*3+3));
      const ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);assert.ok(ny>0,'previous reverse winding made paths invisible from above');
    }
    assert.equal(strip.positions.length/3,strip.samples.length*2);
    assert.ok(strip.positions.every(Number.isFinite));
  }
});
test('mapped ways crossing the preview boundary retain their visible sections',()=>{
  assert.deepEqual(clipRoad([[-2000,0],[0,0],[2000,0]]),[[[-1800,0],[0,0],[1800,0]]]);
  assert.deepEqual(clipRoad([[1900,0],[2000,10]]),[]);
  assert.equal(clipRoad([[0,0],[2000,0],[2000,500],[0,500]]).length,2);
});
test('three small Wada bridges preserve source endpoints and do not sag into a ditch',()=>{
  for(const id of [236408803,984794587,984794592]){
    const road=survey.roads.find(r=>r.id===id);assert.ok(road?.bridge);
    const piece=clipRoad(road.points)[0];assert.deepEqual(piece,road.points);
    const strip=roadStrip(piece,roadWidth(road),()=>4,true);assert.ok(strip.positions.filter((_,i)=>i%3===1).every(y=>Math.abs(y-4.12)<1e-8));
  }
  assert.equal(roadSurface(survey.roads.find(r=>r.id===984794592)),'wood');
  assert.equal(roadSurface(survey.roads.find(r=>r.id===236408803)),'stone');
});
test('the first individually authored house faces its street and only replaces its own mapped building',()=>{
  const houses=survey.buildings.filter(b=>b.model==='hakusuien');assert.equal(houses.length,1);
  const b=houses[0];assert.equal(b.id,236248693);assert.equal(b.reviewId,'B001');assert.ok(Math.cos(b.angle)>.99);
  const road=survey.roads.find(r=>r.id===1268046903);assert.ok(road.points.some(p=>p[0]<b.x&&Math.abs(p[1]-b.z)<45));assert.equal(road.width,6.2);
  const buffer=readFileSync(new URL('../public/models/ogimachi/hakusuien.glb',import.meta.url));const gltf=JSON.parse(buffer.toString('utf8',20,20+buffer.readUInt32LE(12)));
  const root=gltf.nodes.find(n=>n.extras?.archetype==='hakusuien');assert.equal(root.extras.osm_id,b.id);assert.equal(root.extras.front_local,'-X');
  assert.ok(gltf.materials.some(m=>m.name.includes('purple linen')));assert.ok(gltf.materials.some(m=>m.normalTexture));
});
test('Irori retains two distinct mapped footprints and loads matching authored roots without mirroring their street fronts',()=>{
  const bytes=readFileSync(new URL('../public/models/ogimachi/irori.glb',import.meta.url));
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const roots=gltf.nodes.filter(n=>n.extras?.archetype?.startsWith('irori'));
  assert.equal(roots.length,2);
  const expected=[[236248710,'irori-restaurant',-55.271,-98.196],[236248704,'irori-shop',-62.375,-109.834]];
  for(const [id,model,x,z] of expected){
    const lots=survey.buildings.filter(b=>b.model===model);assert.equal(lots.length,1);
    const b=lots[0],root=roots.find(n=>n.extras.archetype===model);assert.equal(b.id,id);assert.equal(root.extras.osm_id,id);
    assert.equal(b.x,x);assert.equal(b.z,z);assert.ok(b.angle>.49&&b.angle<.54,'local -X facade must point southwest to the main street');
    assert.deepEqual(root.extras.roof_envelope_m,[b.width,b.depth]);
    assert.ok(root.children.length>5,'separate material groups survive GLB export');
  }
  assert.ok(gltf.materials.some(m=>m.normalTexture),'authored models retain textured materials');
  assert.ok(gltf.materials.some(m=>m.name.includes('red noren')));
  assert.ok(!gltf.materials.some(m=>m.name.includes('purple linen')),'Irori must not inherit Hakusuien curtains');
});
test('Mori workshop replaces only its mapped lot and faces east across the street from Irori',()=>{
  const lots=survey.buildings.filter(b=>b.model==='mori-workshop');assert.equal(lots.length,1);
  const b=lots[0];assert.equal(b.id,236248644);assert.equal(b.x,-91.166);assert.equal(b.z,-115.022);
  assert.ok(b.angle>.27&&b.angle<.28,'normalize the axis without turning the east front west');
  const bytes=readFileSync(new URL('../public/models/ogimachi/mori-workshop.glb',import.meta.url));
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const root=gltf.nodes.find(n=>n.extras?.archetype==='mori-workshop');
  assert.equal(root.extras.osm_id,b.id);assert.equal(root.extras.front_local,'+X');assert.equal(root.extras.reference_date,'2010-08');
  assert.deepEqual(root.extras.roof_envelope_m,[b.width,b.depth]);
  assert.ok(gltf.materials.some(m=>m.name.includes('rose curtains')));
  assert.ok(gltf.materials.some(m=>m.name.includes('sheet roof')));
  assert.ok(gltf.materials.some(m=>m.normalTexture));
  assert.ok(!gltf.materials.some(m=>m.name.includes('kaya')),'this workshop is not a thatched farmhouse');
  const street=survey.roads.find(r=>r.id===1268046903),front=[b.x+Math.cos(b.angle)*5.2,b.z-Math.sin(b.angle)*5.2];
  assert.ok(street.points.some(([x,z])=>x>front[0]&&Math.abs(z-front[1])<25));
});
