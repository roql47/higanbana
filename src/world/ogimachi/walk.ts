import {createMoriStoryPlay} from './moriStoryPlay';
import {iroriDoor} from './iroriDoor';
import {createIdleFootContact} from './idleFootContact';
import * as THREE from 'three';
import { Physics } from '@/core/physics';
import { Input } from '@/core/input';
import { FrameClock } from '@/core/frameClock';
import { PlayRender } from './playRender';
import { CharacterController } from '@/character/controller';
import { CharacterModel } from '@/character/model';
import { CharacterAnimator } from '@/character/animator';
import { syncSkinnedPose } from '@/character/syncSkinnedPose';
import { MIO } from '@/character/config';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import type { SurveyWorld } from './surveyWorld';
import { addWalkColliders } from './walkPhysics';
import {ONSEN_ID} from './onsenStudy';
import {buildingPoint} from './streetStudy';
import {onsenDoor} from './onsenDoor';
import {relocateWalk} from './walkRelocation';

export async function startWalk(world: SurveyWorld, scene: THREE.Scene, renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight) {
  const playRender = new PlayRender(renderer, sun);
  const status = document.querySelector<HTMLElement>('#status')!;
  status.textContent = '미오와 이동용 지형을 준비하는 중…';
  const [physics, model] = await Promise.all([Physics.create(), CharacterModel.load(MIO, renderer)]);
  const wellMode=new URLSearchParams(location.search).get('well')==='1';
  const collision=addWalkColliders(physics, world.group, world.data);
  const well=wellMode?await (await import('./wellPlay')).createWellPlay(scene,physics,(x,z)=>collision.heightAt(x,z)??world.height(x,z)):null;
  const siteId=new URLSearchParams(location.search).get('siteplay');
  const mori=(siteId==='mori'||siteId==='shrine')?await createMoriStoryPlay(scene,physics,world,(x,z)=>collision.heightAt(x,z)??world.height(x,z)):null;
  const legacySite=siteId==='school'||siteId==='hokora'?await (await import('./legacySitePlay')).createLegacySitePlay(scene,physics,(x,z)=>collision.heightAt(x,z)??world.height(x,z),siteId):null;
  // Main street, outside the house footprints; start facing north along the village.
  const irori=new URLSearchParams(location.search).get('spawn')?.startsWith('irori')?world.data.buildings.find(b=>b.model==='irori-restaurant'):undefined;
  const iroriPoint=irori?buildingPoint(irori,new URLSearchParams(location.search).get('spawn')==='irori-inside'?-2.4:-6.5,0):null;
  const iroriSpawn=iroriPoint?new THREE.Vector3(iroriPoint[0],(collision.heightAt(...iroriPoint)??world.height(...iroriPoint))+.03,iroriPoint[1]):null;
  const spawn = mori?.spawn??legacySite?.spawn??well?.spawn??iroriSpawn??new THREE.Vector3(-65, world.height(-65, -45) + .4, -45);
  const spawnTarget=irori?new THREE.Vector3(irori.x,spawn.y,irori.z):spawn.clone().add(new THREE.Vector3(0,0,-1));
  const controller = new CharacterController(physics, spawn);
  // Calibration stops its reference action; idle state alone does not start playback.
  model.play('idle', 0);
  const animator = new CharacterAnimator(model);
  animator.idleVariations=!wellMode;
  const footContact=createIdleFootContact(model.root,(x,z)=>{
    if(!legacySite&&!mori)return collision.heightAt(x,z);
    const ray=new physics.R.Ray({x,y:controller.position.y+.25,z},{x:0,y:-1,z:0});
    const hit=physics.world.castRay(ray,1,true,undefined,undefined,undefined,controller.body);
    return hit?ray.origin.y-hit.timeOfImpact:null;
  });
  const inspectFeet=new URLSearchParams(location.search).has('feet');
  const footReadout=document.createElement('div');
  if(inspectFeet){footReadout.style.cssText='position:fixed;top:8px;left:8px;z-index:1000;background:#111d;color:white;padding:8px';document.body.append(footReadout);}
  const input = new Input(renderer.domElement);
  const follow = new ThirdPersonCamera(camera, physics, controller.body);
  follow.yaw = 0;well?.bind(controller,follow,()=>input.reset());
  if(irori)relocateWalk(controller,follow,spawn,spawnTarget);
  legacySite?.bind(()=>controller.position,(p,target)=>{relocateWalk(controller,follow,p,target);input.reset();});
  if(legacySite)legacySite.reset();
  mori?.bind(()=>controller.position,(p,target)=>{follow.setView(mori.inside?'first':'third');relocateWalk(controller,follow,p,target);input.reset();});mori?.start();
  scene.add(model.root);
  physics.step(1 / 60);
  model.update(0, controller);
  camera.far = 6500;
  camera.updateProjectionMatrix();
  document.body.classList.add('walking');
  document.querySelector('header h1')!.textContent = '오기마치 · 미오로 걸어보기';
  document.querySelector('header p')!.textContent = 'WASD 이동 · Shift 달리기 · Space 점프 · P 시점 전환 · R 시작점';
  const nav = document.querySelector('header nav')!;
  nav.replaceChildren();
  const overview = document.createElement('button');
  overview.textContent = '전경 보기';
  overview.onclick = () => { const url = new URL(location.href); url.searchParams.delete('play'); location.href = url.href; };
  const reset = document.createElement('button');
  const returnToStart = () => {
    if(mori)mori.reset();
    else if(legacySite)legacySite.reset();
    else if(well)well.reset();
    else relocateWalk(controller,follow,spawn,spawnTarget);
    input.reset();accumulator=0;jump=false;
  };
  reset.textContent = '시작점으로';
  reset.onclick = () => { returnToStart(); reset.blur(); };
  nav.append(overview, reset);
  for(const [id,label] of [['school','폐교에서 플레이'],['hokora','사당에서 플레이']]){const button=document.createElement('button');button.textContent=label!;button.onclick=()=>location.href=`/ogimachi.html?view=detail&play=1&siteplay=${id}`;nav.append(button);}
  if(legacySite)document.querySelector('header h1')!.textContent=legacySite.title;
  const onsen=world.data.buildings.find(b=>b.id===ONSEN_ID);
  const entrance=onsen?onsenDoor(world.group,onsen,collision.openOnsen):undefined;
  const restaurant=world.data.buildings.find(b=>b.model==='irori-restaurant');
  const restaurantDoor=restaurant?iroriDoor(world.group,restaurant,collision.blockIrori):undefined;
  const iroriButton=document.createElement('button');iroriButton.hidden=true;
  iroriButton.onclick=()=>{iroriButton.dataset.lastToggle=String(restaurantDoor?.toggle(controller.position));iroriButton.blur();};nav.append(iroriButton);
  const doorButton=document.createElement('button');doorButton.textContent='E · 온천 문 열기';doorButton.hidden=true;
  doorButton.onclick=()=>{entrance?.open(controller.position);doorButton.blur();};nav.append(doorButton);
  if(onsen&&!well&&!legacySite){
    const visit=document.createElement('button');visit.textContent='온천 앞에서 걷기';
    visit.onclick=()=>{
      const [x,z]=buildingPoint(onsen,-9.2,14);
      const [doorX,doorZ]=buildingPoint(onsen,-6.75,14);
      const position=new THREE.Vector3(x,(collision.heightAt(x,z)??world.height(x,z))+.4,z);
      relocateWalk(controller,follow,position,new THREE.Vector3(doorX,position.y,doorZ));
      input.reset();accumulator=0;jump=false;visit.blur();
    };
    nav.append(visit);
  }
  const story = document.createElement('button'); story.textContent = 'ACT 1부터 시작';
  story.onclick = () => { const url = new URL(location.href); url.searchParams.delete('well');url.searchParams.set('story', '1'); location.href = url.href; };
  nav.append(story);
  const note = document.createElement('span');
  note.textContent = '화면 클릭 후 둘러보기 · Esc 마우스 해제 · P 시점 전환 · 문 앞 E · 미닫이문 열기/닫기';
  if(well){note.textContent='WASD 이동 · E 조사/상호작용 · P 시점 전환 · R 우물 입구로 복귀';document.querySelector('header h1')!.textContent='공동우물 · 플레이 구간';}
  if(legacySite)note.textContent='WASD 이동 · E 조사 · 출입 버튼으로 안팎 이동 · R 시작점';
  const footer = document.querySelector('footer')!;
  for (const child of Array.from(footer.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes('드래그:')) child.textContent = '참조: ';
  }
  footer.prepend(note, document.createElement('br'));
  const frameClock = new FrameClock(performance.now());
  let accumulator = 0, elapsed = 0, frames = 0, jump = false;
  const step = 1 / 60;
  addEventListener('blur', () => { input.reset(); accumulator = 0; jump = false; });
  renderer.setAnimationLoop(now => {
    if (document.hidden) { frameClock.reset(now); accumulator = 0; input.reset(); return; }
    const raw = frameClock.sample(now, 60);
    if (raw === null) return;
    const dt = Math.min(raw, .1);
    if(input.justPressed('KeyE')){if(mori)mori.interact();else if(legacySite)legacySite.interact();else if(well)well.interact();else if(restaurantDoor?.near(controller.position))restaurantDoor.toggle(controller.position);else entrance?.open(controller.position);}
    well?.update(dt);legacySite?.update(dt);mori?.update(dt);
    entrance?.update(dt);
    iroriButton.dataset.leaves=String(restaurantDoor?.leafCount);iroriButton.dataset.progress=String(restaurantDoor?.progress);iroriButton.hidden=!restaurantDoor?.near(controller.position);iroriButton.textContent=restaurantDoor?.opening?'E · 이로리 문 닫기':'E · 이로리 문 열기';
    doorButton.hidden=!entrance||entrance.opened||!entrance.near(controller.position);
    if (input.justPressed('KeyR'))returnToStart();
    if (input.justPressed('KeyP')) follow.toggleView();
    jump ||= input.justPressed('Space');
    accumulator += dt;
    const axis = (well?.locked||mori?.locked)?{x:0,y:0}:input.moveAxis();
    for (let i = 0; accumulator >= step && i < 6; i++, accumulator -= step) {
      restaurantDoor?.update(step,controller.position);
      controller.update(step, { axis, cameraYaw: follow.headingYaw,
        walk: !(input.isDown('ShiftLeft') || input.isDown('ShiftRight')),
        jumpPressed: !well?.locked&&jump, jumpHeld: input.isDown('Space') });
      jump = false;
      physics.step(step);
    }
    if (controller.position.y < -150 || Math.max(Math.abs(controller.position.x), Math.abs(controller.position.z)) > 2250)returnToStart();
    animator.update(dt, controller);
    footContact.restore();
    model.update(dt, controller);
    if(controller.grounded&&controller.horizontalSpeed<.01&&animator.state==='idle')footContact.update();
    follow.update(dt, input.consumeMouseDelta(), input.consumeWheel(), controller.position, controller.horizontalSpeed, controller.grounded);
    model.root.visible = !follow.isFirstPerson;
    playRender.update(controller.position);
    if(world.updateDetail(camera))renderer.shadowMap.needsUpdate=true;
    syncSkinnedPose(model.root);
    mori?.renderTV(renderer,model.root);
    if(inspectFeet){
      const p=controller.position;
      camera.position.set(p.x+2.3,p.y+.45,p.z+.5);camera.lookAt(p.x,p.y+.13,p.z);camera.near=.03;camera.updateProjectionMatrix();
      document.querySelector('header')!.setAttribute('style','display:none');document.querySelector('footer')!.setAttribute('style','display:none');
      for(const el of Array.from(document.body.children))if(el instanceof HTMLDivElement&&el!==footReadout)el.style.visibility='hidden';
      footReadout.textContent='발 접지 · 측면 확인';
    }
    renderer.render(scene, camera);
    elapsed += raw; frames++;
    if (elapsed >= .75) {
      status.textContent = `${Math.round(frames / elapsed)} FPS · ${(elapsed * 1000 / frames).toFixed(1)} ms/프레임 · ${renderer.info.render.calls} draw calls\n${Math.round(renderer.info.render.triangles / 1000)}k triangles · ${controller.horizontalSpeed.toFixed(1)} m/s · ${follow.isFirstPerson ? '1인칭' : '3인칭'}`;
      elapsed = 0; frames = 0;
    }
    input.endFrame();
  });
}
