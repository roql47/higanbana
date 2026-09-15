import {MathUtils} from 'three';
import type {SurveyBuilding} from './survey';
/** A neighbouring apron must never overwrite a building's own level footprint. */
export function buildingPadHeight(x:number,z:number,base:number,buildings:readonly SurveyBuilding[]){
  let selected:SurveyBuilding|undefined,best=Infinity,total=0,weighted=0,strongest=0;
  for(const b of buildings){
    const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
    const lx=c*dx-s*dz,lz=s*dx+c*dz;
    const edge=Math.max(Math.abs(lx)-b.width/2,Math.abs(lz)-b.depth/2);
    if(edge<=0&&(edge<best||(edge===best&&b.id<(selected?.id??Infinity)))){best=edge;selected=b;}
    // The authored entrance props sit on the restaurant's level forecourt.
    // Include a full terrain cell beyond them so interpolated triangles cannot bury their feet.
    const apron=b.model==='irori-restaurant'?Math.hypot(Math.max(-b.width/2-4-lx,0,lx),Math.max(Math.abs(lz)-b.depth/2-3,0)):edge;
    const range=b.model==='irori-restaurant'?4:2;
    if(edge>0&&apron<range){const fade=1-MathUtils.smoothstep(apron,0,range),w=fade/Math.max(.01,apron*apron);total+=w;weighted+=w*b.height;strongest=Math.max(strongest,fade);}
  }
  return selected?selected.height:total?MathUtils.lerp(base,weighted/total,strongest):base;
}
