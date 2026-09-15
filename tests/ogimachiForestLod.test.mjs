import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {forestLevel,CanopyForest} from '../src/world/ogimachi/forestLod.ts';
test('forest density falls with distance and low mode never adds triangles or shadows',()=>{
  for(const quality of ['standard','low']){let last=Infinity;for(const d of [0,179,181,499,501,849,851,1301]){const l=forestLevel(d,quality),tri=l.fraction*(l.detail?80:20);assert.ok(tri<=last);last=tri;if(quality==='low')assert.equal(l.shadow,false);}}
  for(const d of [0,200,700,900,1400])assert.ok(forestLevel(d,'low').fraction<=forestLevel(d,'standard').fraction);
});
test('forest LOD reuses buffers, recovers all nearby trees and keeps the manual hide state',()=>{
  const items=Array.from({length:40},(_,i)=>({x:i*2,z:0,y:8,r:8,h:12,color:new T.Color(0x486248)})),forest=new CanopyForest(items),mesh=forest.children[0],buffer=mesh.instanceMatrix;
  forest.update(new T.Vector3(20,8,0),'standard');assert.equal(forest.submitted,40);assert.equal(forest.triangles,3200);
  forest.update(new T.Vector3(2000,8,0),'standard');assert.equal(forest.submitted,0);assert.equal(mesh.visible,false);
  forest.visible=false;forest.update(new T.Vector3(20,8,0),'low');assert.equal(forest.visible,false);assert.equal(forest.submitted,24);assert.equal(forest.shadowTrees,0);assert.equal(mesh.instanceMatrix,buffer);
  forest.update(new T.Vector3(20,8,0),'standard');assert.equal(forest.submitted,40);assert.equal(mesh.visible,true);
  assert.equal(forest.update(new T.Vector3(20,8,0),'standard'),false);
  forest.dispose();
});
