import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Physics} from '../src/core/physics.ts';
import {ThirdPersonCamera} from '../src/camera/thirdPerson.ts';
import {settings} from '../src/core/settings.ts';

for(const fps of [30,60,120])for(const wallZ of [.5,1.4])test(`camera clears wall immediately at ${wallZ}m and ${fps} FPS`,async()=>{
 const physics=await Physics.create();
 try{
  const player=physics.world.createRigidBody(physics.R.RigidBodyDesc.kinematicPositionBased());
  const camera=new T.PerspectiveCamera(),follow=new ThirdPersonCamera(camera,physics,player);
  follow.pitch=0;follow.yaw=0;
  const target=new T.Vector3();
  follow.update(1/fps,{x:0,y:0},0,target,0,true);
  const before=follow.currentDistance;
  const wall=physics.addStaticBox(new T.Vector3(0,settings.camera.pivotHeight,wallZ),new T.Vector3(5,5,.1));
  physics.step(1/60);
  follow.update(1/fps,{x:0,y:0},0,target,0,true);
  assert.ok(camera.position.z+settings.camera.collisionRadius <= wallZ-.1+1e-5,'camera sphere must remain in front of wall on the first frame');
  const close=follow.currentDistance;
  assert.ok(close<before);
  physics.world.removeRigidBody(wall.body);physics.step(1/60);
  follow.update(1/fps,{x:0,y:0},0,target,0,true);
  assert.ok(follow.currentDistance>close && follow.currentDistance<before,'release should remain smooth');
 }finally{physics.world.free();}
});
