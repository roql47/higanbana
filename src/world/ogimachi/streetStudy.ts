import type {SurveyBuilding,SurveyPoint,SurveyRoad} from './survey';
import {massingSize} from './massing';
export const streetFronts:Record<string,{side:1|-1;road:number}>={
  hakusuien:{side:-1,road:1268046903},'irori-restaurant':{side:-1,road:1268046903},
  'irori-shop':{side:-1,road:1268046903},'mori-workshop':{side:1,road:1268046903},
};
export function buildingPoint(b:SurveyBuilding,x:number,z:number):SurveyPoint{
  const c=Math.cos(b.angle),s=Math.sin(b.angle);return [b.x+c*x+s*z,b.z-s*x+c*z];
}
/** Closest point on the near edge, preserving the mapped street centreline and width. */
export function streetEdge(p:SurveyPoint,road:SurveyRoad):SurveyPoint{
  let result:SurveyPoint=p,best=Infinity;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1]!,b=road.points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;if(!l)continue;
    const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)),x=a[0]+dx*t,z=a[1]+dz*t,d=Math.hypot(p[0]-x,p[1]-z);
    if(d<best){best=d;const r=Math.min(d,(road.width??6.2)/2);result=d>0?[x+(p[0]-x)*r/d,z+(p[1]-z)*r/d]:p;}
  }return result;
}
/** Estimated open forecourt from the observed facade to the street edge. */
export function frontageGeometry(b:SurveyBuilding,road:SurveyRoad,ground:(x:number,z:number)=>number){
  const front=streetFronts[b.model];if(!front)return {positions:[],indices:[]};
  const m=massingSize(b),rows=Math.ceil(m.bodyDepth),cols=8,positions:number[]=[],indices:number[]=[];
  for(let row=0;row<=rows;row++){
    const f=buildingPoint(b,front.side*m.bodyWidth/2,(row/rows-.5)*m.bodyDepth),edge=streetEdge(f,road);
    const roadY=ground(...edge)+.48,faceY=b.height+.08;
    for(let col=0;col<=cols;col++){const t=col/cols;positions.push(edge[0]+(f[0]-edge[0])*t,roadY+(faceY-roadY)*t,edge[1]+(f[1]-edge[1])*t);}
  }
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const a=row*(cols+1)+col,tri=[a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1];
    for(let j=0;j<6;j+=3){let [a,b,c]=tri.slice(j,j+3) as [number,number,number];
      const normalY=(positions[b*3+2]!-positions[a*3+2]!)*(positions[c*3]!-positions[a*3]!)-(positions[b*3]!-positions[a*3]!)*(positions[c*3+2]!-positions[a*3+2]!);
      if(normalY<0)[b,c]=[c,b];indices.push(a,b,c);
    }
  }return {positions,indices};
}
