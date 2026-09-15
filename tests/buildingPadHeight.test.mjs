import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildingPadHeight} from '../src/world/ogimachi/buildingPadHeight.ts';
const a={id:1,x:0,z:0,width:10,depth:10,angle:0,height:4};
const b={...a,id:2,x:11,height:6};
test('neighbour apron cannot tilt a level building footprint, regardless of input order',()=>{
 for(const list of [[a,b],[b,a]]){
  assert.equal(buildingPadHeight(4.9,0,0,list),4);
  assert.equal(buildingPadHeight(6.1,0,0,list),6);
 }
});
test('isolated apron blends continuously to terrain and rotated footprints remain level',()=>{
 assert.equal(buildingPadHeight(5,0,0,[a]),4);
 assert.equal(buildingPadHeight(6,0,0,[a]),2);
 assert.equal(buildingPadHeight(7,0,0,[a]),0);
 const rotated={...a,width:4,depth:12,angle:Math.PI/2};
 assert.equal(buildingPadHeight(5,0,0,[rotated]),4);
});
test('neighbouring aprons meet building edges and each other without a height jump',()=>{
 let last=buildingPadHeight(5,0,0,[a,b]);
 for(let x=5.001;x<=6;x+=.001){const y=buildingPadHeight(x,0,0,[a,b]);assert.ok(Math.abs(y-last)<.02);last=y;}
 assert.ok(Math.abs(last-6)<.01);
});
test('survey building inset corners retain their own foundation elevation',()=>{
 const {buildings}=JSON.parse(readFileSync('public/data/ogimachi/survey.json','utf8'));
 for(const b of buildings)for(const a of [-1,1])for(const v of [-1,1]){
  const c=Math.cos(b.angle),s=Math.sin(b.angle),x=b.x+c*a*b.width*.49+s*v*b.depth*.49,z=b.z-s*a*b.width*.49+c*v*b.depth*.49;
  assert.ok(Math.abs(buildingPadHeight(x,z,b.height,buildings)-b.height)<.03,`foundation ${b.id}`);
 }
});
