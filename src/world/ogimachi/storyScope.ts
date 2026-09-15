import {insideSurveyPolygon,type SurveyData,type SurveyPoint} from './survey';
export interface StoryRegion {type:'keep'|'delete';points:SurveyPoint[]}
/** Union of user polygons, including self-crossings under the editor's even-odd rule. */
export function inStoryScope(x:number,z:number,regions:StoryRegion[],margin=30){
  const near=(r:StoryRegion)=>insideSurveyPolygon(x,z,r.points)||r.points.some((a,i)=>{
    const b=r.points[(i+1)%r.points.length]!,dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<=margin;
  });
  return regions.some(r=>r.type==='keep'&&near(r))&&!regions.some(r=>r.type==='delete'&&insideSurveyPolygon(x,z,r.points));
}
export function applyStoryScope(data:SurveyData,regions:StoryRegion[]):SurveyData{
  if(!regions.some(r=>r.type==='keep'))return data;
  const roads:SurveyData['roads']=[];
  for(const road of data.roads){
    // Preserve the story parameterization and start-index contract in its entirety.
    if(road.id===1268046903){roads.push(road);continue;}
    let part:SurveyPoint[]=[];
    const flush=()=>{if(part.length>1)roads.push({...road,points:part});part=[];};
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1]!,b=road.points[i]!,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/5));
      for(let j=i===1?0:1;j<=n;j++){const p:SurveyPoint=[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n];if(inStoryScope(...p,regions))part.push(p);else flush();}
    }flush();
  }
  return {...data,buildings:data.buildings.filter(b=>inStoryScope(b.x,b.z,regions,30+Math.hypot(b.width,b.depth)/2)),fields:data.fields.filter(f=>f.points.some(p=>inStoryScope(...p,regions))),roads};
}
