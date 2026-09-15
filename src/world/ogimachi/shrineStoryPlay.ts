import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {Physics} from '@/core/physics';
import {ShrineInvitation} from '@/story/shrineInvitation';
/** Existing authored shrine is reused; only the story slab and offering seats are added. */
export async function createShrineStoryPlay(scene:T.Scene,physics:Physics,height:(x:number,z:number)=>number){
 const base=height(-90,-260),root=(await new GLTFLoader().loadAsync('/models/ogimachi/story-shrine.glb')).scene;
 root.name='ACT5-story-shrine';root.position.set(-90,base,-260);scene.add(root);root.updateMatrixWorld(true);
 root.traverse(o=>{if(!(o instanceof T.Mesh))return;o.castShadow=true;o.receiveShadow=true;
  // Widen the existing central seat and its tray, instead of duplicating seven seats.
  o.geometry=o.geometry.clone();const positions=o.geometry.getAttribute('position'),inverse=o.matrixWorld.clone().invert();
  for(let i=0;i<positions.count;i++){const q=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(o.matrixWorld);if(Math.abs(q.x+90)<.46&&Math.abs(q.z+260-6.5)<.46&&q.y-base>.49&&q.y-base<1.21){q.x=-90+(q.x+90)*1.75;q.applyMatrix4(inverse);positions.setXYZ(i,q.x,q.y,q.z);}}
  positions.needsUpdate=true;o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
  const a=o.geometry.getAttribute('position');if(!a)return;const vertices=new Float32Array(a.count*3),v=new T.Vector3();for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);vertices.set(v.toArray(),i*3);}
  const indices=o.geometry.index?new Uint32Array(o.geometry.index.array):Uint32Array.from({length:a.count},(_,i)=>i);
  physics.world.createCollider(physics.R.ColliderDesc.trimesh(vertices,indices).setFriction(1));
 });
 const local=(x:number,y:number,z:number)=>new T.Vector3(-90+x,base+y,-260+z);
 const stone=new T.MeshStandardMaterial({color:0x73746c,roughness:.95});
 function block(x:number,y:number,z:number,w:number,h:number,d:number){const m=new T.Mesh(new T.BoxGeometry(w,h,d),stone);m.position.copy(local(x,y,z));m.castShadow=true;m.receiveShadow=true;scene.add(m);physics.addStaticBox(m.position,new T.Vector3(w/2,h/2,d/2));return m;}
 // Courtyard floor is 0.50m above the graded ground; keep entry and front stairs clear.
 block(0,1.05,3.5,1.8,1.1,.35);
 const paper=document.createElement('canvas');paper.width=768;paper.height=512;const c=paper.getContext('2d')!;c.fillStyle='#555951';c.fillRect(0,0,768,512);c.fillStyle='#d4cdb5';c.textAlign='center';c.font='36px serif';['피안의 문을 열고자 하는 자여','일곱 공물을 모아 이곳에 바쳐라','그러면 돌아갈 길이 열리리라'].forEach((l,i)=>c.fillText(l,384,150+i*105));
 const texture=new T.CanvasTexture(paper);texture.colorSpace=T.SRGBColorSpace;const face=new T.Mesh(new T.PlaneGeometry(1.7,.98),new T.MeshStandardMaterial({map:texture,roughness:1}));face.position.copy(local(0,1.07,3.686));scene.add(face);
 for(let i=0;i<7;i++){const angle=Math.PI*(.15+i*.70/6),x=Math.cos(angle)*7,z=1.5+Math.sin(angle)*5;
  if(i!==3){const ring=new T.Mesh(new T.TorusGeometry(.21,.018,6,24),stone);ring.rotation.x=-Math.PI/2;ring.position.copy(local(x,1.195,z));scene.add(ring);}
  else for(const dx of [-.15,.15]){const foot=new T.Mesh(new T.PlaneGeometry(.11,.29),new T.MeshStandardMaterial({color:0x3d413b,roughness:1}));foot.rotation.x=-Math.PI/2;foot.position.copy(local(x+dx,1.19,z));scene.add(foot);}
 }
 const quest=new ShrineInvitation(),slab=local(0,.53,4.65),seventh=local(0,.53,7.5),door=local(0,1.3,-2.7);
 let message='종소리가 멎었다. 석판의 글자를 살펴보자.';
 const close=(p:T.Vector3,q:T.Vector3,r:number)=>Math.hypot(p.x-q.x,p.z-q.z)<r&&Math.abs(p.y-q.y)<2;
 const target=(p:T.Vector3)=>close(p,slab,2)?'slab':close(p,seventh,1.35)?'seventh':close(p,door,2)?'door':null;
 return {quest,spawn:local(0,.6,8.2),near:(p:T.Vector3)=>close(p,local(0,.5,2),17),
 interact(p:T.Vector3,ready:boolean){const t=target(p);if(t==='slab')message=quest.advance(ready);else if(t==='seventh')message='여섯 자리에는 물건의 마모가 있지만, 넓은 자리에는 작은 맨발 두 짝이 배어 있다. 발끝은 석판을 향한다.';else if(t==='door')message='문은 안에서 잠겨 있다. 미오: 언니…… 거기 있어?\n대답은 돌아오지 않는다.';return message;},
 view(p:T.Vector3,ready:boolean){const t=target(p);return {title:quest.accepted?'목표 · 일곱 공물을 찾아라 0/7':'ACT 5 · 거짓된 탈출법',
 text:quest.index>=0||t==='seventh'||t==='door'?message:ready?'본전 문이 잠겨 있다. 앞마당의 석판과 비어 있는 받침대를 살펴보자.':'흔적을 세 곳 확인한 뒤 이 석판을 다시 읽자.',
 action:t==='slab'?(quest.accepted?'E · 석판 다시 읽기':quest.index<0?'E · 석판 읽기':'E · 계속 읽기'):t==='seventh'?'E · 넓은 받침대 조사':t==='door'?'E · 본전 문 조사':null};},
 };
}
