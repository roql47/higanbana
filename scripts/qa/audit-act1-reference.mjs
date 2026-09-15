import {readFileSync,writeFileSync} from 'node:fs';
import {SurveyWorld} from '../../src/world/ogimachi/surveyWorld.ts';
import {SurveyHeightfield,surveyPoint} from '../../src/world/ogimachi/survey.ts';
import {FRONTAGE_REFERENCES} from '../../src/world/ogimachi/referenceCamera.ts';
const data=JSON.parse(readFileSync('public/data/ogimachi/survey.json'));
const bytes=readFileSync('public/data/ogimachi/dem.f32');
const heights=new SurveyHeightfield(data,new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)));
// Use the runtime height method without constructing a renderer or downloading assets.
const pads=new Map();
for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+3;for(let z=Math.floor((b.z-r)/40);z<=Math.floor((b.z+r)/40);z++)for(let x=Math.floor((b.x-r)/40);x<=Math.floor((b.x+r)/40);x++){const k=`${x},${z}`,v=pads.get(k)??[];v.push(b);pads.set(k,v);}}
const paddies=data.fields.filter(f=>f.kind==='rice-reviewed').map(f=>{const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);return {points:f.points,level:heights.sample(xs.reduce((a,b)=>a+b)/xs.length,zs.reduce((a,b)=>a+b)/zs.length),bounds:[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8]};});
const height=(x,z)=>SurveyWorld.prototype.height.call({heights,pads,paddies},x,z);
const out=[];
for(const [key,ref] of Object.entries(FRONTAGE_REFERENCES)){
 const [x,z]=surveyPoint(ref.lat,ref.lon,data.origin);
 for(const id of key==='b5'?[236248639]:key==='b4'?[586010787]:key==='b3'?[236248682]:key==='b2'?[236248655]:key==='b1'?[236248636]:key==='shop'?[236248652]:key==='a2'?[236248631,236248712]:[236248688,236248633]){
  const b=data.buildings.find(b=>b.id===id),c=Math.cos(b.angle),s=Math.sin(b.angle);
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,d])=>[b.x+c*a*b.width/2+s*d*b.depth/2,b.z-s*a*b.width/2+c*d*b.depth/2]);
  let distance=Infinity;
  // Perimeter distances without relying on corner ordering.
  const lx=c*(x-b.x)-s*(z-b.z),lz=s*(x-b.x)+c*(z-b.z);
  distance=Math.hypot(Math.max(Math.abs(lx)-b.width/2,0),Math.max(Math.abs(lz)-b.depth/2,0));
  out.push({view:key,id,camera:{x,z,ground:height(x,z),eye:height(x,z)+ref.height},buildingPad:b.height,groundMinusPad:height(x,z)-b.height,nearestEnvelope:distance,corners});
 }
}
writeFileSync('docs/ogimachi-reconstruction/03-camera-audit.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out.map(({corners,...r})=>r),null,2));
