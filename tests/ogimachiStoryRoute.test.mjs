import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OgimachiStoryRoute} from '../src/story/ogimachiRoute.ts';
import {Act3} from '../src/story/act3.ts';
import {Vector3} from 'three';
const data=JSON.parse(readFileSync(new URL('../public/data/ogimachi/survey.json',import.meta.url)));
const main=data.roads.find(r=>r.id===1268046903);
const route=new OgimachiStoryRoute(main.points.slice(main.points.findIndex(p=>Math.abs(p[1]+3.117)<.1)),()=>0);
test('ACT 1 preserves 72 metres on the surveyed road and round-trips distance markers',()=>{
 assert.equal(route.sAtZ(14)-route.sAtZ(86),72);
 assert.ok(route.roadLength>100);
 for(let s=0;s<=100;s+=.5){const p=route.roadAt(s);assert.ok(Math.abs(route.nearestRoad(p.x,p.z).s-s)<1e-7);assert.ok(Math.abs(Math.hypot(p.dirX,p.dirZ)-1)<1e-7);}
});
test('run corridor avoids solid surveyed house footprints',()=>{
 for(let s=8;s<=80;s+=.25){const p=route.roadAt(s);for(const b of data.buildings){
  const dx=p.x-b.x,dz=p.z-b.z,c=Math.cos(b.angle),sn=Math.sin(b.angle);
  assert.ok(Math.abs(c*dx-sn*dz)>b.width/2+.5||Math.abs(sn*dx+c*dz)>b.depth/2+.5,`route hits building ${b.id} at ${s}`);
 }}
});
test('survey corner headings stay continuous for the close-up Sayo framing',()=>{
 let prior=route.roadAt(0);
 for(let s=.01;s<=80;s+=.01){
  const p=route.roadAt(s);
  assert.ok(Math.hypot(p.dirX-prior.dirX,p.dirZ-prior.dirZ)<.005);
  prior=p;
 }
});
test('route output buffer and nearest-road results cannot corrupt each other',()=>{
 const out={x:0,z:0,dirX:0,dirZ:0};assert.equal(route.roadAt(20,out),out);
 const nearest=route.nearestRoad(out.x,out.z);route.nearestRoad(999,999);assert.ok(Math.abs(nearest.s-20)<1e-7);
 assert.throws(()=>new OgimachiStoryRoute([],()=>0));
});
test('original ACT 3 completes on the new route and records one taboo violation',()=>{
 const p=route.roadAt(route.sAtZ(72));
 const lines=[];let violations=0,completed=0,stain=0;
 const act=new Act3({ground:route,
  tablet:{facePos:new Vector3(p.x+2.7,1.5,p.z),wipe(){},stainTo(v){stain=v;}},
  dialogue:{busy:false,say(line){lines.push(line.text);return Promise.resolve();}},
  sfx:{stoneWipe(){},callName(){},voice(){}},
  cam:{yaw:0,pull(yaw){this.yaw=yaw;},pullPitch(){},shake(){}},
  body:{position:new Vector3(p.x,0,p.z),yaw:0,horizontalSpeed:0},
  setDread(){},onViolate(){violations++;},onDone(){completed++;}
 });
 act.wipe(1);act.begin();assert.equal(act.controlsLocked,true);
 for(let i=0;i<2400;i++)act.update(1/60);
 assert.equal(violations,1);assert.equal(completed,1);assert.equal(stain,1);
 assert.equal(act.controlsLocked,false);
 assert.ok(lines.some(line=>line.includes('공물을')));
 assert.ok(lines.some(line=>line.includes('피안화가')));
 assert.ok(lines.some(line=>line.includes('죽은 자가')));
});
