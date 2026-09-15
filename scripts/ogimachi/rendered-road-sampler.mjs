import {SurveyWorld} from '../../src/world/ogimachi/SurveyWorld.ts';
import {roadStrip,roadWidth} from '../../src/world/ogimachi/roadGeometry.ts';
/** Reuse actual world height/triangle methods without loading textures or constructing a scene. */
export function renderedGround(data,heights){
 const world=Object.create(SurveyWorld.prototype);world.heights=heights;world.data=data;world.pads=new Map();
 world.paddies=data.fields.filter(f=>f.kind==='rice-reviewed').map(f=>{const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);return {points:f.points,level:heights.sample(xs.reduce((a,b)=>a+b)/xs.length,zs.reduce((a,b)=>a+b)/zs.length),bounds:[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8]};});
 for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+3;for(let z=Math.floor((b.z-r)/40);z<=Math.floor((b.z+r)/40);z++)for(let x=Math.floor((b.x-r)/40);x<=Math.floor((b.x+r)/40);x++){const key=`${x},${z}`,list=world.pads.get(key)??[];list.push(b);world.pads.set(key,list);}}
 return (x,z)=>world.ground(x,z);
}
export function renderedRoad(road,height){
 const mesh=roadStrip(road.points,roadWidth(road),height,road.bridge),triangles=[];
 for(let i=0;i<mesh.indices.length;i+=3)triangles.push(mesh.indices.slice(i,i+3).map(k=>mesh.positions.slice(k*3,k*3+3)));
 return (x,z)=>{for(const [a,b,c] of triangles){if(x<Math.min(a[0],b[0],c[0])-1e-6||x>Math.max(a[0],b[0],c[0])+1e-6||z<Math.min(a[2],b[2],c[2])-1e-6||z>Math.max(a[2],b[2],c[2])+1e-6)continue;const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;if(u>=-1e-6&&v>=-1e-6&&u+v<=1.000001)return a[1]*u+b[1]*v+c[1]*(1-u-v);}return height(x,z)+.12;};
}
