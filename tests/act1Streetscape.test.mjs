import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {buildAct1Streetscape,ACT1_ROAD_WIDTH} from '../src/world/ogimachi/act1Streetscape.ts';
import {Physics} from '../src/core/physics.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';
const data=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
const mats=()=>Object.fromEntries(['asphalt','concrete','pavers','gravel','grass','metal','wood','paint','rust','leaf','soil','water','clay'].map(k=>[k,new T.MeshStandardMaterial()]));
test('complete ACT1 street has finite merged geometry and all observed prop categories',()=>{
 const root=buildAct1Streetscape(data,()=>0,mats());let calls=0,triangles=0;
 root.traverse(o=>{if(o.isMesh){calls++;const p=o.geometry.getAttribute('position');assert.ok([...p.array].every(Number.isFinite),o.name);triangles+=(o.geometry.index?.count??p.count)/3;}});
 for(const name of ['surfaces','barriers','fenceBays','noticeboards','hydrants','lampPoles','benches','pots','bins','grassTufts','shrubs'])assert.ok(root.userData.inventory[name]>0,name);
 assert.ok(calls<25,`${calls} calls`);assert.ok(triangles<60000,`${triangles} triangles`);
 const path=root.getObjectByName('act1-road-dirt'),points=path.geometry.getAttribute('position');
 assert.equal(ACT1_ROAD_WIDTH,3);assert.ok(points.count>0);
 assert.equal(root.getObjectByName('act1-surface-west-stone-drain-band'),undefined);
 assert.equal(root.getObjectByName('act1-surface-east-stone-drain-band'),undefined);
 const road=data.roads.find(r=>r.id===1268046903);
 root.traverse(o=>{if(!o.userData.collisionBox)return;let nearest=Infinity;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=T.MathUtils.clamp(((o.position.x-a[0])*dx+(o.position.z-a[1])*dz)/(dx*dx+dz*dz),0,1);nearest=Math.min(nearest,Math.hypot(o.position.x-a[0]-dx*t,o.position.z-a[1]-dz*t));}
  assert.ok(nearest>ACT1_ROAD_WIDTH/2+.15,`${o.name} blocks the road`);
 });
});
test('parking supports the player and parking barriers have separate solid proxies',async()=>{
 const root=buildAct1Streetscape(data,()=>0,mats()),physics=await Physics.create();
 const surfaces=addWalkColliders(physics,root,{buildings:[]});physics.step(1/60);
 assert.ok(Math.abs(surfaces.heightAt(-84,-61)-.18)<.001);
 const barrier=root.children.find(o=>o.name==='COL_ACT1_parking-barrier');
 const p=barrier.position;
 const ray=new physics.R.Ray({x:p.x+2,y:p.y,z:p.z},{x:-1,y:0,z:0});
 const hit=physics.world.castRay(ray,3,true);assert.ok(hit && hit.timeOfImpact<2,'barrier must block a horizontal approach');
 physics.world.free();
});
