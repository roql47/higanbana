import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legacyPathSampler,legacyGroundSupport} from '../src/world/ogimachi/legacyGround.ts';
const data=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
test('mapped side lanes remain visible through the legacy earth patch and meet outside roads',()=>{
 const sample=legacyPathSampler(data),support=legacyGroundSupport(data,()=>0);
 for(const id of [34320767,236248804]){
  const road=data.roads.find(r=>r.id===id),a=road.points.at(-2),b=road.points.at(-1);
  // Find this road's crossing of the eastern boundary, independently from rendering.
  const segment=road.points.slice(1).map((p,i)=>[road.points[i],p]).find(([a,b])=>(a[0]+27)*(b[0]+27)<=0);
  assert.ok(segment);const [u,v]=segment,t=(-27-u[0])/(v[0]-u[0]),z=u[1]+(v[1]-u[1])*t;
  assert.equal(sample(-27,z).weight,1);assert.ok(Math.abs(support(-27,z)-.12)<1e-8);
  assert.ok(a&&b);
 }
 assert.equal(sample(-95,-70).weight,0,'do not invent a path across unmarked land');
});
test('crossing segments with endpoints outside are included, bridges are excluded',()=>{
 const path={id:1,kind:'path',points:[[-150,-50],[0,-50]]};
 assert.equal(legacyPathSampler({roads:[path]})(-70,-50).weight,1);
 assert.equal(legacyPathSampler({roads:[{...path,bridge:true}]})(-70,-50).weight,0);
});
