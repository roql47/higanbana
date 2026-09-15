import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {syncSkinnedPose} from '../src/character/syncSkinnedPose.ts';
import {WebGLObjects} from 'three/src/renderers/webgl/WebGLObjects.js';
function run(sync,shadows){
const info={render:{frame:0}},objects=WebGLObjects({}, {get:(o,g)=>g,update(){}},{}, {},info);
const bone=new THREE.Bone(),mesh=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
let stale=0;
for(let frame=0;frame<9;frame++){bone.position.x=frame*.05;mesh.updateMatrixWorld(true);if(sync)syncSkinnedPose(mesh);objects.update(mesh);info.render.frame++;if(shadows(frame))objects.update(mesh);if(Math.abs(bone.position.x-mesh.skeleton.boneMatrices[12])>1e-5)stale++;}
return stale;}
test('renderer cache reproduces stale poses only with intermittent shadow passes',()=>{assert.ok(run(false,i=>i%3===0)>0);assert.equal(run(false,()=>true),0);});
test('final pose upload fixes intermittent shadows without changing bone movement',()=>{assert.equal(run(true,i=>i%3===0),0);});
