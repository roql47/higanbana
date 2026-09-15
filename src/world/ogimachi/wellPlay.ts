import * as THREE from 'three';
import {Well} from '../higasato/blockouts';
import type {Physics} from '@/core/physics';
import type {CharacterController} from '@/character/controller';
import type {ThirdPersonCamera} from '@/camera/thirdPerson';
import {WellShaft} from '../higasato/wellShaft';
export async function createWellPlay(scene:THREE.Scene,physics:Physics,height:(x:number,z:number)=>number){
 const response=await fetch('/data/ogimachi/story-layout.json');if(!response.ok)throw Error('우물 배치 로드 실패');const layout=await response.json();const site=layout.sites.find((s:{id:string})=>s.id==='well');const [x,z]=site.position as [number,number],y=Math.max(...Array.from({length:32},(_,i)=>{
  const angle=i/32*Math.PI*2;
  return height(x+Math.cos(angle)*1.25,z+Math.sin(angle)*1.25);
}),height(x,z))+.025;
 const well=new Well(scene,physics,{heightAt:()=>y},{x,z});await well.ready;
 const shaft=new WellShaft(scene,physics,{heightAt:()=>y},{x,z});
 const spawn=new THREE.Vector3(x,height(x,z+2.6)+.03,z+2.6);
 const fade=document.createElement('div');Object.assign(fade.style,{position:'fixed',inset:'0',background:'#000',opacity:'0',pointerEvents:'none',zIndex:'1000'});document.body.append(fade);
 const panel=document.createElement('div');Object.assign(panel.style,{position:'fixed',bottom:'80px',left:'20px',zIndex:'120',padding:'14px',background:'#17262eee',color:'#fff',maxWidth:'420px'});const message=document.createElement('p');message.textContent='우물 플레이 구간 · 조사 → 하강 → 제단 → 귀환';const button=document.createElement('button');panel.append(message,button);document.body.append(panel);
 let inspected=false,altarDone=false,below=false,t=0,moved=false,destination=false;
 let controller:CharacterController,follow:ThirdPersonCamera;let clearInput=()=>{};
 function prompt(){if(!controller)return '';const p=controller.position;if(below){if(p.distanceTo(shaft.altarPos)<1.8&&!altarDone)return 'E · 제단 조사';if(p.distanceTo(shaft.landing)<1.7)return 'E · 밧줄로 올라가기';return '제단 또는 밧줄 가까이 이동하세요';}if(p.distanceTo(new THREE.Vector3(x,y,z))<3.2)return inspected?'E · 우물 내려가기':'E · 우물 조사';return '우물 가까이 이동하세요';}
 function act(){if(t>0||!controller)return;const label=prompt();if(label==='E · 우물 조사'){inspected=true;message.textContent='차가운 공기가 올라옵니다. 밧줄은 약 12m 아래까지 이어져 있습니다.';}else if(label==='E · 제단 조사'){altarDone=true;message.textContent='제단에서 동전 세 닢과 물에 젖은 흔적을 확인했습니다. 밧줄로 돌아가세요.';}else if(label==='E · 우물 내려가기'||label==='E · 밧줄로 올라가기'){destination=!below;t=.9;moved=false;clearInput();}}
 button.onclick=()=>{act();button.blur();};
 return {spawn,shaft,bind(c:CharacterController,f:ThirdPersonCamera,resetInput:()=>void){controller=c;follow=f;clearInput=resetInput;},get locked(){return t>0;},interact:act,
 reset(){t=0;below=false;fade.style.opacity='0';clearInput();controller.teleport(spawn);follow.snapBehind(spawn,new THREE.Vector3(x,y+1,z));message.textContent='우물 입구로 돌아왔습니다.';},
 update(dt:number){well.update(dt);shaft.update(dt);if(t>0){t=Math.max(0,t-dt);fade.style.opacity=String(t>.45?( .9-t)/.45:t/.45);if(!moved&&t<=.45){below=destination;const p=below?shaft.landing.clone().add(new THREE.Vector3(0,.08,0)):spawn;controller.teleport(p);follow.snapBehind(p,below?shaft.altarPos:new THREE.Vector3(x,y+1,z));clearInput();moved=true;message.textContent=below?'지상에서 12m 아래 · 제단을 조사하고 밧줄로 돌아오세요.':'지상으로 돌아왔습니다.';}}const label=prompt();button.textContent=label;button.disabled=t>0||!label.startsWith('E');}
 };
}
