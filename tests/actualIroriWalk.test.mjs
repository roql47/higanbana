import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {SurveyWorld} from '../src/world/ogimachi/surveyWorld.ts';
import {SurveyHeightfield} from '../src/world/ogimachi/survey.ts';
import {applyStoryScope} from '../src/world/ogimachi/storyScope.ts';
import {Physics} from '../src/core/physics.ts';
import {CharacterController} from '../src/character/controller.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';


import {cutInteriorTerrain} from '../src/world/ogimachi/interiorTerrainCut.ts';
import {iroriDoor} from '../src/world/ogimachi/iroriDoor.ts';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
test('actual Irori asset: closed stop, open, entry, close guard, exit',async()=>{
 const data=applyStoryScope(JSON.parse(readFileSync('public/data/ogimachi/survey.json')),JSON.parse(readFileSync('public/data/ogimachi/story-selection.json')));
 const bytes=readFileSync('public/data/ogimachi/dem.f32');
 // Reuse production height/triangle sampling without browser texture or model loading.
 const terrain=Object.create(SurveyWorld.prototype);terrain.data=data;terrain.heights=new SurveyHeightfield(data,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));terrain.shrineReviewBase=null;
 terrain.pads=new Map();terrain.paddies=data.fields.filter(f=>f.kind==='rice-reviewed').map(f=>{
  const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);return {points:f.points,level:terrain.heights.sample(xs.reduce((a,b)=>a+b)/xs.length,zs.reduce((a,b)=>a+b)/zs.length),bounds:[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8]};
 });
 for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+3;for(let z=Math.floor((b.z-r)/40);z<=Math.floor((b.z+r)/40);z++)for(let x=Math.floor((b.x-r)/40);x<=Math.floor((b.x+r)/40);x++){const key=`${x},${z}`,list=terrain.pads.get(key)??[];list.push(b);terrain.pads.set(key,list);}}

 const b=data.buildings.find(b=>b.model==='irori-restaurant');assert.ok(b);
 const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('public/models/ogimachi/irori-restaurant-interior-v8.glb');
 const source=doc.getRoot().listScenes()[0].listChildren()[0];
 // Former 2.1 m false jamb panels must not survive the runtime export.
 const body=source.listChildren().find(n=>n.getName().startsWith('irori-v5-body'));assert.ok(body);
 for(const primitive of body.getMesh().listPrimitives()){
  const a=primitive.getAttribute('POSITION').getArray();
  for(let i=0;i<a.length;i+=3)assert.ok(!(a[i]>-4.16&&a[i]<-2.04&&a[i+1]>.35&&a[i+1]<2.45&&Math.abs(a[i+2])>.92&&Math.abs(a[i+2])<1.02),'false open-door panel removed');
 }
 for(const primitive of body.getMesh().listPrimitives()){
  const a=primitive.getAttribute('POSITION').getArray();
  for(let i=0;i<a.length;i+=3)assert.ok(!(a[i]>-3.72&&a[i]<-3.58&&a[i+1]>.96&&a[i+1]<2.84&&Math.abs(a[i+2])>1.3&&Math.abs(a[i+2])<5.4),'exterior window backing must stay within the front wall');
 }
 const root=new T.Group(),site=new T.Group();site.name='irori-enterable-building';site.position.set(b.x,b.height,b.z);site.rotation.y=b.angle;root.add(site);
 for(const node of source.listChildren()){
  const extras=node.getExtras();if(!extras.collisionBox&&!extras.iroriDoorSide)continue;
  const ob=new T.Group();ob.userData=extras;ob.position.fromArray(node.getTranslation());ob.quaternion.fromArray(node.getRotation());ob.scale.fromArray(node.getScale());site.add(ob);
 }
 assert.ok(site.children.filter(o=>o.userData.collisionBox).length===20);
 const x0=Math.floor((b.x-30)/4)*4,z0=Math.floor((b.z-30)/4)*4;
 const geo=new T.PlaneGeometry(64,64,16,16).rotateX(-Math.PI/2).translate(x0+32,0,z0+32);
 const p=geo.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,terrain.height(p.getX(i),p.getZ(i)));geo.computeVertexNormals();
 const ground=new T.Mesh(cutInteriorTerrain(geo,b));ground.name='GSI-DEM-ground-metres';root.add(ground);
 const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),b.angle);
 const point=(x,y=0,z=0)=>new T.Vector3(x,y,z).applyQuaternion(q).add(new T.Vector3(b.x,b.height,b.z));
 const positions=[];for(const x of [-5.8,-4.48])for(const z of [-.97,.97]){const v=point(x,0,z);v.y=x===-5.8?terrain.ground(v.x,v.z)+.015:b.height+.30;positions.push(...v.toArray());}
 const rampGeo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));rampGeo.setIndex([0,1,2,1,3,2]);const ramp=new T.Mesh(rampGeo);ramp.userData.walkSurface=true;root.add(ramp);
 const physics=await Physics.create();
 try{
  const collision=addWalkColliders(physics,root,data);physics.step(1/60);
  const spawn=point(-6.5);spawn.y=collision.heightAt(spawn.x,spawn.z)+.05;
  const actor=new CharacterController(physics,spawn),door=iroriDoor(site,b,collision.blockIrori);physics.step(1/60);
  const local=()=>actor.position.clone().sub(new T.Vector3(b.x,b.height,b.z)).applyQuaternion(q.clone().invert());
  const move=(direction,seconds)=>{for(let i=0;i<seconds*60;i++){
   door.update(1/60,actor.position);actor.update(1/60,{axis:{x:0,y:direction},cameraYaw:b.angle-Math.PI/2,walk:true,jumpPressed:false,jumpHeld:false});physics.step(1/60);
   const floor=collision.heightAt(actor.position.x,actor.position.z);assert.notEqual(floor,null);assert.ok(actor.position.y-floor>-.08,'no sinking');
  }};
  move(1,2);assert.ok(local().x< -4.6,'closed door blocks');assert.ok(door.near(actor.position));
  assert.ok(door.toggle(actor.position));move(1,2.5);assert.ok(door.opened);assert.ok(local().x> -4.0,`entered ${local().x}`);
  const safe=point(-2.5,.3);actor.teleport(safe);physics.step(1/60);assert.ok(door.toggle(actor.position));move(0,1.1);assert.equal(door.progress,0);
  assert.ok(door.toggle(actor.position));move(0,1.1);assert.equal(door.opened,true);
  actor.teleport(point(-4.57,.3));physics.step(1/60);assert.equal(door.toggle(actor.position),false,'cannot close on player');
  move(-1,2);assert.ok(local().x< -6,`exit ${local().x}`);
 }finally{physics.world.free();}
});
