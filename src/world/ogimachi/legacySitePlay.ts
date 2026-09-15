import {buildHokoraSite} from './hokoraSiteBuild';
import * as T from 'three';
import type {Physics} from '@/core/physics';
import {buildSchoolSite} from './schoolSiteBuild';
export async function createLegacySitePlay(scene:T.Scene,physics:Physics,height:(x:number,z:number)=>number,id:'school'|'hokora'){
 const response=await fetch('/data/ogimachi/story-layout.json');if(!response.ok)throw Error('장소 배치 로드 실패');
 const data=await response.json(),site=data.sites.find((s:{id:string})=>s.id===id);if(!site)throw Error('장소 없음');const [x,z]=site.position;
 const schoolBuild=id==='school'?await buildSchoolSite(scene,physics,height,{x,z}):null;
 const school=schoolBuild?.school??null;
 // The hall needs a level base; outdoor stones and props follow the actual terrain.
 const hokoraBuild=id==='hokora'?buildHokoraSite(scene,physics,height):null;
 const hokora=hokoraBuild?.hall??null;await hokoraBuild?.ready;
 hokora?.openDoor();
 const outside=school?schoolBuild!.spawn.clone():hokoraBuild!.spawn.clone();outside.y=height(outside.x,outside.z)+.03;
 const inside=school?new T.Vector3(school.bounds.minX+1.2,school.bounds.floorY+.03,z):new T.Vector3(x,hokora!.chaseArena.floorY+.03,z);
 const points=school?[
  {p:school.getabakoPos,label:'신발장',text:'신발장의 이름표와 남겨진 신발을 살펴봅니다.'},
  {p:school.journalPos,label:'교무일지',text:'교무일지의 기록을 살펴봅니다.'},
  {p:school.attendancePos,label:'출석부',text:'출석부의 지워진 칸을 살펴봅니다.'},
  {p:school.crayonPos,label:'크레용 그림',text:'준비실에 남은 그림과 이름의 흔적을 확인합니다.'},
  {p:school.deskNamePos,label:'책상 이름표',text:'책상 아래 남겨진 이름표를 확인합니다.'},
  {p:school.broadcastPos,label:'방송실',text:'방송실의 마이크와 장비를 확인합니다.'},
  {p:school.kushiPos,label:'빗',text:'교실에 남은 빗을 확인합니다.'},
 ]:[{p:hokora!.suzuPos,label:'제단',text:'제단의 방울과 봉헌물을 확인합니다.'},{p:hokora!.childMarkPos,label:'아이의 흔적',text:'사당에 남은 아이의 흔적을 확인합니다.'},...hokora!.wardPositions.map((p,i)=>({p,label:`금줄 ${i+1}`,text:'방울을 묶은 금줄과 에마를 확인합니다. 해제 순서와 추격은 다음 연결 단계입니다.'}))];
 const panel=document.createElement('div');panel.style.cssText='position:fixed;bottom:24px;left:20px;z-index:120;background:#17262eee;color:white;padding:14px;max-width:400px';
 const text=document.createElement('p');text.textContent=hokora?'참배길과 동쪽 계단으로 걸어 들어갈 수 있습니다. 제단·금줄 세 곳·아이 흔적의 배치를 확인하세요.':'출입·조사 연결 확인 구간 · 전체 액트 진행은 아직 연결 전입니다.';
 const enter=document.createElement('button'),inspect=document.createElement('button');panel.append(text,enter,inspect);document.body.append(panel);
 let position=outside,move:(p:T.Vector3,target:T.Vector3)=>void=()=>{},inRoom=false;
 enter.textContent=hokora?'실내 위치 확인':'건물 안으로 들어가기';enter.onclick=()=>{inRoom=!inRoom;move(inRoom?inside:outside,inRoom?points[0]!.p:inside);enter.textContent=inRoom?'밖으로 나가기':'건물 안으로 들어가기';enter.blur();};
 const near=()=>points.find(p=>Math.hypot(p.p.x-position.x,p.p.z-position.z)<1.8&&Math.abs(p.p.y-position.y)<2.5);
 const interact=()=>{const point=near();if(point){text.textContent=point.text;if(school&&point.label==='방송실')school.pulseBroadcast(3);}inspect.blur();};inspect.onclick=interact;
 return {spawn:outside,title:school?'폐교 · 출입과 조사':'사당 · 출입과 조사',interact,
 reset(){inRoom=false;enter.textContent=hokora?'실내 위치 확인':'건물 안으로 들어가기';move(outside,inside);},
 bind(getPosition:()=>T.Vector3,relocate:typeof move){position=getPosition();move=relocate;},
 update(dt:number){school?.update(dt);hokora?.update(dt);const point=near();inspect.disabled=!point;inspect.textContent=point?`E · ${point.label} 조사`:'조사할 물건 가까이 이동';},
 };
}
