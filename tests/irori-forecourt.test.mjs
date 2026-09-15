import test from 'node:test';
import assert from 'node:assert/strict';
import {buildingPadHeight} from '../src/world/ogimachi/buildingPadHeight.ts';

test('rotated Irori forecourt stays at the prop base at entrance prop positions',()=>{
 const b={id:1,model:'irori-restaurant',x:-55,z:-98,angle:.5,width:10.386,depth:13.514,height:7};
 const point=(x,z)=>[b.x+Math.cos(b.angle)*x+Math.sin(b.angle)*z,b.z-Math.sin(b.angle)*x+Math.cos(b.angle)*z];
 for(const [x,z] of [[-5.4,0],[-6,3],[-8,5],[-4,-5]]){
  const [wx,wz]=point(x,z);
  assert.equal(buildingPadHeight(wx,wz,9,[b]),7);
 }
 const [x,z]=point(-14,0);assert.equal(buildingPadHeight(x,z,9,[b]),9);
 const other={...b,id:2,model:'storehouse',x:point(-7,0)[0],z:point(-7,0)[1],width:2,depth:2,height:8};
 assert.equal(buildingPadHeight(other.x,other.z,9,[b,other]),8);
});
