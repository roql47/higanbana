import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Physics} from '../src/core/physics.ts';
import {CharacterController} from '../src/character/controller.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';

async function fixture(){
 const physics=await Physics.create(),group=new THREE.Group();
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(40,40).rotateX(-Math.PI/2));floor.name='GSI-DEM-ground-metres';group.add(floor);
 addWalkColliders(physics,group,{buildings:[{x:3,z:0,height:0,width:2,depth:8,levels:1,angle:0}]});
 const ctrl=new CharacterController(physics,new THREE.Vector3(0,2,0));physics.step(1/60);
 return {physics,ctrl};
}
const input={axis:{x:0,y:0},cameraYaw:0,walk:true,jumpPressed:false,jumpHeld:false};
test('walk terrain supports capsule and footprint blocks movement from both sides',async()=>{
 const {physics,ctrl}=await fixture();
 try{
  for(let i=0;i<180;i++){ctrl.update(1/60,input);physics.step(1/60);}
  assert.ok(ctrl.grounded);assert.ok(Math.abs(ctrl.position.y)<.15);
  for(let i=0;i<240;i++){ctrl.update(1/60,{...input,axis:{x:1,y:0}});physics.step(1/60);}
  assert.ok(ctrl.position.x>1&&ctrl.position.x<1.7);
  ctrl.teleport(new THREE.Vector3(6,.1,0));physics.step(1/60);
  for(let i=0;i<240;i++){ctrl.update(1/60,{...input,axis:{x:-1,y:0}});physics.step(1/60);}
  assert.ok(ctrl.position.x>4.3&&ctrl.position.x<5);
 }finally{physics.world.free();}
});
test('fixed stepping gives the same travel at 30, 60 and 120 render FPS',async()=>{
 const distances=[];
 for(const fps of [30,60,120]){
  const {physics,ctrl}=await fixture();let accumulator=0;
  try{
   for(let frame=0;frame<fps*3;frame++){
    accumulator+=1/fps;
    while(accumulator>=1/60){ctrl.update(1/60,{...input,axis:{x:0,y:1}});physics.step(1/60);accumulator-=1/60;}
   }
   distances.push(ctrl.position.z);
  }finally{physics.world.free();}
 }
 assert.ok(Math.max(...distances)-Math.min(...distances)<.05);
});
