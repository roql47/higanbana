import {Props} from '../props';
import * as T from 'three';
import type {Physics} from '@/core/physics';
import {Hokora} from '../higasato/hokora';
import {HOKORA_SITE,HOKORA_APPROACH} from './hokoraSite';
/** Reusable site assembly. No ACT 6 item/ward state is advanced by this builder. */
export function buildHokoraSite(scene:T.Scene,physics:Physics,height:(x:number,z:number)=>number){
 const {x,z}=HOKORA_SITE,base=height(x,z);
 const hall=new Hokora(scene,physics,{heightAt:(px,pz)=>px===x&&pz===z?base:height(px,pz)},HOKORA_SITE);hall.openDoor();
 const ready=Props.loadNormalized('/models/props/offer-suzu.glb',.12).then(bell=>{bell.name='ACT6-red-bell-placement';bell.position.copy(hall.suzuPos);hall.group.add(bell);return bell;});
 hall.group.name='story-hokora-site';hall.group.userData.detailHandoff='docs/ogimachi-reconstruction/56-hokora-site.md';
 const vertices:number[]=[],indices:number[]=[];let row=0;
 for(let i=0;i<HOKORA_APPROACH.length-1;i++){const a=HOKORA_APPROACH[i]!,b=HOKORA_APPROACH[i+1]!,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),steps=Math.ceil(len/.7);
  for(let j=0;j<=steps;j++){const t=j/steps;for(const side of [-1,1]){const px=a[0]+dx*t-dz/len*1.2*side,pz=a[1]+dz*t+dx/len*1.2*side;vertices.push(px,height(px,pz)+.025,pz);}if(j>0){const k=row*2;indices.push(k-2,k,k-1,k-1,k,k+1);}row++;}
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]!/2,vertices[i+2]!/2);geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 const map=new T.TextureLoader().load('/textures/ogimachi/packed-gravel.webp');map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;
 const path=new T.Mesh(geometry,new T.MeshStandardMaterial({map,color:0x98866b,roughness:1,side:T.DoubleSide}));path.name='hokora-pedestrian-approach';path.receiveShadow=true;scene.add(path);
 const gatePoint=HOKORA_APPROACH.at(-1)!;
 const c=document.createElement('canvas');c.width=512;c.height=192;const ctx=c.getContext('2d')!;ctx.fillStyle='#302a20';ctx.fillRect(0,0,512,192);ctx.fillStyle='#d8c8a6';ctx.font='44px serif';ctx.textAlign='center';ctx.fillText('古い祠 · 오래된 사당',256,78);ctx.fillText('← 참배길',256,140);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(1.5,.56),new T.MeshStandardMaterial({map:tex,side:T.DoubleSide}));sign.position.set(gatePoint[0]-1,height(gatePoint[0]-1,gatePoint[1])+1.2,gatePoint[1]);scene.add(sign);
 const post=new T.Mesh(new T.BoxGeometry(.08,1.5,.08),new T.MeshStandardMaterial({color:0x413629}));post.position.copy(sign.position).y-=.5;scene.add(post);
 return {hall,ready,spawn:new T.Vector3(-523,height(-523,-585)+.03,-585),update:(dt:number)=>hall.update(dt)};
}
