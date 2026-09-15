import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {surveyPoint,SurveyHeightfield} from '../src/world/ogimachi/survey.ts';
const data=JSON.parse(readFileSync(new URL('../public/data/ogimachi/survey.json',import.meta.url)));
const dem=readFileSync(new URL('../public/data/ogimachi/dem.f32',import.meta.url));
const heights=new SurveyHeightfield(data,new Float32Array(dem.buffer,dem.byteOffset,dem.byteLength/4));

test('metric survey puts real Wada and observation point at the correct bearing and separation',()=>{
  assert.deepEqual(surveyPoint(data.origin.lat,data.origin.lon,data.origin),[0,0]);
  const north=surveyPoint(36.2629545,136.9079634,data.origin);
  assert.ok(north[0]>29&&north[0]<32);assert.ok(north[1]<-335&&north[1]>-340);
  assert.ok(Math.hypot(...north)>335&&Math.hypot(...north)<345);
  assert.ok(heights.sample(...north)>50,'real observation hill rises above the Wada precinct');
  assert.ok(Math.abs(heights.sample(0,0))<.1);
  assert.equal(data.buildings.length,456);assert.equal(new Set(data.buildings.map(b=>b.id)).size,456);
});
test('DEM interpolates slopes, clamps the boundary and contains no missing elevation cells',()=>{
  const h=new SurveyHeightfield({...data,dem:{minX:0,minZ:0,step:10,size:2}},new Float32Array([0,10,20,30]));
  assert.equal(h.sample(5,5),15);assert.equal(h.sample(-10,-10),0);assert.ok(Math.abs(h.sample(20,20)-30)<.0001);
  for(const n of heights.values)assert.ok(Number.isFinite(n));
});
test('documented Wada body stays 12.8 by 22.3 metres with west-facing entrance and distinct northern sheds',()=>{
  const main=data.buildings.find(b=>b.id===236248621),itakura=data.buildings.find(b=>b.id===660927470),hasa=data.buildings.find(b=>b.id===236248645);
  assert.equal(main.width,12.8);assert.equal(main.depth,22.3);assert.ok(Math.abs(main.angle)<.1);
  assert.equal(itakura.model,'wada-itakura');assert.equal(hasa.model,'wada-hasagoya');assert.ok(itakura.z<-120&&hasa.z<-80);
  const file=readFileSync(new URL('../public/models/ogimachi/wada-precinct.glb',import.meta.url));
  const gltf=JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
  const roots=gltf.nodes.filter(n=>n.extras?.archetype);
  assert.deepEqual(roots.map(n=>n.extras.archetype).sort(),['wada-hasagoya','wada-itakura','wada-main']);
  assert.ok(gltf.materials.some(m=>m.normalTexture));assert.ok(gltf.materials.some(m=>m.pbrMetallicRoughness?.baseColorTexture));
  assert.equal(roots.find(n=>n.extras.archetype==='wada-main').extras.body_width_m,12.8);
});
