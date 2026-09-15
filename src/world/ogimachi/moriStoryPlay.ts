import {buildHokoraSite} from './hokoraSiteBuild';
import {createShrineStoryPlay} from './shrineStoryPlay';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {Physics} from '@/core/physics';
import type {SurveyWorld} from './surveyWorld';
import {buildingPoint} from './streetStudy';
import {MoriInvestigation,type MoriTrace} from '@/story/moriInvestigation';

/** Fictional ACT 4 interior, isolated above the terrain; entry is an explicit fade. */
export async function createMoriStoryPlay(scene:T.Scene,physics:Physics,world:SurveyWorld,height:(x:number,z:number)=>number){
 const building=world.data.buildings.find(b=>b.model==='mori-workshop');if(!building)throw Error('전승관 배치가 없습니다.');
 const point=(x:number,z:number)=>{const [px,pz]=buildingPoint(building,x,z);return new T.Vector3(px,height(px,pz)+.04,pz);};
 const outside=point(6.9,0),inside=new T.Vector3(0,800.03,4.25);
 const room=(await new GLTFLoader().loadAsync('/models/ogimachi/mori-story-interior.glb')).scene;room.position.y=800;room.visible=false;scene.add(room);room.updateMatrixWorld(true);
 room.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}if(o.userData.collisionBox){const p=o.getWorldPosition(new T.Vector3());physics.addStaticBox(p,new T.Vector3(...o.userData.collisionBox as [number,number,number]).multiplyScalar(.5));}});
 for(const z of [-3.4,0,3]){const light=new T.PointLight(0xffd9a4,20,9,1.7);light.position.set(0,2.8,z);room.add(light);}
 
 function placard(lines:string[],pos:T.Vector3,width:number,height:number,rotation=0){
  const c=document.createElement('canvas');c.width=768;c.height=512;const g=c.getContext('2d')!;g.fillStyle='#cbbd97';g.fillRect(0,0,768,512);g.strokeStyle='#695b44';g.lineWidth=8;g.strokeRect(18,18,732,476);g.fillStyle='#302a21';g.font='bold 44px serif';lines.forEach((line,i)=>{g.fillText(line,48,90+i*75);});
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map,roughness:1}));mesh.position.copy(pos);mesh.rotation.y=rotation;room.add(mesh);return mesh;
 }
 placard(['彼岸祭 · 축제 안내','전승관  →  북쪽 골목','중앙 신사 · 집합 장소','2015년 / 준비 중'],new T.Vector3(-2.5,1.6,-4.33),2,1.3);
 placard(['01 · 손으로 엮은 기억','대나무 바구니 / 마을 공예','전시 준비 중'],new T.Vector3(-4.15,1.8,1.2),1.5,1.05,Math.PI/2);
 placard(['02 · 축제의 옷감','접힌 천과 남겨진 이름','전시 준비 중'],new T.Vector3(4.15,1.8,1.2),1.5,1.05,-Math.PI/2);
 const state=new MoriInvestigation();
 const shrinePlay=await createShrineStoryPlay(scene,physics,height);
 const hokoraBuild=buildHokoraSite(scene,physics,height);await hokoraBuild.ready;
 const panel=document.createElement('section');panel.style.cssText='position:fixed;bottom:42px;left:20px;z-index:130;width:min(440px,90vw);background:#101a18ef;color:#efe8d5;padding:16px;white-space:pre-line;border:1px solid #706651;border-radius:6px;font:14px/1.6 system-ui';
 const title=document.createElement('strong'),text=document.createElement('p'),action=document.createElement('button'),journal=document.createElement('button');panel.append(title,text,action,journal);document.body.append(panel);
 action.style.cssText=journal.style.cssText='padding:9px 13px;margin-right:8px;background:#38483c;color:#fff;border:1px solid #81917a;cursor:pointer';journal.textContent='발견한 기록';
 const fade=document.createElement('div');fade.style.cssText='position:fixed;inset:0;pointer-events:none;background:#050706;opacity:0;transition:opacity .22s;z-index:180';document.body.append(fade);
 const props=new T.Group();scene.add(props);props.visible=false;
 const mat=new T.MeshStandardMaterial({color:0x554737,roughness:.9}),paper=new T.MeshStandardMaterial({color:0xc5baa0,roughness:.9});
 function box(p:T.Vector3,size:number[],material=mat){const m=new T.Mesh(new T.BoxGeometry(...size as [number,number,number]),material);m.position.copy(p);props.add(m);return m;}
 type Target={id:MoriTrace|'guide'|'exhibit';p:T.Vector3;label:string;description:string};
 const targets:Target[]=[
  {id:'tv',p:new T.Vector3(2.8,800,-2.65),label:'반복되는 방송',description:'2015년 피안제 · 18:12. 방송은 같은 장면으로 되돌아간다. 화면 속 내 뒤로 누군가 지나갔는데… 돌아보면 아무도 없다.'},
  {id:'guide',p:new T.Vector3(-1.6,800,-2.8),label:'축제 안내도',description:'전시 준비용 안내도다. 피안제 집합 장소에 「중앙 신사」가 표시되어 있다. 사라진 사람들도 거기로 갔을까? 아직 마을의 다른 흔적을 확인해야 한다.'},
  {id:'exhibit',p:new T.Vector3(-1.4,800,.7),label:'준비하다 만 전시',description:'바구니와 천에는 전시 번호표가 붙어 있다. 접다 만 종이 장식이 남아 있지만, 아직 사건을 설명해 줄 기록은 없다.'},
  {id:'tea',p:point(6.6,-5.1),label:'따뜻한 찻잔',description:'입술 자국이 남은 찻잔에서 김이 난다. 문은 안쪽에서 잠겨 있다. 전승관 TV 소리 외에는 대답이 없다.'},
  {id:'geta',p:point(6.8,6.8),label:'젖은 게다',description:'물자국은 문 안쪽으로 이어진다. 밖으로 나온 발자국은 없다.'},
  {id:'bell',p:point(7.1,-9),label:'기울어진 풍경',description:'바람은 멎었는데 풍경은 집 안쪽으로 기운다. 아래 쪽지에는 「대답하지 마」라고 적혀 있다.'},
  {id:'alley',p:point(8.8,11),label:'골목의 맨발 자국',description:'골목 끝에 서 있던 사람이 사라졌다. 맨발 자국은 마을 쪽을 향하지만, 다가오거나 돌아간 자국이 없다.'},
 ];
 const tea=targets.find(t=>t.id==='tea')!.p;box(tea.clone().add(new T.Vector3(0,.37,0)),[.85,.12,.5]);for(const dx of [-.32,.32])box(tea.clone().add(new T.Vector3(dx,.17,0)),[.08,.34,.35]);
 const cup=new T.Mesh(new T.CylinderGeometry(.06,.045,.10,12,1,true),paper);cup.position.copy(tea).y+=.48;props.add(cup);
 const steam=new T.Mesh(new T.PlaneGeometry(.11,.25),new T.MeshBasicMaterial({color:0xddd9cb,transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false}));steam.position.copy(tea).y+=.68;props.add(steam);
 const geta=targets.find(t=>t.id==='geta')!.p;for(const dx of [-.12,.12]){box(geta.clone().add(new T.Vector3(dx,.06,0)),[.16,.08,.28]);box(geta.clone().add(new T.Vector3(dx,.11,0)),[.12,.025,.035],paper);}
 const wet=new T.MeshStandardMaterial({color:0x242c29,roughness:.2});for(let i=0;i<5;i++)box(geta.clone().add(new T.Vector3((i%2)*.2,.013,-.35-i*.2)),[.11,.012,.19],wet);
 const bp=targets.find(t=>t.id==='bell')!.p;box(bp.clone().add(new T.Vector3(0,1.3,0)),[.055,2.6,.055]);const chime=new T.Mesh(new T.SphereGeometry(.10,12,8),paper);chime.position.copy(bp).y+=2.15;props.add(chime);const tag=box(bp.clone().add(new T.Vector3(0,1.85,.06)),[.09,.28,.012],paper);
 const ap=targets.find(t=>t.id==='alley')!.p;for(const dx of [-.1,.1])box(ap.clone().add(new T.Vector3(dx,.013,0)),[.09,.012,.22],wet);
 const figure=new T.Group();figure.add(new T.Mesh(new T.CylinderGeometry(.15,.25,1.15,8),new T.MeshBasicMaterial({color:0x171a18})));figure.children[0]!.position.y=.8;const head=new T.Mesh(new T.SphereGeometry(.15,10,8),new T.MeshBasicMaterial({color:0x171a18}));head.position.y=1.53;figure.add(head);figure.position.copy(ap);props.add(figure);
 let enabled=false,inRoom=false,transition=false,position=outside,move:(p:T.Vector3,target:T.Vector3)=>void=()=>{},time=0,tvTime=0,holdText=0,bellFired=false,alleyGone=false;
 let pendingTV=false;
 let audio:AudioContext|undefined,noise:AudioBufferSourceNode|undefined,gain:GainNode|undefined;
 function unlockAudio(){if(!audio){audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate);const d=buffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=(Math.random()-.5)*.25;noise=audio.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=audio.createBiquadFilter();filter.type='bandpass';filter.frequency.value=850;gain=audio.createGain();gain.gain.value=0;noise.connect(filter).connect(gain).connect(audio.destination);noise.start();}void audio.resume();}
 function ring(){if(!audio)return;for(const f of [220,337,521]){const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;g.gain.setValueAtTime(.018,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+3);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+3);}}
 const near=(p:T.Vector3,r=1.8)=>Math.abs(p.y-position.y)<2&&Math.hypot(p.x-position.x,p.z-position.z)<r;
 const nearest=()=>targets.find(t=>near(t.p)&&(!['tv','guide'].includes(t.id)||(inRoom&&position.z<-2.35)));
 const door=()=>inRoom?near(inside,1.7):near(outside,2.5);
 function tell(message:string){text.textContent=message;holdText=9;}
 function travel(){if(transition)return;transition=true;fade.style.opacity='1';setTimeout(()=>{inRoom=!inRoom;room.visible=inRoom;move(inRoom?inside:outside,inRoom?new T.Vector3(0,800,-2):point(9,0));fade.style.opacity='0';transition=false;tell(inRoom?'TV 소리는 관리 공간에서 들린다. 전시대 사이를 지나 안쪽을 확인하자.':'중앙 신사로 향하기 전에 마을에 남은 흔적을 확인하자.');},240);}
 function interact(){if(!enabled||transition)return;unlockAudio();if(!inRoom&&shrinePlay.near(position)){tell(shrinePlay.interact(position,state.ready));return;}if(door()){travel();return;}const target=nearest();if(!target)return;
  if(target.id==='guide')state.guideRead=true;else if(target.id==='tv'){tvTime=7;pendingTV=true;tell('2015년 피안제 · 18:12. 같은 방송이 되풀이된다. 화면을 조금 더 보자.');return;}else if(target.id!=='exhibit'){state.discover(target.id);}
  tell(target.description);if(state.ready&&!bellFired){bellFired=true;ring();tell(target.description+'\n'+state.conclusion+' 멀리 신사에서 종이 한 번 울린다.');}
 }
 window.addEventListener('pointerdown',unlockAudio,{once:true});window.addEventListener('keydown',unlockAudio,{once:true});
 action.onclick=()=>{interact();action.blur();};journal.onclick=()=>{unlockAudio();tell(targets.filter(t=>state.found.has(t.id as MoriTrace)).map(t=>`${t.label}: ${t.description}`).join('\n')||'아직 조사한 흔적이 없다.');journal.blur();};
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#0e1716';ctx.fillRect(0,0,512,128);ctx.fillStyle='#d0dcb7';ctx.font='25px serif';ctx.fillText('2015 피안제  ·  18:12',20,43);ctx.font='20px serif';ctx.fillText('금일 피안제는 예정대로 진행됩니다',20,87);const captionMap=new T.CanvasTexture(canvas);captionMap.colorSpace=T.SRGBColorSpace;
 const rt=new T.WebGLRenderTarget(384,256);rt.texture.colorSpace=T.SRGBColorSpace;const display=new T.Mesh(new T.PlaneGeometry(.74,.50),new T.MeshBasicMaterial({map:rt.texture}));display.position.set(2.8,1.25,-3.473);room.add(display);
 const caption=new T.Mesh(new T.PlaneGeometry(.74,.185),new T.MeshBasicMaterial({map:captionMap}));caption.position.set(2.8,1.095,-3.469);room.add(caption);
 const tvCam=new T.PerspectiveCamera(65,1.5,.1,18);tvCam.position.set(2.8,801.55,-3.35);tvCam.lookAt(0,801,4);
 const ghost=figure.clone();scene.add(ghost);ghost.visible=false;let capture=0;
 const layout=await (await fetch('/data/ogimachi/story-layout.json')).json();const shrine=layout.sites.find((s:{id:string})=>s.id==='shrine');const shrinePos=new T.Vector3(shrine.position[0],height(...shrine.position as [number,number]),shrine.position[1]);
 const nextSite=layout.sites.find((s:{id:string})=>s.id==='hokora');const nextPos=nextSite?new T.Vector3(nextSite.position[0],height(...nextSite.position as [number,number]),nextSite.position[1]):null;
 return {spawn:outside,state,get invitationAccepted(){return shrinePlay.quest.accepted;},get inside(){return inRoom;},get locked(){return transition;},get active(){return enabled;},get atShrine(){return state.ready&&!inRoom&&near(shrinePos,10);},interact,
 bind(getPosition:()=>T.Vector3,relocate:typeof move){position=getPosition();move=relocate;},
 start(){enabled=true;panel.hidden=false;tell('ACT 4 · 사람을 찾아야 한다. 전승관 안에서 TV 소리가 들린다.');if(new URLSearchParams(location.search).get('siteplay')==='shrine'){if(import.meta.env.DEV&&new URLSearchParams(location.search).get('moriInspect')==='shrine'){for(const id of ['tea','tv','geta'] as const)state.discover(id);move(shrinePlay.spawn.clone().add(new T.Vector3(1.6,0,-3.4)),shrinePos);}else move(shrinePlay.spawn,shrinePos);tell('중앙 신사 · 마을 흔적 세 곳을 조사해야 석판의 목표가 열린다.');}if(import.meta.env.DEV&&new URLSearchParams(location.search).get('moriInspect')==='tv'){inRoom=true;room.visible=true;move(new T.Vector3(2.8,800.03,-2.75),new T.Vector3(2.8,801.25,-3.5));}},
 reset(){inRoom=false;room.visible=false;const shrineStart=new URLSearchParams(location.search).get('siteplay')==='shrine';move(shrineStart?shrinePlay.spawn:outside,shrineStart?shrinePos:point(4,0));},
 update(dt:number){panel.hidden=!enabled;props.visible=enabled;if(!enabled)return;time+=dt;hokoraBuild.update(dt);if(pendingTV&&(!inRoom||!near(targets[0]!.p,2.2))){pendingTV=false;tvTime=0;tell('TV에서 멀어져 조사를 멈췄다.');}tvTime=Math.max(0,tvTime-dt);if(pendingTV&&tvTime<=1){pendingTV=false;state.discover('tv');tell(targets[0]!.description);if(state.ready&&!bellFired){bellFired=true;ring();tell(targets[0]!.description+' '+state.conclusion+' 멀리 종소리가 들린다.');}}holdText=Math.max(0,holdText-dt);capture-=dt;
  if(!inRoom&&near(ap,4))alleyGone=true;figure.visible=!alleyGone&&!inRoom;tag.rotation.x=.18+Math.sin(time*2)*.08;steam.material.opacity=.09+Math.sin(time*1.5)*.035;
  if(gain&&audio)gain.gain.setTargetAtTime(inRoom?.10:Math.max(0,1-position.distanceTo(outside)/24)*.075,audio.currentTime,.2);
  const target=nearest();action.hidden=!door()&&!target;action.textContent=door()?(inRoom?'E · 밖으로 나가기':'E · TV 소리가 들리는 전승관으로'):`E · ${target?.label??'조사'}`;
  title.textContent=`ACT 4 · 사라지기 직전의 흔적 ${Math.min(3,state.found.size)}/3${state.ready?' · 신사로 향하기':''}`;
  if(!holdText)text.textContent=state.ready?(inRoom?'밖으로 나가 중앙 신사로 향하자.':`중앙 신사까지 ${Math.round(position.distanceTo(shrinePos))}m · ${position.z>shrinePos.z?'북쪽':'남쪽'} 골목으로 이동`):inRoom?'전시대 사이를 지나 TV와 축제 안내도를 확인하세요.':`전승관 입구까지 ${Math.round(position.distanceTo(outside))}m · ${position.z>outside.z?'북쪽':'남쪽'}. TV와 골목의 생활 흔적을 찾아보세요.`;
  if(shrinePlay.quest.accepted&&!inRoom){title.textContent='일곱 공물을 찾아라 0/7';if(!holdText&&nextPos)text.textContent=`첫 번째 장소: 작은 사당까지 ${Math.round(position.distanceTo(nextPos))}m · ${position.z>nextPos.z?'북쪽':'남쪽'} 길을 확인하자.`;}
  if(!inRoom&&shrinePlay.near(position)){const view=shrinePlay.view(position,state.ready);title.textContent=view.title;if(!holdText)text.textContent=view.text;action.hidden=!view.action;action.textContent=view.action??'';}
 },
 renderTV(renderer:T.WebGLRenderer,actor:T.Object3D){if(!enabled||!inRoom||capture>0)return;capture=.2;const actorVisible=actor.visible;actor.visible=true;const previous=renderer.getRenderTarget();const xr=renderer.xr.enabled;display.visible=false;caption.visible=false;
  const away=position.clone().sub(tvCam.position).setY(0).normalize();ghost.position.copy(position).addScaledVector(away,1.7);ghost.position.y=800;ghost.position.x+=Math.sin(tvTime*1.2)*.65;ghost.visible=tvTime>1&&tvTime<6;
  try{renderer.xr.enabled=false;renderer.setRenderTarget(rt);renderer.render(scene,tvCam);}finally{actor.visible=actorVisible;renderer.setRenderTarget(previous);renderer.xr.enabled=xr;display.visible=true;caption.visible=true;ghost.visible=false;}
 },
 };
}
