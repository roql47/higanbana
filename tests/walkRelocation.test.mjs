import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Physics} from '../src/core/physics.ts';
import {CharacterController} from '../src/character/controller.ts';
import {ThirdPersonCamera} from '../src/camera/thirdPerson.ts';
import {relocateWalk} from '../src/world/ogimachi/walkRelocation.ts';

test('preview relocation synchronizes facing and camera on the first frame in both views',async()=>{
 const physics=await Physics.create();
 try{
  const actor=new CharacterController(physics,new T.Vector3());
  const camera=new T.PerspectiveCamera(),follow=new ThirdPersonCamera(camera,physics,actor.body);
  follow.update(1/60,{x:0,y:0},0,actor.position,0,true);
  for(const view of ['third','first']){
   follow.setView(view);
   actor.actualVelocity.set(4,0,0);actor.accel.set(2,0,0);actor.externalPush.set(3,0,0);
   const destination=new T.Vector3(100,-10,200),target=new T.Vector3(102,-10,203);
   relocateWalk(actor,follow,destination,target);
   follow.update(1/60,{x:0,y:0},0,actor.position,0,true);
   assert.ok(actor.position.distanceTo(destination)<1e-6);
   assert.equal(actor.horizontalSpeed,0);assert.equal(actor.accel.length(),0);assert.equal(actor.externalPush.length(),0);
   const forward=target.clone().sub(destination).normalize();
   assert.ok(new T.Vector3(Math.sin(actor.yaw),0,Math.cos(actor.yaw)).dot(forward)>.999);
   assert.ok(new T.Vector3(-Math.sin(follow.yaw),0,-Math.cos(follow.yaw)).dot(forward)>.999);
   assert.ok(camera.position.distanceTo(destination)<10,'first camera frame must be at the destination, not lagging across old geometry');
   assert.equal(follow.view,view);
  }
 }finally{physics.world.free();}
});
