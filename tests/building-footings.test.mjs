import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingFooting} from '../src/world/ogimachi/buildingFootings.ts';
const building={id:1,x:17,z:-9,width:10,depth:14,angle:.73,height:4,model:'irori-restaurant'};
test('rotated footing reaches below slope without raising the floor',()=>{
 const ground=(x,z)=>3+.17*(x-17)-.09*(z+9);
 const geo=buildingFooting(building,ground);assert.ok(geo);
 const p=geo.getAttribute('position');
 for(let i=0;i<p.count;i+=2){
  assert.ok(Math.abs(p.getY(i)-3.975)<1e-5);
  assert.ok(p.getY(i+1)<=ground(p.getX(i+1),p.getZ(i+1))-.1199);
  assert.equal(p.getX(i),p.getX(i+1));assert.equal(p.getZ(i),p.getZ(i+1));
 }
 geo.dispose();
});
test('already grounded building adds no visible infill',()=>assert.equal(buildingFooting(building,()=>4),null));
