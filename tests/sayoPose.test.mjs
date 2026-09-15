import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Sayo} from '../src/story/sayo.ts';
import {FirstPerson} from '../src/story/firstPerson.ts';

test('release reaches zero continuously instead of dropping a fully-held arm on the last frame',()=>{
 const fp=new FirstPerson(new THREE.Scene(),new THREE.PerspectiveCamera());fp.begin(0);fp.releaseHand(1);
 const ctrl={position:new THREE.Vector3(),horizontalSpeed:0};let previous=1;
 for(let i=0;i<61;i++){
  fp.update(1/60,{x:0,y:0},ctrl);
  const weight=fp.handStrength;
  assert.ok(weight<=previous && previous-weight<.026);
  previous=weight;
 }
 assert.equal(fp.holdingHand,false);assert.equal(fp.handStrength,0);
});

test('Sayo disappearing keeps depth occlusion and restores opaque rendering',()=>{
 const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial();
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material));
 const sayo=new Sayo({scene,animations:[]},{});
 const version=material.version;
 const shader={fragmentShader:'#include <alphahash_fragment>'};material.onBeforeCompile(shader,{});
 assert.ok(shader.fragmentShader.includes('floor(gl_FragCoord.xy)'));
 assert.ok(!shader.fragmentShader.includes('vPosition'));
 sayo.setOpacity(.5);assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);assert.equal(material.alphaHash,true);
 assert.equal(material.version,version);
 sayo.setOpacity(0);assert.equal(sayo.root.visible,false);
 sayo.setOpacity(1);assert.equal(material.alphaHash,true);assert.equal(material.opacity,1);assert.equal(sayo.root.visible,true);
});

test('constant animation tracks do not accumulate Sayo arm and head corrections',()=>{
 const scene=new THREE.Group();
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(.3,1.49,.3),new THREE.MeshBasicMaterial()));
 const clav=new THREE.Bone(),upper=new THREE.Bone(),fore=new THREE.Bone(),hand=new THREE.Bone(),head=new THREE.Bone();
 clav.name='L_Clavicle';upper.name='L_Upperarm';fore.name='L_Forearm';hand.name='L_Hand';head.name='Head';
 scene.add(clav,head);clav.add(upper);upper.add(fore);fore.add(hand);
 clav.position.set(0,1,0);upper.position.x=.1;fore.position.x=.3;hand.position.x=.3;
 const tracks=[clav,upper,fore,head].map(b=>new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`,[0,1],[0,0,0,1,0,0,0,1]));
 const sayo=new Sayo({scene,animations:[new THREE.AnimationClip('run',1,tracks)]},{yawOffset:0});
 sayo.play('run');sayo.armW=1;sayo.glanceNow=1;
 const pose={pos:new THREE.Vector3(),yaw:0,speed:3.15,hand:new THREE.Vector3(.1,1,-.5),glance:1};
 sayo.update(0,pose);
 const rotations=[clav,upper,fore,head].map(b=>b.quaternion.clone());
 for(let i=0;i<120;i++)sayo.update(0,pose);
 [clav,upper,fore,head].forEach((b,i)=>assert.ok(b.quaternion.angleTo(rotations[i])<1e-6,`${b.name} accumulated a procedural rotation`));
});


test('release keeps the residual IK correction below the former two-percent cutoff',()=>{
 const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial()));
 const sayo=new Sayo({scene,animations:[]},{});
 let applied=0;sayo.solveArm=(target,weight)=>{applied=weight;};
 sayo.armW=.019;
 sayo.update(1/60,{pos:new THREE.Vector3(),yaw:0,speed:2,hand:null});
 assert.ok(applied>0 && applied<.019);
});

test('Sayo exit keeps running and advancing while Mio is stationary',async()=>{
 const {Act1}=await import('../src/story/act1.ts');
 const clips=[],speeds=[];
 const sayo={root:new THREE.Group(),play(name){clips.push(name);},update(dt,p){speeds.push(p.speed);this.root.position.copy(p.pos);}};
 const ground={roadLength:100,roadAt(s){return {x:0,z:s,dirX:0,dirZ:1};},heightAt(){return 0;}};
 const act=new Act1({companionFollowsPlayer:true,sayo,village:{ground},controller:{position:new THREE.Vector3(),horizontalSpeed:0},fp:{tugging:0,stumbling:false,holdingHand:false,handStrength:0}});
 Object.assign(act,{state:'end',released:true,pace:2.79,nearS:0,nearX:0,nearZ:0});
 for(let i=0;i<180;i++)act.poseSayo(1/60);
 assert.ok(clips.every(c=>c==='run'));
 assert.ok(speeds.every(s=>s>=2));
 assert.ok(sayo.root.position.z>6);
});
