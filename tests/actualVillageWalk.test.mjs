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

test('actual DEM, building footprints and street prop collisions permit main-street round trip',async()=>{
 const data=applyStoryScope(JSON.parse(readFileSync('public/data/ogimachi/survey.json')),JSON.parse(readFileSync('public/data/ogimachi/story-selection.json')));
 const bytes=readFileSync('public/data/ogimachi/dem.f32');
 // Reuse production height/triangle sampling without browser texture or model loading.
 const terrain=Object.create(SurveyWorld.prototype);terrain.data=data;terrain.heights=new SurveyHeightfield(data,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));terrain.shrineReviewBase=null;
 terrain.pads=new Map();terrain.paddies=data.fields.filter(f=>f.kind==='rice-reviewed').map(f=>{
  const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);return {points:f.points,level:terrain.heights.sample(xs.reduce((a,b)=>a+b)/xs.length,zs.reduce((a,b)=>a+b)/zs.length),bounds:[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8]};
 });
 for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+3;for(let z=Math.floor((b.z-r)/40);z<=Math.floor((b.z+r)/40);z++)for(let x=Math.floor((b.x-r)/40);x<=Math.floor((b.x+r)/40);x++){const key=`${x},${z}`,list=terrain.pads.get(key)??[];list.push(b);terrain.pads.set(key,list);}}
 const original=T.TextureLoader.prototype.loadAsync;T.TextureLoader.prototype.loadAsync=async()=>new T.Texture();
 const physics=await Physics.create();
 try{
  const height=(x,z)=>terrain.ground(x,z),root=new T.Group(),material=new T.MeshStandardMaterial();
  const materials=Object.fromEntries(['asphalt','concrete','pavers','gravel','grass','metal','wood','paint','rust','leaf','soil','water','clay'].map(k=>[k,material]));
  const street=buildAct1Streetscape(data,height,materials,legacyGroundSupport(data,height));
  await addLegacyGround(street,data,height);root.add(street);
  const surface=addWalkColliders(physics,root,data);physics.step(1/60);
  const a=new T.Vector3(-62.214,0,-46.22),b=new T.Vector3(-75,0,-95);
  a.y=surface.heightAt(a.x,a.z)+.05;
  const actor=new CharacterController(physics,a);physics.step(1/60);
  for(const target of [b,a]){
   let arrived=false;
   for(let i=0;i<60*35;i++){
    const dx=target.x-actor.position.x,dz=target.z-actor.position.z;
    if(Math.hypot(dx,dz)<.5){arrived=true;break;}
    actor.update(1/60,{axis:{x:0,y:1},cameraYaw:Math.atan2(-dx,-dz),walk:true,jumpPressed:false,jumpHeld:false});physics.step(1/60);
    const floor=surface.heightAt(actor.position.x,actor.position.z);assert.notEqual(floor,null);
    assert.ok(actor.position.y-floor>-.08,'actor must not sink through actual ground');
   }
   assert.ok(arrived,`blocked near ${actor.position.x.toFixed(2)},${actor.position.z.toFixed(2)} toward ${target.x},${target.z}`);
  }
 }finally{T.TextureLoader.prototype.loadAsync=original;physics.world.free();}
});
