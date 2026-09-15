import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createIdleFootContact} from '../src/world/ogimachi/idleFootContact.ts';
test('stationary heel and toe align to ground without accumulating rotations',()=>{
 const root=new T.Group(),foot=new T.Bone(),toe=new T.Bone();foot.name='L_Foot';toe.name='L_ToeBase';toe.position.z=.2;foot.add(toe);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-.03,.08,-.1,.03,.08,-.1,-.03,0,.2,.03,0,.2],3));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Array(16).fill(0),4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());mesh.add(foot);root.add(mesh);mesh.bind(new T.Skeleton([foot,toe]));root.position.y=.15;
 const contact=createIdleFootContact(root,()=>0);contact.update();root.updateMatrixWorld(true);
 const ys=Array.from({length:4},(_,i)=>mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld).y);
 assert(Math.max(...ys)-Math.min(...ys)<1e-5,JSON.stringify(ys));assert(Math.abs(Math.min(...ys))<1e-5);
 contact.restore();assert(foot.quaternion.angleTo(new T.Quaternion())<1e-6);
});
