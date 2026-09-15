import * as T from 'three';
import {applyGroundSurface,sharedGroundNoise} from './groundSurface';
import {sharedGroundWear} from './groundWear';
import {terrainOverlay} from './terrainOverlay';
import type {SurveyData,SurveyPoint} from './survey';
import {roadWidth} from './roadGeometry';

export const LEGACY_GROUND_BOUNDS={minX:-111,maxX:-27,minZ:-114,maxZ:10};
/** Include mapped side lanes, including segments crossing the patch with both ends outside. */
export function legacyPathSampler(data:SurveyData){
  const bounds=LEGACY_GROUND_BOUNDS;
  const segments=data.roads.filter(r=>!r.bridge).flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i]!,b,
    halfWidth:r.id===1268046903?1.5:roadWidth(r)/2,edgeHalfWidth:roadWidth(r)/2}))).filter(({a,b})=>
      Math.max(a[0],b[0])>=bounds.minX-8&&Math.min(a[0],b[0])<=bounds.maxX+8&&Math.max(a[1],b[1])>=bounds.minZ-8&&Math.min(a[1],b[1])<=bounds.maxZ+8);
  return (x:number,z:number)=>{
    let weight=0,edgeWeight=0;
    for(const {a,b,halfWidth,edgeHalfWidth} of segments){
      const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;if(!length)continue;
      const t=T.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/length,0,1),distance=Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
      weight=Math.max(weight,1-T.MathUtils.smoothstep(distance,halfWidth,halfWidth+1.2));
      edgeWeight=Math.max(edgeWeight,1-T.MathUtils.smoothstep(distance,edgeHalfWidth,edgeHalfWidth+.5));
    }return {weight,edgeWeight};
  };
}
function sampledLift(x:number,z:number,edgeWeight:number){return T.MathUtils.lerp(T.MathUtils.lerp(.02,.12,edgeWeight),.20,T.MathUtils.smoothstep(legacyGroundInset(x,z),0,3));}
export function legacyGroundInset(x:number,z:number){const b=LEGACY_GROUND_BOUNDS;return Math.min(x-b.minX,b.maxX-x,z-b.minZ,b.maxZ-z);}
export function legacyGroundLift(x:number,z:number,roadDistance:number,roadHalfWidth:number){
  const edgeHeight=T.MathUtils.lerp(.02,.12,1-T.MathUtils.smoothstep(roadDistance,roadHalfWidth,roadHalfWidth+.5));
  return T.MathUtils.lerp(edgeHeight,.20,T.MathUtils.smoothstep(legacyGroundInset(x,z),0,3));
}
export function legacyGroundSupport(data:SurveyData,height:(x:number,z:number)=>number){
  const sample=legacyPathSampler(data);
  return (x:number,z:number)=>{
    if(legacyGroundInset(x,z)<0)return height(x,z);
    return height(x,z)+sampledLift(x,z,sample(x,z).edgeWeight);
  };
}
export function outsideLegacyGround(points:SurveyPoint[]):SurveyPoint[][]{
  const {minX,maxX,minZ,maxZ}=LEGACY_GROUND_BOUNDS,result:SurveyPoint[][]=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],cuts=[0,1];
    if(dx)for(const x of [minX,maxX]){const t=(x-a[0])/dx;if(t>0&&t<1)cuts.push(t);}
    if(dz)for(const z of [minZ,maxZ]){const t=(z-a[1])/dz;if(t>0&&t<1)cuts.push(t);}
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){const lo=cuts[j-1]!,hi=cuts[j]!,mid=(lo+hi)/2,x=a[0]+dx*mid,z=a[1]+dz*mid;
      if(hi-lo>1e-8&&(x<minX||x>maxX||z<minZ||z>maxZ)){
        const start:SurveyPoint=[a[0]+dx*lo,a[1]+dz*lo],end:SurveyPoint=[a[0]+dx*hi,a[1]+dz*hi],last=result.at(-1),tail=last?.at(-1);
        if(tail&&Math.hypot(tail[0]-start[0],tail[1]-start[1])<1e-7)last!.push(end);else result.push([start,end]);
      }
    }
  }return result;
}

export async function addLegacyGround(root:T.Group,data:SurveyData,height:(x:number,z:number)=>number){
  const loader=new T.TextureLoader();
  const [map,normalMap,armMap]=await Promise.all(['diff','nor_gl','arm'].map(k=>loader.loadAsync(`/textures/grass/aerial_grass_rock_${k}_1k.webp`)));
  for(const t of [map!,normalMap!,armMap!]){t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;}map!.colorSpace=T.SRGBColorSpace;
  // The street patch is the ground ACT 1 actually starts on — same procedural surface as the
  // survey terrain, and the same wear field, so the two meet without a change of material.
  const material=new T.MeshStandardMaterial({roughness:1,normalScale:new T.Vector2(.95,.95)});
  applyGroundSurface(material,{noise:sharedGroundNoise(),wear:sharedGroundWear(data),albedo:map!,normal:normalMap!,arm:armMap!,tile:4,exposure:.95});
  const source=new T.PlaneGeometry(84,124,84,124).rotateX(-Math.PI/2).translate(-69,0,-52);
  const geometry=terrainOverlay(source,height,.20);source.dispose();
  const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  const sample=legacyPathSampler(data);
  // The earth beside the lanes and around the houses used to be painted here, per vertex, on a 1 m
  // grid. The shared wear field does it from the same road data with a ragged edge — so this loop
  // now only places the surface, and the material owns how it looks.
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);uv.setXY(i,(x+100)/4,(z+100)/4);
    p.setY(i,height(x,z)+sampledLift(x,z,sample(x,z).edgeWeight));
  }
  geometry.computeVertexNormals();geometry.setAttribute('uv1',uv.clone());
  const mesh=new T.Mesh(geometry,material);mesh.name='act1-higasato-ground';mesh.receiveShadow=true;mesh.userData['walkSurface']=true;
  // Replace the street's stacked surface sheets, keeping authored props.
  for(const child of [...root.children])if(child instanceof T.Mesh&&(child.name.startsWith('act1-surface-')||child.name==='act1-road-dirt'||child.name==='act1-road-grass-shoulders')){child.removeFromParent();child.geometry.dispose();}
  root.add(mesh);
}
