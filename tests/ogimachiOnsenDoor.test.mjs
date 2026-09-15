import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {onsenDoor} from '../src/world/ogimachi/onsenDoor.ts';
import {readFileSync} from 'node:fs';

for(const fps of [30,60,120])test(`onsen opens visibly before unlocking at ${fps} FPS`,()=>{
  const group=new T.Group();
  for(const side of [-1,1]){const leaf=new T.Group();leaf.userData.onsenDoorSide=side;group.add(leaf);}
  let calls=0;const door=onsenDoor(group,{x:0,z:0,height:0,angle:0},()=>calls++);
  door.open(new T.Vector3(50,0,50));door.update(.1);assert.equal(calls,0);
  door.open(new T.Vector3(-8,0,14));
  for(let i=0;i<fps;i++)door.update(1/fps);
  assert.equal(calls,0,'door stays collidable during movement');
  for(let i=0;i<fps;i++)door.update(1/fps);
  assert.equal(calls,1);assert.equal(door.opened,true);
  assert.ok(Math.abs(group.children[0].position.z-2.3)<1e-6);
  assert.ok(Math.abs(group.children[1].position.z+2.3)<1e-6);
  assert.equal(group.children[0].position.y,0);assert.equal(group.children[1].position.y,0);
});

test('exported door geometry moves out of the passage without changing its height',()=>{
  const bytes=readFileSync(new URL('../public/models/ogimachi/onsen-v3.glb',import.meta.url));
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const group=new T.Group(),bounds=[];
  for(const node of gltf.nodes.filter(n=>n.extras?.onsenDoorSide)){
    const leaf=new T.Group();leaf.userData=node.extras;group.add(leaf);
    const box=new T.Box3();
    for(const id of node.children){const child=gltf.nodes[id];
      const matrix=new T.Matrix4().compose(new T.Vector3(...(child.translation??[0,0,0])),new T.Quaternion(...(child.rotation??[0,0,0,1])),new T.Vector3(...(child.scale??[1,1,1])));
      for(const primitive of gltf.meshes[child.mesh].primitives){const a=gltf.accessors[primitive.attributes.POSITION];box.union(new T.Box3(new T.Vector3(...a.min),new T.Vector3(...a.max)).applyMatrix4(matrix));}
    }
    bounds.push({leaf,box});
  }
  const door=onsenDoor(group,{x:0,z:0,height:0,angle:0},()=>{});door.open(new T.Vector3(-8,0,14));
  for(let i=0;i<90;i++)door.update(1/60);
  for(const {leaf,box} of bounds){const moved=box.clone().translate(leaf.position);
    assert.equal(moved.min.y,box.min.y);assert.equal(moved.max.y,box.max.y);
    assert.ok(moved.max.z<13||moved.min.z>15,'central two metres must be free of door geometry');
  }
});
