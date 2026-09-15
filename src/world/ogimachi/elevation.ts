import {ALL_BUILDINGS,FIELDS,PATHS,RIVER,TRIBUTARY,pointInPolygon,lineDistance,terraceDistance,type VillageLot,type VillagePath,type FieldPlot} from './plan';

const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
/** Authored relative elevation, not a surveyed DEM: subtle terrace tilt and an eastern rise. */
export function villageGrade(x:number,z:number){
  return 5.8+z*.0035+3.8*smooth(-15,225,x)+.18*Math.sin(z*.011)*Math.cos(x*.012);
}
export const waterHeight=(z:number)=>.15+z*.0015;
export function buildingHeight(lot:VillageLot){
  const parent='parentId' in lot?ALL_BUILDINGS.find(h=>h.id===lot.parentId):undefined;
  return villageGrade((parent??lot).x,(parent??lot).z);
}
interface Pad {lot:VillageLot;y:number}
interface FieldLevel {field:FieldPlot;y:number}
interface RoadSample {x:number;z:number;y:number;s:number}
let pads:Map<string,Pad[]>|undefined,fields:Map<string,FieldLevel[]>,roads:Map<string,{a:RoadSample;b:RoadSample;width:number;bridge:boolean}[]>,profiles:Map<string,RoadSample[]>,levels:Map<string,number>;
const cell=32,key=(x:number,z:number)=>`${Math.floor(x/cell)}:${Math.floor(z/cell)}`;
function insert<T>(grid:Map<string,T[]>,item:T,x0:number,z0:number,x1:number,z1:number){
  for(let x=Math.floor(x0/cell);x<=Math.floor(x1/cell);x++)for(let z=Math.floor(z0/cell);z<=Math.floor(z1/cell);z++){const k=`${x}:${z}`,items=grid.get(k)??[];items.push(item);grid.set(k,items);}
}
function ensure(){
  if(pads)return;pads=new Map();fields=new Map();roads=new Map();profiles=new Map();levels=new Map();
  for(const lot of ALL_BUILDINGS)insert(pads,{lot,y:buildingHeight(lot)},lot.x-lot.width/2-12,lot.z-lot.depth/2-12,lot.x+lot.width/2+12,lot.z+lot.depth/2+12);
  const aggregates=new Map<string,{sum:number;count:number}>();
  for(const f of FIELDS){const id=f.parcelId??f.id,a=aggregates.get(id)??{sum:0,count:0};for(const p of f.corners){a.sum+=villageGrade(...p);a.count++;}aggregates.set(id,a);}
  for(const [id,a] of aggregates)levels.set(id,Math.round(a.sum/a.count*4)/4);
  for(const field of FIELDS){const xs=field.corners.map(p=>p[0]),zs=field.corners.map(p=>p[1]);insert(fields,{field,y:levels.get(field.parcelId??field.id)!},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));}
  for(const path of PATHS){
    const samples:RoadSample[]=[];let distance=0;
    for(let i=1;i<path.points.length;i++){const a=path.points[i-1]!,b=path.points[i]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.ceil(length/2);for(let j=i===1?0:1;j<=n;j++){const t=j/n,x=mix(a[0],b[0],t),z=mix(a[1],b[1],t),crossing=lineDistance(x,z,RIVER)<45||lineDistance(x,z,TRIBUTARY)<18;samples.push({x,z,y:crossing?villageGrade(x,z):rawGround(x,z),s:distance+length*t});}distance+=length;}
    // Cut/fill a graded track, retaining gentler main streets and slightly steeper footpaths.
    const grade=path.width>=5?.065:.10;
    for(let pass=0;pass<3;pass++){
      for(let i=1;i<samples.length;i++){const a=samples[i-1]!,b=samples[i]!,limit=(b.s-a.s)*grade;b.y=Math.max(a.y-limit,Math.min(a.y+limit,b.y));}
      for(let i=samples.length-2;i>=0;i--){const a=samples[i]!,b=samples[i+1]!,limit=(b.s-a.s)*grade;a.y=Math.max(b.y-limit,Math.min(b.y+limit,a.y));}
    }
    if(path.id==='river-bridge-road')for(const s of samples)s.y=Math.max(s.y,6.2);
    profiles.set(path.id,samples);
    for(let i=1;i<samples.length;i++){const a=samples[i-1]!,b=samples[i]!,radius=path.width/2+8;insert(roads,{a,b,width:path.width,bridge:path.id==='river-bridge-road'},Math.min(a.x,b.x)-radius,Math.min(a.z,b.z)-radius,Math.max(a.x,b.x)+radius,Math.max(a.z,b.z)+radius);}
  }
}
export function fieldHeight(f:FieldPlot){ensure();return levels.get(f.parcelId??f.id)!;}
function padAt(x:number,z:number){
  let nearest:Pad|undefined,best=Infinity;
  for(const pad of pads!.get(key(x,z))??[]){const h=pad.lot,dx=Math.max(0,Math.abs(x-h.x)-h.width/2-.35),dz=Math.max(0,Math.abs(z-h.z)-h.depth/2-.35),d=Math.hypot(dx,dz);if(d<best){best=d;nearest=pad;}}
  return {pad:nearest,distance:best};
}
function rawGround(x:number,z:number){
  const edge=terraceDistance(x,z),low=villageGrade(x,z);
  let y=low+smooth(8,460,edge)*(205+45*Math.sin(z*.003)+31*Math.cos(x*.004-z*.002));
  const {pad,distance}=padAt(x,z);
  if(pad)y=mix(pad.y,y,smooth(0,10,distance));
  for(const {field,y:height} of fields.get(key(x,z))??[])if(pointInPolygon(x,z,field.corners)){y=height;break;}
  const ratio=Math.min(lineDistance(x,z,RIVER)/18,lineDistance(x,z,TRIBUTARY)/7.5);
  if(ratio<2.5&&(!pad||distance>1))y=mix(waterHeight(z)-1.2,y,smooth(.9,2.5,ratio));
  return y;
}
export function terrainElevation(x:number,z:number){
  ensure();const {pad,distance}=padAt(x,z);if(pad&&distance===0)return pad.y;
  let y=rawGround(x,z),best=Infinity,roadY=y,roadWidth=0;
  if(lineDistance(x,z,RIVER)<28||lineDistance(x,z,TRIBUTARY)<11)return y;
  for(const {a,b,width,bridge} of roads.get(key(x,z))??[]){
    // A bridge deck must not turn the channel underneath it into a terrain dam.
    if(bridge&&lineDistance(x,z,RIVER)<28)continue;
    const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);if(d<best){best=d;roadY=mix(a.y,b.y,t);roadWidth=width;}}
  if(best<roadWidth/2+8)y=mix(roadY,y,smooth(roadWidth/2+.6,roadWidth/2+8,best));
  if(pad&&distance<2)y=mix(pad.y,y,smooth(0,2,distance));
  return y;
}
export function roadHeight(path:VillagePath,x:number,z:number){
  ensure();let best=Infinity,y=0;const samples=profiles.get(path.id)!;
  for(let i=1;i<samples.length;i++){const a=samples[i-1]!,b=samples[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-a.x-dx*t,z-a.z-dz*t);if(d<best){best=d;y=mix(a.y,b.y,t);}}return y;
}
export function roadProfile(path:VillagePath){ensure();return profiles.get(path.id)!;}
