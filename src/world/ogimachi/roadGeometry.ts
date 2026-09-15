import type {SurveyPoint,SurveyRoad} from './survey';

/** Clips segments, never discards an entire mapped way because one end is outside. */
export function clipRoad(points:SurveyPoint[],min=-1800,max=1800):SurveyPoint[][] {
  const pieces:SurveyPoint[][]=[];let current:SurveyPoint[]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dz=b[1]-a[1];let lo=0,hi=1,valid=true;
    for(const [p,q] of [[-dx,a[0]-min],[dx,max-a[0]],[-dz,a[1]-min],[dz,max-a[1]]]){
      if(Math.abs(p!)<1e-12){if(q!<0)valid=false;continue;}
      const t=q!/p!;if(p!<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);
    }
    if(!valid||lo>hi){if(current.length>1)pieces.push(current);current=[];continue;}
    const start:SurveyPoint=[a[0]+lo*dx,a[1]+lo*dz],end:SurveyPoint=[a[0]+hi*dx,a[1]+hi*dz];
    if(Math.hypot(end[0]-start[0],end[1]-start[1])<1e-7)continue;
    if(current.length&&Math.hypot(current.at(-1)![0]-start[0],current.at(-1)![1]-start[1])>1e-6){pieces.push(current);current=[];}
    if(!current.length)current.push(start);current.push(end);
    if(hi<1){pieces.push(current);current=[];}
  }if(current.length>1)pieces.push(current);return pieces;
}
export function roadWidth(road:SurveyRoad){
  if(road.width&&road.width>0)return road.width;
  if(['path','footway','steps'].includes(road.kind))return 1.5;
  if(road.kind==='track')return 2.6;
  return ['trunk','primary','secondary'].includes(road.kind)?6.2:3.4;
}
export function roadSurface(road:SurveyRoad){
  if(road.surface==='wood')return 'wood';
  if(['sett','paving_stones','cobblestone'].includes(road.surface??''))return 'stone';
  if(['gravel','fine_gravel','ground','dirt','compacted'].includes(road.surface??''))return 'gravel';
  return ['path','footway','track','steps'].includes(road.kind)?'gravel':'asphalt';
}
/** Shared cross-sections form continuous bounded mitres at each surveyed corner. */
export function roadStrip(points:SurveyPoint[],width:number,height:(x:number,z:number)=>number,bridge=false){
  const samples:SurveyPoint[]=[];const lengths:number[]=[];let length=0;
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,distance=Math.hypot(b[0]-a[0],b[1]-a[1]);if(distance<1e-7)continue;
    const n=Math.ceil(distance/2);
    for(let j=0;j<n;j++){const t=j/n;samples.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);lengths.push(length+distance*t);}
    length+=distance;
  }
  if(!samples.length)return {positions:[],uv:[],indices:[],samples:[]};
  samples.push(points.at(-1)!);lengths.push(length);
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const start=height(...samples[0]!),end=height(...samples.at(-1)!);
  for(let i=0;i<samples.length;i++){
    const p=samples[i]!,before=samples[Math.max(0,i-1)]!,after=samples[Math.min(samples.length-1,i+1)]!;
    const normal=(a:SurveyPoint,b:SurveyPoint):SurveyPoint=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);return l?[-dz/l,dx/l]:[0,0];};
    const n1=i?normal(before,p):normal(p,after),n2=i===samples.length-1?n1:normal(p,after);
    let mx=n1[0]+n2[0],mz=n1[1]+n2[1],ml=Math.hypot(mx,mz);
    if(ml<1e-6){mx=n2[0];mz=n2[1];ml=1;}mx/=ml;mz/=ml;
    const half=Math.min(width*1.25,width/2/Math.max(.4,mx*n2[0]+mz*n2[1]));
    for(const side of [-1,1]){
      const x=p[0]+mx*half*side,z=p[1]+mz*half*side,y=bridge?start+(end-start)*lengths[i]!/length:height(x,z);
      positions.push(x,y+.12,z);uv.push(side<0?0:width/2,lengths[i]!/2);
    }
    if(i<samples.length-1){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  return {positions,uv,indices,samples};
}
