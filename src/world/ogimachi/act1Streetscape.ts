import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {roadStrip,roadWidth} from './roadGeometry';
import {terrainOverlay} from './terrainOverlay';
import {STREET_POT_POSITIONS} from './streetPot';
import {insideSurveyPolygon,type SurveyData} from './survey';

export const ACT1_ROAD_WIDTH = 3;

export type StreetMaterials=Record<'asphalt'|'concrete'|'pavers'|'gravel'|'grass'|'metal'|'wood'|'paint'|'rust'|'leaf'|'soil'|'water'|'clay',THREE.MeshStandardMaterial>;
export async function loadStreetMaterials():Promise<StreetMaterials>{
 const loader=new THREE.TextureLoader();
 const detailed=async(name:string,color:number)=>{
  const [map,normalMap,roughnessMap]=await Promise.all(['color','normal','rough'].map(k=>loader.loadAsync(`/textures/ogimachi/act1/${name}-${k}.webp`)));
  for(const t of [map!,normalMap!,roughnessMap!]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;}
  map!.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({map,normalMap,roughnessMap,color,roughness:1,normalScale:new THREE.Vector2(.45,.45)});
 };
 const [concrete,pavers,gravelMap,grassMap]=await Promise.all([detailed('concrete',0xc8c9bf),detailed('pavers',0xc0c4bc),loader.loadAsync('/textures/ogimachi/packed-gravel.webp'),loader.loadAsync('/textures/ogimachi/act1/grass-color.webp')]);
 for(const t of [gravelMap,grassMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;}
 const solid=(color:number,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness});
 const grass=new THREE.MeshStandardMaterial({map:grassMap,bumpMap:grassMap,bumpScale:.035,color:0xffffff,roughness:1});
 return {asphalt:solid(0x71766f),concrete,pavers,gravel:new THREE.MeshStandardMaterial({map:gravelMap,bumpMap:gravelMap,bumpScale:.028,color:0xada58c,roughness:1}),grass,metal:solid(0x343b37,.7),wood:solid(0x66513a),paint:solid(0xc1c1a8),rust:solid(0x834f34),leaf:solid(0x4d6532),soil:new THREE.MeshStandardMaterial({map:gravelMap,bumpMap:gravelMap,bumpScale:.045,color:0xb89a72,roughness:1}),water:solid(0x35453c,.18),clay:solid(0x785744)};
}

/** Static, metre-scale dressing. Surface and prop collision metadata is read once by Rapier. */
export function buildAct1Streetscape(data:SurveyData,height:(x:number,z:number)=>number,m:StreetMaterials,support=(x:number,z:number)=>height(x,z)+.19,authoredBenches=false,authoredPots=false,authoredBins=false,authoredNoticeboards=false,authoredHydrant=false,authoredLamps=false){
 const root=new THREE.Group();root.name='act1-complete-streetscape';
 const parts=new Map<THREE.Material,THREE.BufferGeometry[]>();
 const counts:Record<string,number>={};
 const count=(name:string)=>{counts[name]=(counts[name]??0)+1;};
 const put=(geo:THREE.BufferGeometry,mat:THREE.Material)=>{const list=parts.get(mat)??[];if(geo.index){const expanded=geo.toNonIndexed();geo.dispose();geo=expanded;}list.push(geo);parts.set(mat,list);};
 const base=support;
 const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,yaw=0)=>{
  put(new THREE.BoxGeometry(w,h,d).rotateY(yaw).translate(x,y,z),mat);
 };
 const cylinder=(x:number,y:number,z:number,top:number,bottom:number,h:number,mat:THREE.Material,segments=10)=>put(new THREE.CylinderGeometry(top,bottom,h,segments).translate(x,y,z),mat);
 const beam=(a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material)=>{
  const delta=b.clone().sub(a),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  put(new THREE.CylinderGeometry(r,r,delta.length(),6).applyQuaternion(q).translate(...a.clone().add(b).multiplyScalar(.5).toArray()),mat);
 };
 const collider=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0)=>{
  const node=new THREE.Object3D();node.name=`COL_ACT1_${name}`;node.position.set(x,y,z);node.rotation.y=yaw;node.userData['collisionBox']=[w,h,d];root.add(node);
 };
 const floor=(name:string,geo:THREE.BufferGeometry,mat:THREE.Material,walk=true,keepUV=false)=>{
  const p=geo.getAttribute('position'),uv=geo.getAttribute('uv');
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);p.setY(i,height(x,z)+.13);if(!keepUV)uv.setXY(i,x/(mat===m.pavers?.8:2),z/(mat===m.pavers?.8:2));}
  const conformed=terrainOverlay(geo,height,.18);geo.dispose();const mesh=new THREE.Mesh(conformed,mat);mesh.name=`act1-surface-${name}`;mesh.receiveShadow=true;mesh.userData['walkSurface']=walk;root.add(mesh);count('surfaces');return mesh;
 };
 const patch=(name:string,x:number,z:number,w:number,d:number,mat:THREE.Material,walk=true)=>floor(name,new THREE.PlaneGeometry(w,d,Math.ceil(w),Math.ceil(d)).rotateX(-Math.PI/2).translate(x,0,z),mat,walk);
 const road=data.roads.find(r=>r.id===1268046903)!;
 const roadX=(z:number)=>{
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1]!,b=road.points[i]!;if(z>=Math.min(a[1],b[1])&&z<=Math.max(a[1],b[1]))return a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]);}
  return -60;
 };
 const half=ACT1_ROAD_WIDTH/2;
 // Main road follows exactly the existing source ribbon, including bends.
 const start=road.points.findIndex(p=>Math.abs(p[1]+3.117)<.1);
 const routePoints=road.points.slice(start,start+4);
 // Cover the old wide asphalt ribbon with a grass verge, then draw the narrower dirt path.
 // Both use the original height function so this visual change cannot step the player vertically.
 const shoulder=roadStrip(routePoints,road.width??6.2,height);
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(shoulder.positions,3));sg.setAttribute('uv',new THREE.Float32BufferAttribute(shoulder.uv,2));sg.setIndex(shoulder.indices);sg.computeVertexNormals();
 const sm=m.soil;
 const shoulders=new THREE.Mesh(terrainOverlay(sg,height,.14),sm);sg.dispose();shoulders.name='act1-road-grass-shoulders';shoulders.receiveShadow=true;shoulders.userData['walkSurface']=true;root.add(shoulders);
 const strip=roadStrip(routePoints,ACT1_ROAD_WIDTH,height);
 const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(strip.positions,3));rg.setAttribute('uv',new THREE.Float32BufferAttribute(strip.uv,2));rg.setIndex(strip.indices);rg.computeVertexNormals();
 // Overlay shares its original collision geometry; polygon offset avoids a second raised road.
 const rm=m.soil.clone();
 const mainRoad=new THREE.Mesh(terrainOverlay(rg,height,.16),rm);rg.dispose();mainRoad.name='act1-road-dirt';mainRoad.receiveShadow=true;mainRoad.userData['walkSurface']=true;root.add(mainRoad);
 // Compacted-earth forecourt: irregular west edge follows the five mapped building envelopes.
 const parking=new THREE.PlaneGeometry(1,1,26,78).rotateX(-Math.PI/2),pp=parking.getAttribute('position');
 for(let i=0;i<pp.count;i++){const u=pp.getX(i)+.5,z=-90+(pp.getZ(i)+.5)*78,left=THREE.MathUtils.lerp(-92,-77,THREE.MathUtils.smoothstep(z,-51,-41));pp.setXYZ(i,THREE.MathUtils.lerp(left,roadX(z)-half-.8,u),0,z);}
 floor('west-parking',parking,m.soil);
 // Shop threshold and Hakusuien gravel apron; footprints and openings stay clear.
 patch('south-shop-earth',-64.7,-6.0,3.5,17,m.soil);
 patch('hakusuien-earth',-55.5,-63,7,24,m.soil);
 // Replace aerial ground in the near-camera east verge, with a source-shaped green patch.
 const verge=new THREE.PlaneGeometry(1,1,24,41).rotateX(-Math.PI/2),vp=verge.getAttribute('position');
 for(let i=0;i<vp.count;i++){const u=vp.getX(i)+.5,z=-51+(vp.getZ(i)+.5)*41;vp.setXYZ(i,THREE.MathUtils.lerp(roadX(z)+half+1.2,-35,u),0,z);}
 const vi=verge.index!,keep:number[]=[];
 for(let i=0;i<vi.count;i+=3){const ids=[vi.getX(i),vi.getX(i+1),vi.getX(i+2)],x=ids.reduce((v,j)=>v+vp.getX(j),0)/3,z=ids.reduce((v,j)=>v+vp.getZ(j),0)/3;
  if(!data.fields.some(f=>insideSurveyPolygon(x,z,f.points)))keep.push(...ids);
 }
 verge.setIndex(keep);floor('east-green-verge',verge,m.grass,false);
 // Unpaved village lane: no paving strips, kerbs, grates or parking stops.
 // Portable steel A barriers, seen along the west forecourt; no obstacle enters the road.
 for(const z of [-20,-24,-28,-32,-57,-62,-67,-72]){
  const x=roadX(z)-half-1.5,y=base(x,z),w=1.45;
  for(const end of [-1,1]){
   const zz=z+end*w/2;beam(new THREE.Vector3(x-.34,y,zz),new THREE.Vector3(x,y+.79,zz),.028,m.rust);beam(new THREE.Vector3(x+.34,y,zz),new THREE.Vector3(x,y+.79,zz),.028,m.rust);
   box(x,y+.045,zz,.9,.09,.16,m.concrete);
  }
  for(const h of [.36,.73])beam(new THREE.Vector3(x,y+h,z-w/2),new THREE.Vector3(x,y+h,z+w/2),.026,m.rust);
  box(x,y+.46,z,.045,.22,.8,m.paint);collider('parking-barrier',x,y+.43,z,.60,.86,1.55);count('barriers');
 }
 // Small traffic cones at the parking edge, visible in the source photograph.
 for(const z of [-23,-60]){const x=roadX(z)-half-1.1,y=base(x,z);box(x,y+.025,z,.34,.05,.34,m.metal);cylinder(x,y+.28,z,.025,.15,.52,m.rust);cylinder(x,y+.30,z,.076,.098,.10,m.paint);count('cones');}
 // Low post-and-rail fence around the observed east green frontage, with two access gaps.
 for(let z=-47;z<-12;z+=2.5){
  if(z>-30&&z<-25)continue;
  const x=roadX(z)+half+1.18,y=base(x,z);
  const nz=z+2.35,nx=roadX(nz)+half+1.18,ny=base(nx,nz);
  const blocksSideLane=data.roads.some(r=>r.id!==road.id&&!r.bridge&&r.points.slice(1).some((b,i)=>{
   const a=r.points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;if(!length)return false;
   return [0,.25,.5,.75,1].some(f=>{
    const px=x+(nx-x)*f,pz=z+(nz-z)*f,t=THREE.MathUtils.clamp(((px-a[0])*dx+(pz-a[1])*dz)/length,0,1);
    return Math.hypot(px-a[0]-dx*t,pz-a[1]-dz*t)<roadWidth(r)/2+.45;
   });
  }));
  if(blocksSideLane)continue;
  box(x,y+.26,z,.13,.52,.13,m.wood);
  beam(new THREE.Vector3(x,y+.33,z),new THREE.Vector3(nx,ny+.33,nz),.05,m.wood);
  // Match the slanted rail instead of placing a north/south box beside it.
  const length=Math.hypot(nx-x,nz-z),yaw=Math.atan2(nx-x,nz-z);
  collider('low-fence',(x+nx)/2,(y+ny)/2+.27,(z+nz)/2,.18,.54+Math.abs(ny-y),length,yaw);count('fenceBays');
 }
 const sign=(x:number,z:number,w:number,h:number)=>{
  const y=base(x,z);if(!authoredNoticeboards){for(const dz of [-w*.36,w*.36])box(x,y+.78,z+dz,.07,1.56,.07,m.wood);
  box(x,y+1.25,z,.09,h,w,m.wood);
  for(const side of [-1,1])for(let i=0;i<5;i++)box(x+side*.052,y+1.45-i*.09,z,.009,.022,w*.70,m.paint);
  }
  collider('noticeboard',x,y+.8,z,.16,1.6,w);count('noticeboards');
 };
 sign(-54.5,-30,1.0,.74);sign(roadX(-17)+half+1.3,-17,.65,.82);
 // Fire hydrant on a concrete plinth beside the noticeboard.
 {const x=-54.9,z=-33,y=base(x,z);if(!authoredHydrant){box(x,y+.18,z,.52,.36,.52,m.concrete);cylinder(x,y+.62,z,.10,.13,.53,m.metal);cylinder(x,y+.91,z,.045,.14,.12,m.metal);beam(new THREE.Vector3(x-.24,y+.65,z),new THREE.Vector3(x+.24,y+.65,z),.075,m.metal);}collider('hydrant',x,y+.45,z,.56,.9,.56);count('hydrants');}
 // Source utility/lamp poles. Static lamps do not add extra realtime shadow passes.
 for(const [x,z] of [[-54,-28],[-68,-84]]){
  const y=base(x!,z!);if(!authoredLamps)cylinder(x!,y+3.3,z!,.075,.12,6.6,m.concrete);collider('pole',x!,y+3.3,z!,.25,6.6,.25);
  if(!authoredLamps){beam(new THREE.Vector3(x!,y+6.1,z!),new THREE.Vector3(x!+.6,y+6.2,z!),.035,m.metal);
  cylinder(x!+.63,y+6.13,z!,.18,.10,.15,m.paint);}count('lampPoles');
 }
 // Entrance benches, pots and a pair of refuse bins outside circulation lanes.
 const bench=(x:number,z:number)=>{
  const feet=[-.61,.61].map(dz=>({z:z+dz,y:base(x,z+dz)}));
  const seat=Math.max(...feet.map(p=>p.y))+.46;
  if(!authoredBenches){
    for(let k=0;k<4;k++)box(x-.23+k*.15,seat,z,.12,.08,1.7,m.wood);
    for(const foot of feet){const h=seat-foot.y;box(x,(seat+foot.y)/2,foot.z,.5,h,.09,m.metal);}
  }
  const bottom=Math.min(...feet.map(p=>p.y));collider('bench',x,(bottom+seat+.04)/2,z,.65,seat+.04-bottom,1.8);count('benches');
 };
 bench(-51.3,-69);bench(-51.2,-57);bench(-65,-8);
 for(const [x,z] of STREET_POT_POSITIONS){
  if(authoredPots){count('pots');continue;}
  const y=base(x!,z!);cylinder(x!,y+.22,z!,.25,.17,.44,m.clay);cylinder(x!,y+.43,z!,.22,.22,.025,m.soil);count('pots');
  for(let k=0;k<11;k++){const a=k*2.399;beam(new THREE.Vector3(x!,y+.43,z!),new THREE.Vector3(x!+Math.cos(a)*.22,y+.65+(k%3)*.07,z!+Math.sin(a)*.22),.012,m.leaf);}
 }
 for(const z of [-71,-71.65]){const x=-50.9,y=base(x,z);if(!authoredBins){box(x,y+.40,z,.48,.80,.48,m.metal);box(x,y+.83,z,.53,.07,.53,m.wood);}collider('bin',x,y+.44,z,.55,.88,.55);count('bins');}
 // Seeded verge tufts and shrubs, concentrated away from the road and entrances.
 let seed=90210;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const blades:number[]=[];
 for(let i=0;i<950;i++){
  const z=-49+random()*38,x=roadX(z)+half+1.7+random()*10;
  if(x>-36||z>-30&&z<-25||data.buildings.some(b=>Math.hypot(b.x-x,b.z-z)<Math.max(b.width,b.depth)/2+1))continue;
  const y=base(x,z),h=.08+random()*.12,w=.006+random()*.007;
  blades.push(x-w,y,z,x+w,y,z,x+.05,y+h,z+.015);count('grassTufts');
 }
 const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(blades,3));bg.setAttribute('uv',new THREE.Float32BufferAttribute(new Array(blades.length/3*2).fill(0),2));bg.computeVertexNormals();bg.setIndex(Array.from({length:blades.length/3},(_,i)=>i));const bladeMaterial=m.leaf.clone();bladeMaterial.color.set(0x81974e);bladeMaterial.side=THREE.DoubleSide;const grassBlades=new THREE.Mesh(bg,bladeMaterial);grassBlades.name='act1-verge-grass';grassBlades.receiveShadow=true;root.add(grassBlades);
 for(const [x,z] of [[-40,-28],[-38,-36],[-40,-43],[-48,-48]]){
  const y=base(x!,z!);
  for(let k=0;k<90;k++){
   const a=random()*Math.PI*2,r=Math.sqrt(random())*.72,px=x!+Math.cos(a)*r,pz=z!+Math.sin(a)*r,py=y+.12+random()*.75*(1-r*.5);
   const g=new THREE.IcosahedronGeometry(.10+random()*.12,0);g.scale(1,.7,1);g.translate(px,py,pz);put(g,m.leaf);
   if(k%18===0)beam(new THREE.Vector3(x!,y,z!),new THREE.Vector3(px,py,pz),.014,m.wood);
  }count('shrubs');
 }
 for(const [mat,geos] of parts){if(!geos.length)continue;const g=mergeGeometries(geos)!;const mesh=new THREE.Mesh(g,mat);mesh.name='act1-static-props';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);geos.forEach(g=>g.dispose());}
 root.userData['inventory']=counts;
 return root;
}
