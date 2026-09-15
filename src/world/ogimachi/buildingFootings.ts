import * as THREE from 'three';
import type {SurveyBuilding} from './survey';

/** Solid perimeter infill down to the rendered terrain, not the ideal pad height. */
export function buildingFooting(b:SurveyBuilding,ground:(x:number,z:number)=>number){
  // Survey dimensions include eaves; align infill with the wall/foundation line.
  const ratios:Record<string,[number,number]>={'irori-restaurant':[8.7/10.386,11.9/13.514],'irori-shop':[7.5/8.769,8.9/10.526]};
  const [rw,rd]=ratios[b.model]??[.84,.88];
  const w=b.width*rw/2,d=b.depth*rd/2,c=Math.cos(b.angle),s=Math.sin(b.angle);
  const corners=[[-w,-d],[w,-d],[w,d],[-w,d]];
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];let length=0,maxGap=0;
  for(let edge=0;edge<4;edge++){
    const a=corners[edge]!,end=corners[(edge+1)%4]!,distance=Math.hypot(end[0]!-a[0]!,end[1]!-a[1]!);
    const steps=Math.ceil(distance/.35);
    for(let i=0;i<=steps;i++){
      const t=i/steps,lx=a[0]!+(end[0]!-a[0]!)*t,lz=a[1]!+(end[1]!-a[1]!)*t;
      const x=b.x+c*lx+s*lz,z=b.z-s*lx+c*lz,top=b.height-.025,bottom=Math.min(top-.08,ground(x,z)-.12);
      maxGap=Math.max(maxGap,top-ground(x,z));
      const n=positions.length/3;positions.push(x,top,z,x,bottom,z);uv.push((length+distance*t)/1.5,top/1.5,(length+distance*t)/1.5,bottom/1.5);
      if(i)indices.push(n-2,n,n-1,n,n+1,n-1);
    }length+=distance;
  }
  if(maxGap<.035)return null;
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}
