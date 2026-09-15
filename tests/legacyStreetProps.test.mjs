import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {buildAct1Streetscape} from '../src/world/ogimachi/act1Streetscape.ts';
import {legacyGroundSupport} from '../src/world/ogimachi/legacyGround.ts';
const data=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
const materials=()=>Object.fromEntries(['asphalt','concrete','pavers','gravel','grass','metal','wood','paint','rust','leaf','soil','water','clay'].map(k=>[k,new T.MeshStandardMaterial()]));
test('bench feet follow sloping earth and fence collision follows its rail direction',()=>{
 const height=(x,z)=>x*.04+z*.08,support=legacyGroundSupport(data,height);
 const root=buildAct1Streetscape(data,height,materials(),support);
 const benches=root.children.filter(o=>o.name==='COL_ACT1_bench');assert.equal(benches.length,3);
 for(const b of benches){const h=b.userData.collisionBox[1],foot=[support(b.position.x,b.position.z-.61),support(b.position.x,b.position.z+.61)];
  assert.ok(Math.abs(b.position.y-h/2-Math.min(...foot))<1e-6);
  assert.ok(Math.abs(b.position.y+h/2-Math.max(...foot)-.50)<1e-6);
 }
 const fences=root.children.filter(o=>o.name==='COL_ACT1_low-fence');assert.ok(fences.some(f=>Math.abs(f.rotation.y)>.02));
 for(const fence of fences)for(const r of data.roads.filter(r=>[34320767,236248804].includes(r.id))){
  for(const f of [-.5,-.25,0,.25,.5]){
   const p=new T.Vector3(0,0,f*fence.userData.collisionBox[2]).applyQuaternion(fence.quaternion).add(fence.position);
   for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=T.MathUtils.clamp(((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    assert.ok(Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz)>(r.width??1.5)/2+.3,'fence must leave the mapped side-lane entrance open');
   }
  }
 }
 const road=data.roads.find(r=>r.id===1268046903);
 for(const object of root.children.filter(o=>o.userData.collisionBox)){
  const [w,,d]=object.userData.collisionBox;
  for(const sx of [-1,1])for(const sz of [-1,1]){
   const p=new T.Vector3(sx*w/2,0,sz*d/2).applyQuaternion(object.quaternion).add(object.position);let nearest=Infinity;
   for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=T.MathUtils.clamp(((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz),0,1);nearest=Math.min(nearest,Math.hypot(p.x-a[0]-dx*t,p.z-a[1]-dz*t));}
   assert.ok(nearest>1.5,`${object.name} intrudes into the three-metre lane`);
  }
 }
});
