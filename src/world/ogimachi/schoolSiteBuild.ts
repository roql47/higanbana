import * as T from 'three';
import type {Physics} from '@/core/physics';
import {SchoolInterior} from '../higasato/school';
import {SITES} from '../higasato/ground';
import {textCanvas} from '../higasato/kit';

/** Existing school plus its west entrance. Geometry and interaction origins stay together. */
export async function buildSchoolSite(scene:T.Scene,physics:Physics,height:(x:number,z:number)=>number,site:{x:number;z:number}){
 const {x,z}=site,base=height(x,z);
 const school=new SchoolInterior(scene,physics,{heightAt:()=>base},{...SITES.school!,x,z});
 await school.detail.prepare(new T.Vector3(x,base,z));
 school.group.name='story-school-site';
 school.group.userData.detailHandoff='docs/ogimachi-reconstruction/57-school-site.md';
 const yard=new T.Group();yard.name='school-west-entrance';scene.add(yard);
 const wood=new T.MeshStandardMaterial({color:0x534b3d,roughness:1});
 const box=(px:number,pz:number,w:number,h:number,d:number,above:number,collide=false)=>{
  const y=height(px,pz)+above;
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),wood);mesh.position.set(px,y,pz);mesh.castShadow=true;mesh.receiveShadow=true;yard.add(mesh);
  if(collide)physics.addStaticBox(mesh.position,new T.Vector3(w/2,h/2,d/2));
 };
 // Low side fences leave the complete west-to-door corridor open.
 for(const side of [-1,1]){
  for(const dx of [-20,-18,-16])box(x+dx,z+side*3,.12,1.05,.12,.525,true);
  for(const rail of [.4,.8])box(x-18,z+side*3,4,.09,.09,rail);
 }
 const signMap=textCanvas(512,256,ctx=>{
  ctx.fillStyle='#312f28';ctx.fillRect(0,0,512,256);ctx.fillStyle='#d6cdb6';ctx.textAlign='center';
  ctx.font='44px serif';ctx.fillText('히가사토 초등학교',256,85);ctx.font='30px serif';ctx.fillText('폐교 · 서쪽 현관 →',256,145);ctx.fillText('교실 · 교무실 · 방송실',256,201);
 });
 const sign=new T.Mesh(new T.BoxGeometry(.08,.8,1.6),new T.MeshStandardMaterial({map:signMap,roughness:1}));
 sign.position.set(x-20,height(x-20,z+4)+1.3,z+4);yard.add(sign);
 box(x-20,z+4,.12,1.3,.12,.65,true);
 return {school,spawn:new T.Vector3(x-19,height(x-19,z)+.03,z),target:new T.Vector3(x-12,base+.8,z)};
}
