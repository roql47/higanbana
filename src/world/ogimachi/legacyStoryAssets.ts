import {buildHokoraSite} from './hokoraSiteBuild';
import * as THREE from 'three';
import {Physics} from '@/core/physics';
import {Well} from '../higasato/blockouts';
import {Hokora} from '../higasato/hokora';
import {buildSchoolSite} from './schoolSiteBuild';
import {SITES} from '../higasato/ground';
/** Build existing complete assets at new coordinates; public interaction positions follow the same constructor origin. */
export async function loadLegacyStoryAssets(scene:THREE.Scene,height:(x:number,z:number)=>number,physics?:Physics){
 const data=await fetch('/data/ogimachi/story-layout.json').then(r=>{if(!r.ok)throw Error('스토리 배치 로드 실패');return r.json();});
 const at=(id:string)=>{const site=data.sites.find((s:{id:string})=>s.id===id);if(!site)throw Error('Missing site '+id);return {x:site.position[0] as number,z:site.position[1] as number};};
 const p=physics??await Physics.create(),h=at('hokora'),s=at('school'),w=at('well');
 const well=new Well(scene,p,{heightAt:()=>height(w.x,w.z)},w);await well.ready;
 const hokoraSite=buildHokoraSite(scene,p,height);await hokoraSite.ready;const hokora=hokoraSite.hall;
 const {school}=await buildSchoolSite(scene,p,height,s);
 return {well,hokora,school,physics:p,update(dt:number){well.update(dt);hokora.update(dt);school.update(dt);}};
}
