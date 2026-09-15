import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {SurveyWorld} from './surveyWorld';
import {installVideoComparison} from './referenceCompare';
import {installPhotoReference} from './photoReference';
import {installIndividualReview} from './individualReview';
import {ONSEN_ID} from './onsenStudy';
import {buildingPoint} from './streetStudy';
import {surveyPoint} from './survey';
import {FRONTAGE_REFERENCES,verticalFov,referenceUrl} from './referenceCamera';

const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;document.body.append(renderer.domElement);
renderer.shadowMap.autoUpdate=false;
const scene=new THREE.Scene();scene.background=new THREE.Color(0xc5d0ce);scene.fog=new THREE.FogExp2(0xc5d0ce,.00068);
// A studio room reflection put white rectangular highlights across outdoor paddies.
// Use a low-frequency outdoor sky/ground hemisphere instead.
const skyPixels=new Uint8Array(64*32*4);
for(let y=0;y<32;y++)for(let x=0;x<64;x++){
  const t=y/31,color=new THREE.Color().lerpColors(new THREE.Color(0x8197a7),new THREE.Color(t<.55?0xc4d1ce:0x67745b),Math.min(1,t/.55));
  skyPixels.set([color.r*255,color.g*255,color.b*255,255],(y*64+x)*4);
}
const skyEnvironment=new THREE.DataTexture(skyPixels,64,32);skyEnvironment.mapping=THREE.EquirectangularReflectionMapping;skyEnvironment.needsUpdate=true;
const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(skyEnvironment).texture;scene.environmentIntensity=.4;skyEnvironment.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xd8edff,0x77724b,1.3));
const sun=new THREE.DirectionalLight(0xffefd4,2.3);sun.position.set(-250,550,-350);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-230,right:230,top:230,bottom:-230,near:1,far:1200});sun.shadow.bias=-.00035;scene.add(sun,sun.target);
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.15,6500),controls=new OrbitControls(camera,renderer.domElement);controls.maxDistance=4600;controls.minDistance=3;controls.maxPolarAngle=Math.PI*.495;controls.enableDamping=true;
const world=new SurveyWorld();scene.add(world.group);
installPhotoReference();
const walkButton=document.createElement('button');walkButton.textContent='미오로 걸어보기';
walkButton.onclick=()=>{const url=new URL(window.location.href);url.searchParams.delete('layout');url.searchParams.set('play','1');window.location.href=url.href;};
document.querySelector('header nav')!.prepend(walkButton);
const storyButton=document.createElement('button');storyButton.textContent='ACT 1부터 시작';
storyButton.onclick=()=>{const url=new URL(window.location.href);url.searchParams.delete('layout');url.searchParams.set('story','1');window.location.href=url.href;};
document.querySelector('header nav')!.prepend(storyButton);
let dirty=true;controls.addEventListener('change',()=>{dirty=true;});THREE.DefaultLoadingManager.onLoad=()=>{dirty=true;};
const view=(position:number[],target:number[])=>{referenceFov=null;referenceLink.hidden=true;camera.position.set(position[0]!,position[1]!,position[2]!);controls.target.set(target[0]!,target[1]!,target[2]!);sun.target.position.copy(controls.target);sun.position.copy(controls.target).add(new THREE.Vector3(-250,550,-350));renderer.shadowMap.needsUpdate=true;dirty=true;controls.update();};
const location=(x:number,z:number,y:number)=>[x,world.height(x,z)+y,z];
let referenceFov:number|null=null;
const referenceLink=document.createElement('a');referenceLink.textContent='기준 사진 열기';referenceLink.target='_blank';referenceLink.rel='noopener noreferrer';referenceLink.hidden=true;
function showReference(key:keyof typeof FRONTAGE_REFERENCES){
 const ref=FRONTAGE_REFERENCES[key], [x,z]=surveyPoint(ref.lat,ref.lon,world.data.origin),eye=world.height(x,z)+ref.height;
 controls.maxPolarAngle=Math.PI*.95;
 camera.fov=verticalFov(ref.hfov,camera.aspect);camera.updateProjectionMatrix();
 // Clear accumulated orbit damping before jumping to a reference pose.
 const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
 const heading=THREE.MathUtils.degToRad(ref.heading);
 view([x,eye,z],[x+35*Math.sin(heading),eye+35*Math.tan(THREE.MathUtils.degToRad(ref.pitch)),z-35*Math.cos(heading)]);
 controls.enableDamping=damping;referenceFov=ref.hfov;
 referenceLink.href=referenceUrl(ref);referenceLink.hidden=false;
 referenceLink.textContent=`기준 사진 · ${ref.date} · 시야각 ${ref.hfov}°`;
}
const referenceA1Button=document.createElement('button');referenceA1Button.textContent='원본 대조 A1';
referenceA1Button.onclick=()=>showReference('shop');
document.querySelector('header nav')!.append(referenceA1Button);
const warehouseReview=document.createElement('button');warehouseReview.textContent='원본 대조 A1 창고';
warehouseReview.onclick=()=>showReference('warehouses');
document.querySelector('header nav')!.append(warehouseReview,referenceLink);
const a2Review=document.createElement('button');a2Review.textContent='원본 대조 A2';a2Review.onclick=()=>showReference('a2');
document.querySelector('header nav')!.append(a2Review);
const b1Review=document.createElement('button');b1Review.textContent='원본 대조 B1';b1Review.onclick=()=>showReference('b1');
document.querySelector('header nav')!.append(b1Review);
const b2Review=document.createElement('button');b2Review.textContent='원본 대조 B2';b2Review.onclick=()=>showReference('b2');
document.querySelector('header nav')!.append(b2Review);
const b3Review=document.createElement('button');b3Review.textContent='원본 대조 B3';b3Review.onclick=()=>showReference('b3');
document.querySelector('header nav')!.append(b3Review);
const b4Review=document.createElement('button');b4Review.textContent='원본 대조 B4';b4Review.onclick=()=>showReference('b4');
document.querySelector('header nav')!.append(b4Review);
const b5Review=document.createElement('button');b5Review.textContent='원본 대조 B5';b5Review.onclick=()=>showReference('b5');
document.querySelector('header nav')!.append(b5Review);
const reviewUiToggle=document.createElement('button');reviewUiToggle.textContent='메뉴 숨기기';
Object.assign(reviewUiToggle.style,{position:'fixed',right:'12px',top:'12px',zIndex:'100',padding:'8px 12px'});
reviewUiToggle.onclick=()=>{
 const header=document.querySelector('header')!;
 header.hidden=!header.hidden;
 reviewUiToggle.textContent=header.hidden?'메뉴 보기':'메뉴 숨기기';
};
document.body.append(reviewUiToggle);
controls.addEventListener('start',()=>{referenceFov=null;referenceLink.hidden=true;});
const act1FrontageButton=document.createElement('button');act1FrontageButton.textContent='액트 1 거리';
act1FrontageButton.onclick=()=>{camera.fov=65;camera.updateProjectionMatrix();view(location(-49,-34,8),location(-84,-31,3));};
document.querySelector('header nav')!.append(act1FrontageButton);
const act1GroundButton=document.createElement('button');act1GroundButton.textContent='액트 1 길가';
act1GroundButton.onclick=()=>{camera.fov=65;camera.updateProjectionMatrix();view(location(-59,-33,1.7),location(-48,-31,1.0));};
document.querySelector('header nav')!.append(act1GroundButton);
const act1SidesButton=document.createElement('button');act1SidesButton.textContent='액트 1 양옆 건물';
act1SidesButton.onclick=()=>{camera.fov=65;camera.updateProjectionMatrix();view(location(-65,-28,14),location(-24,14,3));};
document.querySelector('header nav')!.append(act1SidesButton);
const act1NorthButton=document.createElement('button');act1NorthButton.textContent='북쪽 이어진 거리';
act1NorthButton.onclick=()=>{camera.fov=65;camera.updateProjectionMatrix();view(location(-60,-115,18),location(-90,-164,3));};
document.querySelector('header nav')!.append(act1NorthButton);
const junctionButton=document.createElement('button');junctionButton.textContent='북쪽 교차로 건물';
junctionButton.onclick=()=>{camera.fov=65;camera.updateProjectionMatrix();view(location(-120,-218,14),location(-73,-253,2));};
document.querySelector('header nav')!.append(junctionButton);
const rearButton=document.createElement('button');rearButton.textContent='교차로 뒤편 건물';
rearButton.onclick=()=>{camera.fov=65;camera.updateProjectionMatrix();view(location(-90,-248,17),location(-137,-280,3));};
document.querySelector('header nav')!.append(rearButton);
const onsenButton=document.createElement('button');onsenButton.textContent='B004 온천 입구';onsenButton.disabled=true;
onsenButton.onclick=()=>{
  const b=world.data.buildings.find(b=>b.id===ONSEN_ID)!;
  const eye=buildingPoint(b,-17,14),target=buildingPoint(b,-6.55,14);
  camera.fov=65;camera.updateProjectionMatrix();
  view([eye[0],Math.max(world.height(...eye),b.height)+2.2,eye[1]],[target[0],b.height+2.8,target[1]]);
};
document.querySelector('header nav')!.append(onsenButton);
const propButtons=new Map<string,HTMLButtonElement>();
for(const [key,label,name] of [['pot','화분 가까이 보기','Tripo-Blender-fern-pot'],['bench','벤치 가까이 보기','Blender-street-bench'],['bin','쓰레기통 가까이 보기','Blender-street-bin'],['noticeboard','안내판 가까이 보기','Blender-street-noticeboard'],['hydrant','소화전 가까이 보기','Blender-street-hydrant'],['lamp','가로등 가까이 보기','Blender-street-lamp']]){
  const button=document.createElement('button');button.textContent=label!;button.disabled=true;button.className='individual-house';
  button.onclick=()=>{
    const object=world.group.getObjectByName(name!);if(!object)return;
    const bounds=new THREE.Box3().setFromObject(object),center=bounds.getCenter(new THREE.Vector3());
    if(key==='lamp')center.y=bounds.max.y-.48;
    camera.fov=45;camera.updateProjectionMatrix();document.body.classList.add('individual-view');
    const distance=key==='pot'?2.1:3.0;
    view([center.x+(key==='pot'?distance:-distance),center.y+distance*.40,center.z+distance*.60],center.toArray());
  };
  propButtons.set(key!,button);document.querySelector('header nav')!.append(button);
}
installVideoComparison(time=>{
  camera.fov=time===16?44:52;camera.updateProjectionMatrix();
  if(time===16)view(location(30,-337,35),location(-5,100,3));
  else if(time===25)view(location(20,-200,22),location(15,-25,5));
  else view(location(-65,-45,2.1),location(-80,80,2));
},()=>{camera.fov=52;camera.updateProjectionMatrix();dirty=true;});
document.querySelector('#aerial')!.addEventListener('click',()=>{document.body.classList.remove('individual-view');view(location(30,-337,35),location(-5,100,3));});
document.querySelector('#density')!.addEventListener('click',()=>view(location(-165,-145,80),location(0,70,5)));
document.querySelector('#fields')!.addEventListener('click',()=>view(location(15,-180,18),location(25,-35,4)));
document.querySelector('#street')!.addEventListener('click',()=>view(location(-65,-45,2.1),location(-80,80,2)));
document.querySelector('#house')!.addEventListener('click',()=>view(location(-28,-38,11),location(0,0,6)));
document.querySelector('#river')!.addEventListener('click',()=>view(location(-280,-50,45),location(-120,120,3)));
document.querySelector('#slope')!.addEventListener('click',()=>view(location(100,-230,40),location(65,-70,3)));
document.querySelector('#plan')?.addEventListener('click',()=>view([0,950,-.01],[0,0,0]));
document.querySelector('#compare')?.addEventListener('click',event=>{const active=world.toggleSurvey();(event.currentTarget as HTMLButtonElement).textContent=active?'3D 건물 표시':'항공사진 대조';dirty=true;renderer.shadowMap.needsUpdate=true;});
view([30,145,-337],[-5,3,100]);
const status=document.querySelector('#status')!;let loaded=false;
world.ready.then(async()=>{
  world.captureWaterReflection(renderer,scene);loaded=true;dirty=true;renderer.shadowMap.needsUpdate=true;
  onsenButton.disabled=false;
  propButtons.get('pot')!.disabled=!world.group.getObjectByName('Tripo-Blender-fern-pot');
  propButtons.get('bench')!.disabled=!world.group.getObjectByName('Blender-street-bench');
  propButtons.get('bin')!.disabled=!world.group.getObjectByName('Blender-street-bin');
  propButtons.get('noticeboard')!.disabled=!world.group.getObjectByName('Blender-street-noticeboard');
  propButtons.get('hydrant')!.disabled=!world.group.getObjectByName('Blender-street-hydrant');
  propButtons.get('lamp')!.disabled=!world.group.getObjectByName('Blender-street-lamp');
  if(new URLSearchParams(window.location.search).get('layout')==='1'&&!new URLSearchParams(window.location.search).has('story')&&!new URLSearchParams(window.location.search).has('play')){
    const {installStoryLayoutReview}=await import('./storyLayoutReview');
    await installStoryLayoutReview(scene,(x,z)=>world.height(x,z),view,()=>{dirty=true;renderer.shadowMap.needsUpdate=true;});
  }
  if(new URLSearchParams(window.location.search).has('story')){
    loaded=false;renderer.setAnimationLoop(null);controls.enabled=false;
    const {startOgimachiStory}=await import('@/story/ogimachiStory');
    await startOgimachiStory(world,scene,renderer,camera,sun);
    return;
  }
  if(new URLSearchParams(window.location.search).get('play')==='1'){
    loaded=false;
    renderer.setAnimationLoop(null);
    controls.enabled=false;
    const {startWalk}=await import('./walk');
    await startWalk(world,scene,renderer,camera,sun);
    return;
  }
  installIndividualReview(world.data,id=>{
    const b=world.data.buildings.find(b=>b.id===id)!;document.body.classList.add('individual-view');camera.fov=48;camera.updateProjectionMatrix();
    if(id===236248644){camera.fov=60;camera.updateProjectionMatrix();const d=Math.max(25,11/(Math.tan(camera.fov*Math.PI/360)*camera.aspect));view([b.x+d*.96,b.height+8.7,b.z-d*.28],[b.x+2,b.height+3.8,b.z]);return;}
    const pair=id===236248710,distance=Math.max(28,(pair?14:13)/(Math.tan(camera.fov*Math.PI/360)*camera.aspect));view([b.x-distance*(pair?.72:1),b.height+(pair?16:7),b.z+distance*(pair?.78:.48)],[b.x-(pair?3:0),b.height+4.2,b.z-(pair?5:0)]);
  });
  if(new URLSearchParams(window.location.search).get('layout')==='1'){reviewUiToggle.click();}else document.querySelector<HTMLButtonElement>('#aerial')!.click();
  if(new URLSearchParams(window.location.search).get('building')==='onsen')onsenButton.click();
  const prop=new URLSearchParams(window.location.search).get('prop');if(prop)propButtons.get(prop)?.click();
  if(new URLSearchParams(window.location.search).get('building')==='mori'){
    const visit=document.createElement('button');visit.textContent='전승관 실내 · ACT 4 조사';visit.onclick=()=>window.location.href='/ogimachi.html?view=detail&play=1&siteplay=mori';document.querySelector('header nav')?.append(visit);
    const b=world.data.buildings.find(b=>b.model==='mori-workshop');
    if(b){
      const c=Math.cos(b.angle),s=Math.sin(b.angle);
      const point=(x:number,y:number,z:number):[number,number,number]=>[b.x+c*x+s*z,b.height+y,b.z-s*x+c*z];
      document.body.classList.add('individual-view');camera.fov=55;camera.updateProjectionMatrix();
      view(point(22,9,0),point(1,3.7,0));
    }
  }
  if(['irori','shop'].includes(new URLSearchParams(window.location.search).get('building')??'')){
    const shop=new URLSearchParams(window.location.search).get('building')==='shop';
    const b=world.data.buildings.find(b=>b.model===(shop?'irori-shop':'irori-restaurant'));
    if(b){
      const c=Math.cos(b.angle),s=Math.sin(b.angle);
      const point=(x:number,y:number,z:number):[number,number,number]=>[b.x+c*x+s*z,b.height+y,b.z-s*x+c*z];
      document.body.classList.add('individual-view');
      controls.maxPolarAngle=Math.PI*.95;
      camera.fov=shop?62:44;camera.updateProjectionMatrix();
      const exterior=shop&&new URLSearchParams(window.location.search).has('exterior');
      view(exterior?point(-12,4.8,8):shop?point(-.6,2.7,6.8):point(-17,3,-12),exterior?point(-3.4,3.5,0):shop?point(-.6,2.45,4.7):point(-3,3,-.5));
    }
  }
  const foundationId=Number(new URLSearchParams(window.location.search).get('foundation'));
  const foundation=world.data.buildings.find(b=>b.id===foundationId);
  if(foundation){
    const c=Math.cos(foundation.angle),s=Math.sin(foundation.angle);
    const point=(x:number,z:number)=>[foundation.x+c*x+s*z,foundation.z-s*x+c*z];
    const candidates=[...[3,5,7].flatMap(d=>[-1,1].flatMap(sx=>[-1,1].map(sz=>({
      target:point(sx*foundation.width/2,sz*foundation.depth/2),eye:point(sx*(foundation.width/2+d),sz*(foundation.depth/2+d)),
    }))))];
    const clear=candidates.find(({eye})=>world.data.buildings.every(b=>{
      const dx=eye[0]!-b.x,dz=eye[1]!-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
      return Math.abs(c*dx-s*dz)>b.width/2+1||Math.abs(s*dx+c*dz)>b.depth/2+1;
    }));
    const {target,eye}=clear??candidates[0]!;
    camera.fov=55;camera.updateProjectionMatrix();document.body.classList.add('individual-view');
    view([eye[0]!,Math.max(world.height(eye[0]!,eye[1]!),foundation.height)+2,eye[1]!],[target[0]!,foundation.height+.3,target[1]!]);
  }
}).catch(error=>{status.textContent=`모델 불러오기 실패: ${error.message}`;console.error(error);});
let previous=0;
renderer.setAnimationLoop(time=>{
  controls.update();if(dirty){if(world.updateDetail(camera))renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);dirty=false;}
  if(loaded&&time-previous>500){previous=time;status.textContent=`개별 제작: 백수원 · 이로리 · 전승관 / 뒷면 확인 중\n지도 건물 ${world.stats.houses}동 · 다른 가옥은 순차 제작 중\n${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles/1000).toFixed(0)}k triangles`;}
});
addEventListener('resize',()=>{
  const comparing=document.body.classList.contains('reference-open'),stacked=comparing&&innerWidth<900,width=comparing&&!stacked?innerWidth/2:innerWidth,height=comparing?Math.min(stacked?innerHeight/2-66:innerHeight,width*9/16):innerHeight;
  camera.aspect=width/height;if(referenceFov!==null)camera.fov=verticalFov(referenceFov,camera.aspect);camera.updateProjectionMatrix();renderer.setSize(width,height);renderer.domElement.style.position='fixed';renderer.domElement.style.right='0';renderer.domElement.style.top=`${stacked?innerHeight/2+42:comparing?(innerHeight-height)/2:0}px`;dirty=true;
});
