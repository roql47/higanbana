import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFileSync} from 'node:fs';
import {addLegacyGround,outsideLegacyGround} from '../src/world/ogimachi/legacyGround.ts';
import {roadStrip,roadWidth} from '../src/world/ogimachi/roadGeometry.ts';
import {Physics} from '../src/core/physics.ts';
import {CharacterController} from '../src/character/controller.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';
const data=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));

for(const id of [34320767,236248804])test(`mapped side lane ${id}: walk out and return over its road seam`,async()=>{
 const original=T.TextureLoader.prototype.loadAsync;T.TextureLoader.prototype.loadAsync=async()=>new T.Texture();
 const physics=await Physics.create();
 try{
  const root=new T.Group(),height=(x,z)=>x*.025+z*.012;
  await addLegacyGround(root,data,height);
  const road=data.roads.find(r=>r.id===id);
  for(const points of outsideLegacyGround(road.points)){
   const strip=roadStrip(points,roadWidth(road),height),g=new T.BufferGeometry();
   g.setAttribute('position',new T.Float32BufferAttribute(strip.positions,3));g.setIndex(strip.indices);
   const mesh=new T.Mesh(g);mesh.name='mapped-roads-test';root.add(mesh);
  }
  const collision=addWalkColliders(physics,root,{buildings:[]});physics.step(1/60);
  const [a,b]=road.points.slice(1).map((p,i)=>[road.points[i],p]).find(([a,b])=>(a[0]+27)*(b[0]+27)<=0);
  const dx=b[0]-a[0],dz=b[1]-a[1],t=(-27-a[0])/dx,z=a[1]+dz*t;
  const forward=new T.Vector3(dx,0,dz).normalize().multiplyScalar(Math.sign(dx));
  const seam=new T.Vector3(-27,0,z),start=seam.clone().addScaledVector(forward,-2.5);start.y=collision.heightAt(start.x,start.z)+.05;
  const actor=new CharacterController(physics,start);physics.step(1/60);
  const yaw=Math.atan2(-forward.x,-forward.z);
  const walk=(direction)=>{for(let i=0;i<240;i++){
   actor.update(1/60,{axis:{x:0,y:direction},cameraYaw:yaw,walk:true,jumpPressed:false,jumpHeld:false});physics.step(1/60);
   const ground=collision.heightAt(actor.position.x,actor.position.z);
   assert.notEqual(ground,null,'must remain on the road, with no fallback terrain');
   assert.ok(actor.position.y-ground>-.05&&actor.position.y-ground<.25,'feet stay on the connected surface');
  }};
  walk(1);assert.ok(actor.position.x> -26);
  walk(-1);assert.ok(actor.position.x< -28);
 }finally{T.TextureLoader.prototype.loadAsync=original;physics.world.free();}
});
