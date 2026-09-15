import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {addLegacyGround,legacyGroundLift} from '../src/world/ogimachi/legacyGround.ts';
import {Physics} from '../src/core/physics.ts';
import {CharacterController} from '../src/character/controller.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';

test('earth boundary meets road height and slopes gradually toward interior',()=>{
 assert.equal(legacyGroundLift(-27,-60,0,1.7),.12);
 assert.equal(legacyGroundLift(-27,-60,20,1.7),.02);
 let last=.02;
 for(let d=0;d<=3;d+=.1){const y=legacyGroundLift(-27-d,-60,20,1.7);assert.ok(y>=last-1e-9&&y-last<.01);last=y;}
 assert.ok(Math.abs(last-.2)<.001);
});

for(const route of [
 {name:'east',x:-30,z:-60,yaw:-Math.PI/2,axis:'x',edge:-27,sign:1},
 {name:'west',x:-108,z:-60,yaw:Math.PI/2,axis:'x',edge:-111,sign:-1},
 {name:'north',x:-70,z:-111,yaw:0,axis:'z',edge:-114,sign:-1},
 {name:'south',x:-70,z:7,yaw:Math.PI,axis:'z',edge:10,sign:1},
])test(`actual ground mesh: cross ${route.name} edge and return without jumping`,async()=>{
 const original=T.TextureLoader.prototype.loadAsync;T.TextureLoader.prototype.loadAsync=async()=>new T.Texture();
 const physics=await Physics.create();
 try{
  const root=new T.Group(),data=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
  const height=(x,z)=>x*.015+z*.008;
  await addLegacyGround(root,data,height);
  const floor=new T.Mesh(new T.PlaneGeometry(300,300,10,10).rotateX(-Math.PI/2));
  const p=floor.geometry.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,height(p.getX(i),p.getZ(i)));
  floor.name='GSI-DEM-ground-metres';root.add(floor);
  const surfaces=addWalkColliders(physics,root,{buildings:[]});physics.step(1/60);
  const actor=new CharacterController(physics,new T.Vector3(route.x,height(route.x,route.z)+.25,route.z));
  physics.step(1/60);
  const move=(direction,seconds)=>{for(let i=0;i<seconds*60;i++){
   actor.update(1/60,{axis:{x:0,y:direction},cameraYaw:route.yaw,walk:true,jumpPressed:false,jumpHeld:false});physics.step(1/60);
   const ground=surfaces.heightAt(actor.position.x,actor.position.z);
   assert.notEqual(ground,null,JSON.stringify(actor.position));assert.ok(actor.position.y-ground>-.05,'no sinking');
  }};
  move(1,4);assert.ok((actor.position[route.axis]-route.edge)*route.sign>1,'leaves patch without jumping');
  move(-1,4);assert.ok((actor.position[route.axis]-route.edge)*route.sign< -1,'reenters without obstruction');
  assert.ok(Math.abs(actor.position.y-surfaces.heightAt(actor.position.x,actor.position.z))<.1);
 }finally{T.TextureLoader.prototype.loadAsync=original;physics.world.free();}
});
