import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {SurveyWorld} from '../src/world/ogimachi/surveyWorld.ts';
import {SurveyHeightfield} from '../src/world/ogimachi/survey.ts';
import {applyStoryScope} from '../src/world/ogimachi/storyScope.ts';
import {addLegacyGround,legacyGroundSupport} from '../src/world/ogimachi/legacyGround.ts';
import {buildAct1Streetscape} from '../src/world/ogimachi/act1Streetscape.ts';
import {Physics} from '../src/core/physics.ts';
import {CharacterController} from '../src/character/controller.ts';
import {addWalkColliders} from '../src/world/ogimachi/walkPhysics.ts';


import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {loadOnsenExterior} from '../src/world/ogimachi/onsenAsset.ts';
import {onsenDoor} from '../src/world/ogimachi/onsenDoor.ts';
test('actual onsen site: approach, closed-door stop, animated unlock, entry and return',async()=>{
 const data=applyStoryScope(JSON.parse(readFileSync('public/data/ogimachi/survey.json')),JSON.parse(readFileSync('public/data/ogimachi/story-selection.json')));
 const bytes=readFileSync('public/data/ogimachi/dem.f32');
 // Reuse production height/triangle sampling without browser texture or model loading.
 const terrain=Object.create(SurveyWorld.prototype);terrain.data=data;terrain.heights=new SurveyHeightfield(data,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));terrain.shrineReviewBase=null;
 terrain.pads=new Map();terrain.paddies=data.fields.filter(f=>f.kind==='rice-reviewed').map(f=>{
  const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);return {points:f.points,level:terrain.heights.sample(xs.reduce((a,b)=>a+b)/xs.length,zs.reduce((a,b)=>a+b)/zs.length),bounds:[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8]};
 });
 for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+3;for(let z=Math.floor((b.z-r)/40);z<=Math.floor((b.z+r)/40);z++)for(let x=Math.floor((b.x-r)/40);x<=Math.floor((b.x+r)/40);x++){const key=`${x},${z}`,list=terrain.pads.get(key)??[];list.push(b);terrain.pads.set(key,list);}}

 const b=data.buildings.find(b=>b.id===236248626);assert.ok(b);
 const originalLoad=GLTFLoader.prototype.loadAsync,originalDocument=globalThis.document;
 GLTFLoader.prototype.loadAsync=async()=>{const scene=new T.Group();for(const side of [-1,1]){const leaf=new T.Group();leaf.userData.onsenDoorSide=side;scene.add(leaf);}return {scene};};
 globalThis.document={createElement:()=>({getContext:()=>({fillText(){}})})};
 const physics=await Physics.create();
 try{
  const root=new T.Group(),site=await loadOnsenExterior(b);root.add(site);
  const x0=Math.floor((b.x-40)/4)*4,z0=Math.floor((b.z-40)/4)*4;
  const geo=new T.PlaneGeometry(80,80,20,20).rotateX(-Math.PI/2).translate(x0+40,0,z0+40);
  const p=geo.getAttribute('position');for(let i=0;i<p.count;i++)p.setY(i,terrain.height(p.getX(i),p.getZ(i)));geo.computeVertexNormals();
  const ground=new T.Mesh(geo);ground.name='GSI-DEM-ground-metres';root.add(ground);
  const collision=addWalkColliders(physics,root,data);physics.step(1/60);
  const q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),b.angle);
  const point=x=>new T.Vector3(x,0,14).applyQuaternion(q).add(new T.Vector3(b.x,b.height,b.z));
  const spawn=point(-11);spawn.y=collision.heightAt(spawn.x,spawn.z)+.05;
  const actor=new CharacterController(physics,spawn),door=onsenDoor(site,b,collision.openOnsen);physics.step(1/60);
  const local=()=>actor.position.clone().sub(new T.Vector3(b.x,b.height,b.z)).applyQuaternion(q.clone().invert());
  const move=(direction,seconds)=>{for(let i=0;i<seconds*60;i++){
   door.update(1/60);actor.update(1/60,{axis:{x:0,y:direction},cameraYaw:b.angle-Math.PI/2,walk:true,jumpPressed:false,jumpHeld:false});physics.step(1/60);
   const floor=collision.heightAt(actor.position.x,actor.position.z);assert.notEqual(floor,null);assert.ok(actor.position.y-floor>-.08,'no sinking');
  }};
  move(1,3);assert.ok(local().x< -6.8,'closed door must stop entry');assert.ok(door.near(actor.position),'must reach interaction zone');
  door.open(actor.position);move(1,3);assert.ok(door.opened);assert.ok(local().x> -6&&local().x< -2,`entry ${local().x}`);
  move(-1,4);assert.ok(local().x< -10,`exit ${local().x}`);
 }finally{GLTFLoader.prototype.loadAsync=originalLoad;globalThis.document=originalDocument;physics.world.free();}
});
