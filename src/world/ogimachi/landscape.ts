import {insideSurveyPolygon,type SurveyData,type SurveyPoint,type SurveyBuilding} from './survey';
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*(3-2*t);};
export function edgeDistance(x:number,z:number,points:SurveyPoint[]){let best=Infinity;
  for(let i=1;i<=points.length;i++){const a=points[i-1]!,b=points[i%points.length]!,dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz,t=length?clamp(((x-a[0])*dx+(z-a[1])*dz)/length):0;best=Math.min(best,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}return best;
}
export interface Terrace{id:number|string;points:SurveyPoint[];level:number;bounds:number[]}
export class LandscapeLayout{
  readonly terraces:Terrace[]=[];private pads=new Map<string,SurveyBuilding[]>();
  constructor(readonly data:SurveyData,readonly sample:(x:number,z:number)=>number){
    for(const f of data.fields.filter(f=>f.kind==='rice-reviewed')){
      const unique=f.points.slice(0,f.points.at(-1)![0]===f.points[0]![0]&&f.points.at(-1)![1]===f.points[0]![1]?-1:undefined);
      const levels=unique.map(([x,z])=>sample(x,z)).sort((a,b)=>a-b),xs=unique.map(p=>p[0]),zs=unique.map(p=>p[1]);
      this.terraces.push({id:f.id,points:f.points,level:levels[Math.floor(levels.length/2)]!,bounds:[Math.min(...xs)-4,Math.max(...xs)+4,Math.min(...zs)-4,Math.max(...zs)+4]});
    }
    for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+15;
      for(let x=Math.floor((b.x-r)/64);x<=Math.floor((b.x+r)/64);x++)for(let z=Math.floor((b.z-r)/64);z<=Math.floor((b.z+r)/64);z++){const key=`${x},${z}`,list=this.pads.get(key)??[];list.push(b);this.pads.set(key,list);}
    }
  }
  height(x:number,z:number,base=this.sample(x,z)){
    let y=base,nearest=Infinity,near:Terrace|undefined;
    for(const t of this.terraces){if(x<t.bounds[0]!||x>t.bounds[1]!||z<t.bounds[2]!||z>t.bounds[3]!)continue;
      if(insideSurveyPolygon(x,z,t.points)){y=t.level;near=undefined;break;}
      const d=edgeDistance(x,z,t.points);if(d<nearest){nearest=d;near=t;}
    }
    if(near&&nearest<4)y=near.level+(y-near.level)*smooth(nearest/4);
    for(const b of this.pads.get(`${Math.floor(x/64)},${Math.floor(z/64)}`)??[]){const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);
      const edge=Math.max(Math.abs(c*dx-s*dz)-b.width*.445,Math.abs(s*dx+c*dz)-b.depth*.455);
      if(edge<3)y=b.height+(y-b.height)*smooth(edge/3);
    }return y;
  }
  /** Keep supporting triangles below the exact parcel surface, including their edge vertices. */
  belowTerraces(x:number,z:number,y:number,margin:number){
    for(const t of this.terraces){const reach=margin+4;
      if(x<t.bounds[0]!-reach||x>t.bounds[1]!+reach||z<t.bounds[2]!-reach||z>t.bounds[3]!+reach)continue;
      const distance=insideSurveyPolygon(x,z,t.points)?0:edgeDistance(x,z,t.points);
      if(distance<reach){const lowered=Math.min(y,t.level-.2);y=lowered+(y-lowered)*smooth((distance-margin)/4);}
    }return y;
  }
  clearForCanopy(x:number,z:number,r:number){
    for(const b of this.pads.get(`${Math.floor(x/64)},${Math.floor(z/64)}`)??[]){const dx=x-b.x,dz=z-b.z,c=Math.cos(b.angle),s=Math.sin(b.angle);if(Math.abs(c*dx-s*dz)<b.width/2+r+2&&Math.abs(s*dx+c*dz)<b.depth/2+r+2)return false;}
    for(const f of this.data.fields){const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);if(x<Math.min(...xs)-r||x>Math.max(...xs)+r||z<Math.min(...zs)-r||z>Math.max(...zs)+r)continue;if(insideSurveyPolygon(x,z,f.points)||edgeDistance(x,z,f.points)<r+1)return false;}
    for(const road of this.data.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1]!,b=road.points[i]!;if(x<Math.min(a[0],b[0])-r-7||x>Math.max(a[0],b[0])+r+7||z<Math.min(a[1],b[1])-r-7||z>Math.max(a[1],b[1])+r+7)continue;if(edgeDistance(x,z,[a,b])<r+(road.width??3.4)/2+1)return false;}
    return true;
  }
}
export function forestCover(x:number,z:number,data:SurveyData,pixels:Uint8Array,width:number,height:number){
  const p=data.photo,u=(x-p.minX)/(p.maxX-p.minX),v=(z-p.minZ)/(p.maxZ-p.minZ);if(u<0||v<0||u>=1||v>=1)return 0;
  return pixels[Math.min(height-1,Math.floor(v*height))*width+Math.min(width-1,Math.floor(u*width))]!/255;
}
