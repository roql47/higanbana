import {HOKORA_SITE,hokoraSiteHeight,HOKORA_APPROACH} from './hokoraSite';
import {cutInteriorTerrain} from './interiorTerrainCut';
import {buildingFooting} from './buildingFootings';
import {shrineGroundHeight} from './shrineSite';
import {applyGroundSurface,sharedGroundNoise} from './groundSurface';
import {sharedGroundWear} from './groundWear';
import {applyStoryScope,type StoryRegion} from './storyScope';
import {createStreetPropVisibility} from './streetPropVisibility';
import {buildingPadHeight} from './buildingPadHeight';
import {usesLegacyEarthYard} from './yardSurface';
import * as THREE from 'three';
import {terrainOverlay} from './terrainOverlay';
import {outsideLegacyGround,LEGACY_GROUND_BOUNDS} from './legacyGround';
import {ONSEN_ID} from './onsenStudy';
import {loadOnsenExterior} from './onsenAsset';
import {ACT1_FRONTAGE_IDS,addAct1Frontage} from './act1Frontage';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createSpatialInstancedMeshes,updateChunkDistanceVisibility} from '../instancing';
import {makeAxialBillboardMaterial,makeBillboardPlane} from '../billboard';
import {getCedarAtlas} from '../cedarAtlas';
import {SurveyHeightfield,insideSurveyPolygon,type SurveyData,type SurveyPoint,type SurveyBuilding} from './survey';
import {clipRoad,roadStrip,roadSurface,roadWidth} from './roadGeometry';

/** Georeferenced northern precinct study. Unreviewed buildings are explicitly placeholders. */
export class SurveyWorld {
  readonly group=new THREE.Group();readonly architecture=new THREE.Group();readonly dressing=new THREE.Group();
  readonly ready:Promise<void>;data!:SurveyData;heights!:SurveyHeightfield;
  readonly stats={houses:0,annexes:3,fields:0};private vegetation:THREE.InstancedMesh[]=[];
  private pads=new Map<string,SurveyBuilding[]>();private groundMaterial!:THREE.MeshStandardMaterial;
  private paddies:{points:SurveyPoint[];level:number;bounds:number[]}[]=[];
  private water:THREE.Mesh[]=[];private shrineReviewBase:number|null=null;
  private hokoraPad:{base:number;road:number}|null=null;
  private schoolPlayPad:{x:number;z:number;y:number}|null=null;
  private updateStreetProps:(camera:THREE.Vector3)=>boolean=()=>false;
  constructor(){this.group.name='ogimachi-gsi-osm-north';this.group.add(this.architecture,this.dressing);this.ready=this.load();}
  private async load(){
    let [data,buffer]=await Promise.all([fetch('/data/ogimachi/survey.json').then(r=>{if(!r.ok)throw Error('Survey unavailable');return r.json() as Promise<SurveyData>;}),fetch('/data/ogimachi/dem.f32').then(r=>{if(!r.ok)throw Error('DEM unavailable');return r.arrayBuffer();})]);
    if(new URLSearchParams(location.search).get('scope')!=='original'){
      const response=await fetch('/data/ogimachi/story-selection.json');
      if(response.ok)data=applyStoryScope(data,await response.json() as StoryRegion[]);
    }
    if((new URLSearchParams(location.search).get('layout')==='1'||new URLSearchParams(location.search).has('story')||['mori','shrine'].includes(new URLSearchParams(location.search).get('siteplay')??'')))data={...data,buildings:data.buildings.filter(b=>![660927473,660927475,1465225103,435719872].includes(b.id))};
    if(new URLSearchParams(location.search).get('siteplay')==='school')data={...data,buildings:data.buildings.filter(b=>b.id!==435719872)};
    this.data=data;this.heights=new SurveyHeightfield(data,new Float32Array(buffer));if((new URLSearchParams(location.search).get('layout')==='1'||new URLSearchParams(location.search).has('story')||['mori','shrine'].includes(new URLSearchParams(location.search).get('siteplay')??'')))this.shrineReviewBase=this.heights.sample(-90,-260);if(new URLSearchParams(location.search).has('story')||new URLSearchParams(location.search).get('layout')==='1'||['mori','shrine','hokora'].includes(new URLSearchParams(location.search).get('siteplay')??'')){const p=HOKORA_APPROACH.at(-1)!;this.hokoraPad={base:this.heights.sample(HOKORA_SITE.x,HOKORA_SITE.z),road:this.heights.sample(p[0],p[1])};}this.stats.houses=data.buildings.length;this.stats.fields=data.fields.length;
    this.paddies=data.fields.filter(f=>f.kind==='rice-reviewed').map(f=>{const xs=f.points.map(p=>p[0]),zs=f.points.map(p=>p[1]);return {points:f.points,level:this.heights.sample(xs.reduce((a,b)=>a+b)/xs.length,zs.reduce((a,b)=>a+b)/zs.length),bounds:[Math.min(...xs)-8,Math.max(...xs)+8,Math.min(...zs)-8,Math.max(...zs)+8]};});
    for(const b of data.buildings){const r=Math.hypot(b.width,b.depth)/2+(b.model==='irori-restaurant'?12:3);for(let z=Math.floor((b.z-r)/40);z<=Math.floor((b.z+r)/40);z++)for(let x=Math.floor((b.x-r)/40);x<=Math.floor((b.x+r)/40);x++){const key=`${x},${z}`,list=this.pads.get(key)??[];list.push(b);this.pads.set(key,list);}}
    if(new URLSearchParams(location.search).get('siteplay')==='school'||new URLSearchParams(location.search).get('layout')==='1'){
      const response=await fetch('/data/ogimachi/story-layout.json');
      if(!response.ok)throw Error('School layout unavailable');
      const layout=await response.json(),site=layout.sites.find((s:{id:string})=>s.id==='school');
      if(!site)throw Error('School site unavailable');
      const [x,z]=site.position;
      // Grade the actual terrain before generating both the render mesh and its collider.
      this.schoolPlayPad={x,z,y:this.height(x-15,z)};
    }
    const loader=new THREE.TextureLoader();
    const [photo,grass,normal,arm,gravel,mask,oak,roadWood,roadStone]=await Promise.all(['/data/ogimachi/orthophoto.webp','/textures/grass/aerial_grass_rock_diff_1k.webp','/textures/grass/aerial_grass_rock_nor_gl_1k.webp','/textures/grass/aerial_grass_rock_arm_1k.webp','/textures/ogimachi/packed-gravel.webp','/data/ogimachi/woodland.png','/textures/ogimachi/oak-8.png','/textures/wood/japanese_cedar_planks_diff_1k.webp','/textures/stone/japanese_stone_wall_diff_1k.webp'].map(p=>loader.loadAsync(p)));
    for(const t of [photo!,grass!,gravel!,oak!,roadWood!,roadStone!]){t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;}
    for(const t of [roadWood!,roadStone!])t.wrapS=t.wrapT=THREE.RepeatWrapping;
    grass!.wrapS=grass!.wrapT=normal!.wrapS=normal!.wrapT=arm!.wrapS=arm!.wrapT=gravel!.wrapS=gravel!.wrapT=THREE.RepeatWrapping;
    this.buildTerrain(photo!,grass!,normal!,arm!);this.buildPrecinctGrass(grass!,normal!,arm!);this.buildFields(gravel!);this.buildRoads(gravel!,roadWood!,roadStone!);this.buildYards(gravel!);this.buildTrees(mask!,oak!);
    this.group.traverse(object=>{
      if(object instanceof THREE.Mesh&&(object.name==='wada-paddy-grass-ground'||object.name==='north-precinct-earth-yards'||object.name.startsWith('mapped-roads-'))){
        for(const b of data.buildings.filter(b=>b.model==='irori-restaurant'))object.geometry=cutInteriorTerrain(object.geometry,b);
      }
    });
    await this.loadBuildings();
    const footings=data.buildings.filter(b=>b.id!==ONSEN_ID&&!ACT1_FRONTAGE_IDS.has(b.id)).map(b=>buildingFooting(b,(x,z)=>this.ground(x,z))).filter((g):g is THREE.BufferGeometry=>g!==null);
    if(footings.length){
      const geometry=mergeGeometries(footings);footings.forEach(g=>g.dispose());
      if(geometry){const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:roadStone!,color:0x8e887b,roughness:1,side:THREE.DoubleSide}));mesh.name='terrain-fitted-building-footings';mesh.castShadow=true;mesh.receiveShadow=true;this.architecture.add(mesh);}
    }
    for(const b of data.buildings.filter(b=>b.model==='irori-restaurant')){
      const c=Math.cos(b.angle),s=Math.sin(b.angle),positions:number[]=[],uv:number[]=[];
      for(const x of [-5.8,-4.48])for(const z of [-.97,.97]){
        const xx=b.x+c*x+s*z,zz=b.z-s*x+c*z;
        positions.push(xx,x===-5.8?this.ground(xx,zz)+.015:b.height+.30,zz);uv.push(x,z);
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex([0,1,2,1,3,2]);geometry.computeVertexNormals();
      const ramp=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:roadStone!,color:0x979187,roughness:1,side:THREE.DoubleSide}));ramp.name='irori-threshold-ramp';ramp.userData['walkSurface']=true;ramp.receiveShadow=true;this.architecture.add(ramp);
    }
    this.updateStreetProps=createStreetPropVisibility(this.architecture);
  }
  height(x:number,z:number){
    if(!this.heights)return 0;let y=this.heights.sample(x,z);
    const containing=this.paddies.find(field=>insideSurveyPolygon(x,z,field.points));
    for(const field of containing?[containing]:this.paddies){
      if(x<field.bounds[0]!||x>field.bounds[1]!||z<field.bounds[2]!||z>field.bounds[3]!)continue;
      let distance=Infinity;
      for(let i=0;i<field.points.length;i++){
        const a=field.points[i]!,b=field.points[(i+1)%field.points.length]!,dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
        distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));
      }
      if(insideSurveyPolygon(x,z,field.points))y=field.level;
      else if(distance<8)y=THREE.MathUtils.lerp(field.level,y,THREE.MathUtils.smoothstep(distance,0,8));
    }
    y=buildingPadHeight(x,z,y,this.pads.get(`${Math.floor(x/40)},${Math.floor(z/40)}`)??[]);
    if(this.schoolPlayPad){
      const pad=this.schoolPlayPad;
      const distance=Math.hypot(Math.max(0,Math.abs(x-pad.x)-20),Math.max(0,Math.abs(z-pad.z)-12));
      if(distance<8)y=THREE.MathUtils.lerp(pad.y,y,THREE.MathUtils.smoothstep(distance,0,8));
    }
    if(this.hokoraPad)y=hokoraSiteHeight(x,z,y,this.hokoraPad.base,this.hokoraPad.road);
    return this.shrineReviewBase==null?y:shrineGroundHeight(x,z,y,this.shrineReviewBase);
  }
  private buildTerrain(photo:THREE.Texture,grass:THREE.Texture,normal:THREE.Texture,arm:THREE.Texture){
    const bounds=this.data.photo;
    normal.repeat.set(1,1);normal.anisotropy=8;grass.anisotropy=8;arm.anisotropy=8;
    // Close ground is procedural (see groundSurface); the aerial photo takes over past 100 m, where
    // a 4 m tile would only be a shimmering grid anyway and the survey wants the imagery readable.
    const mat=new THREE.MeshStandardMaterial({map:photo,normalScale:new THREE.Vector2(.95,.95),roughness:1});this.groundMaterial=mat;
    applyGroundSurface(mat,{noise:sharedGroundNoise(),wear:sharedGroundWear(this.data),albedo:grass,normal,arm,tile:4,aerial:{near:100,far:260},exposure:.95});
    for(let z=-2304;z<2304;z+=256)for(let x=-2304;x<2304;x+=256){
      const near=x>=-768&&x<768&&z>=-768&&z<768,step=near?4:32;
      const geo=new THREE.PlaneGeometry(256,256,256/step,256/step);geo.rotateX(-Math.PI/2);geo.translate(x+128,0,z+128);
      const p=geo.getAttribute('position'),uv=geo.getAttribute('uv');
      for(let i=0;i<p.count;i++){
        const xx=p.getX(i),zz=p.getZ(i);let y=this.height(xx,zz);
        if(near&&Math.abs(xx)===768){const a=Math.floor(zz/32)*32;y=THREE.MathUtils.lerp(this.height(xx,a),this.height(xx,a+32),(zz-a)/32);}
        if(near&&Math.abs(zz)===768){const a=Math.floor(xx/32)*32;y=THREE.MathUtils.lerp(this.height(a,zz),this.height(a+32,zz),(xx-a)/32);}
        p.setY(i,y);uv.setXY(i,(xx-bounds.minX)/(bounds.maxX-bounds.minX),1-(zz-bounds.minZ)/(bounds.maxZ-bounds.minZ));
      }
      geo.computeVertexNormals();let terrainGeometry=geo as THREE.BufferGeometry;for(const b of this.data.buildings.filter(b=>b.model==='irori-restaurant'))terrainGeometry=cutInteriorTerrain(terrainGeometry,b);const mesh=new THREE.Mesh(terrainGeometry,mat);mesh.receiveShadow=true;mesh.name='GSI-DEM-ground-metres';this.group.add(mesh);
    }
  }
  /** Rendered 4 m triangle height keeps narrow overlays on the visible ground mesh. */
  private ground(x:number,z:number){
    const step=Math.abs(x)<768&&Math.abs(z)<768?4:32;
    const a=Math.floor(x/step)*step,b=Math.floor(z/step)*step,u=(x-a)/step,v=(z-b)/step;
    const h00=this.height(a,b),h10=this.height(a+step,b),h01=this.height(a,b+step),h11=this.height(a+step,b+step);
    return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
  }
  private ribbon(points:SurveyPoint[],width:number,offset:number){
    const vertices:number[]=[],uv:number[]=[],indices:number[]=[];let distance=0;
    for(let k=1;k<points.length;k++){
      const a=points[k-1]!,b=points[k]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.05)continue;
      const n=Math.ceil(length/3),ox=-dz/length*width/2,oz=dx/length*width/2;
      for(let j=0;j<n;j++){
        const base=vertices.length/3;
        for(const [t,s] of [[j/n,-1],[j/n,1],[(j+1)/n,-1],[(j+1)/n,1]]){
          const x=a[0]+dx*t!+ox*s!,z=a[1]+dz*t!+oz*s!;vertices.push(x,this.ground(x,z)+offset,z);uv.push((s!+1)*width/4,(distance+length*t!)/2);
        }indices.push(base,base+1,base+2,base+1,base+3,base+2);
      }distance+=length;
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
  }
  private buildFields(gravel:THREE.Texture){
    const banks:THREE.BufferGeometry[]=[];
    for(const f of this.data.fields){
      // OSM retains all real outlines; foreground traced paddies receive summer dressing.
      if(f.kind!=='rice-reviewed')continue;
      const shape=new THREE.Shape(f.points.map(([x,z])=>new THREE.Vector2(x,-z)));
      const geo=new THREE.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);
      const field=this.paddies.find(p=>p.points===f.points)!;
      const pos=geo.getAttribute('position');for(let i=0;i<pos.count;i++)pos.setY(i,field.level+.15);geo.computeVertexNormals();
      const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0x7b8a79,roughness:.10,metalness:.2,envMapIntensity:1.3,side:THREE.DoubleSide}));mesh.receiveShadow=true;mesh.name=`registered-${f.id}`;this.dressing.add(mesh);this.water.push(mesh);
      banks.push(this.ribbon([...f.points,f.points[0]!],.65,.14));
    }
    if(banks.length){const mesh=new THREE.Mesh(mergeGeometries(banks)!,new THREE.MeshStandardMaterial({map:gravel,color:0x8c8c58,roughness:1}));mesh.receiveShadow=true;this.dressing.add(mesh);banks.forEach(g=>g.dispose());}
  }
  private buildPrecinctGrass(grass:THREE.Texture,normal:THREE.Texture,arm:THREE.Texture){
    // PBR ground replaces the photographic ground in the detailed northern field area.
    // The rest of the survey keeps aerial imagery visibly identifiable as a base study.
    const boundary:SurveyPoint[]=[[-48,-242],[28,-242],[58,-216],[85,-147],[83,-35],[-42,-27]];
    // Align triangles with the DEM render mesh: arbitrary subdivided triangles
    // crossed terrain diagonals and left visible grey cracks between parcels.
    const geo=new THREE.PlaneGeometry(144,224,72,112);geo.rotateX(-Math.PI/2);geo.translate(20,0,-136);
    const p=geo.getAttribute('position'),uv=geo.getAttribute('uv'),colors:number[]=[];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i);p.setY(i,this.ground(x,z)+.04);uv.setXY(i,x/5,z/5);
      let distance=Infinity;
      for(let j=0;j<boundary.length;j++){const a=boundary[j]!,b=boundary[(j+1)%boundary.length]!,dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}
      colors.push(1,1,1,insideSurveyPolygon(x,z,boundary)?Math.min(1,distance/5):0);
    }
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));geo.computeVertexNormals();
    // Same surface as the terrain underneath it, so the sheet only adds detail — never a seam.
    const mat=new THREE.MeshStandardMaterial({roughness:1,vertexColors:true,transparent:true,depthWrite:false,normalScale:new THREE.Vector2(.95,.95)});
    applyGroundSurface(mat,{noise:sharedGroundNoise(),wear:sharedGroundWear(this.data),albedo:grass,normal,arm,tile:4,exposure:.95});
    const mesh=new THREE.Mesh(geo,mat);mesh.name='wada-paddy-grass-ground';mesh.receiveShadow=true;this.dressing.add(mesh);
  }
  private buildRoads(gravel:THREE.Texture,wood:THREE.Texture,stone:THREE.Texture){
    const parts:Record<string,THREE.BufferGeometry[]>={asphalt:[],gravel:[],wood:[],stone:[]};
    for(const road of this.data.roads){
      // ACT1 owns this section's ground and collisions; do not leave a second
      // differently triangulated asphalt surface underneath the authored path.
      const paths=road.bridge?[road.points]:outsideLegacyGround(road.points);
      for(const points of paths.flatMap(path=>clipRoad(path))){
        const strip=roadStrip(points,roadWidth(road),(x,z)=>this.ground(x,z),road.bridge);if(!strip.indices.length)continue;
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(strip.positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(strip.uv,2));geo.setIndex(strip.indices);geo.computeVertexNormals();parts[roadSurface(road)]!.push(geo);
      }
    }
    const materials:Record<string,THREE.Material>={asphalt:new THREE.MeshStandardMaterial({color:0x71766f,roughness:.96}),gravel:new THREE.MeshStandardMaterial({map:gravel,color:0xb5af99,roughness:1}),wood:new THREE.MeshStandardMaterial({map:wood,color:0x9b9383,roughness:.94}),stone:new THREE.MeshStandardMaterial({map:stone,color:0xaaa99e,roughness:1})};
    for(const [surface,geometries] of Object.entries(parts)){
      if(!geometries.length)continue;const mesh=new THREE.Mesh(mergeGeometries(geometries)!,materials[surface]);mesh.name=`mapped-roads-${surface}`;mesh.receiveShadow=true;this.dressing.add(mesh);geometries.forEach(p=>p.dispose());
    }
  }
  private buildYards(gravel:THREE.Texture){
    const parts:THREE.BufferGeometry[]=[];
    for(const b of this.data.buildings.filter(b=>Math.hypot(b.x,b.z)<190)){
      if(usesLegacyEarthYard(b))continue;
      const geo=new THREE.PlaneGeometry(b.width+3,b.depth+3,Math.ceil((b.width+3)/2),Math.ceil((b.depth+3)/2));geo.rotateX(-Math.PI/2);geo.rotateY(b.angle);geo.translate(b.x,0,b.z);
      const p=geo.getAttribute('position'),uv=geo.getAttribute('uv');for(let i=0;i<p.count;i++){uv.setXY(i,p.getX(i)/2,p.getZ(i)/2);}
      parts.push(terrainOverlay(geo,(x,z)=>this.ground(x,z),.10));geo.dispose();
    }
    const yards=new THREE.Mesh(mergeGeometries(parts)!,new THREE.MeshStandardMaterial({map:gravel,bumpMap:gravel,bumpScale:.065,color:0xb6afa0,roughness:1}));yards.name='north-precinct-earth-yards';yards.receiveShadow=true;this.dressing.add(yards);parts.forEach(p=>p.dispose());
    // Photo-observed paved frontage. Its boundary is estimated; the mapped street stays fixed.
    const street=this.data.roads.find(r=>r.id===1268046903)!;
    for(const b of this.data.buildings.filter(b=>b.model==='irori-shop'||b.model==='mori-workshop')){
      const east=b.model==='mori-workshop';
      const positions:number[]=[],uv:number[]=[],indices:number[]=[],rows=Math.ceil(b.depth),cols=10;
      for(let row=0;row<=rows;row++){
        const localZ=(row/rows-.5)*(b.depth+(east?0:2)),localX=(east?1:-1)*(b.width/2-.3),c=Math.cos(b.angle),s=Math.sin(b.angle);
        const fx=b.x+c*localX+s*localZ,fz=b.z-s*localX+c*localZ;
        let sx=fx,sz=fz,nearest=Infinity;
        for(let i=1;i<street.points.length;i++){
          const a=street.points[i-1]!,q=street.points[i]!,dx=q[0]-a[0],dz=q[1]-a[1];
          const t=THREE.MathUtils.clamp(((fx-a[0])*dx+(fz-a[1])*dz)/(dx*dx+dz*dz),0,1),x=a[0]+dx*t,z=a[1]+dz*t,d=Math.hypot(fx-x,fz-z);
          if(d<nearest){nearest=d;const edge=Math.min(d,(street.width??6.2)/2);sx=x+(fx-x)*edge/d;sz=z+(fz-z)*edge/d;}
        }
        for(let col=0;col<=cols;col++){const t=col/cols,x=THREE.MathUtils.lerp(sx,fx,t),z=THREE.MathUtils.lerp(sz,fz,t);positions.push(x,this.ground(x,z)+.13,z);uv.push(x/2,z/2);}
      }
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const a=row*(cols+1)+col;if(east)indices.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);else indices.push(a,a+cols+1,a+1,a+1,a+cols+1,a+cols+2);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
      const frontage=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:east?null:gravel,color:east?0x8e938e:0xb2b0a5,roughness:1,bumpMap:gravel,bumpScale:.025}));frontage.name=`${b.model}-street-forecourt`;frontage.receiveShadow=true;this.dressing.add(frontage);
    }
    // Wada's stone-lined snow-melt ditch follows the north and west edges of the precinct.
    const course:SurveyPoint[]=[[17,-18],[-19,-18],[-19,18]],channel=this.ribbon(course,.48,.14);
    this.dressing.add(new THREE.Mesh(channel,new THREE.MeshStandardMaterial({color:0x34473d,roughness:.45})));
    const rocks:{matrix:THREE.Matrix4}[]=[],dummy=new THREE.Object3D();
    for(let k=1;k<course.length;k++){
      const a=course[k-1]!,b=course[k]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for(let i=0;i<=length;i+=.65)for(const side of [-1,1]){
        const x=THREE.MathUtils.lerp(a[0],b[0],i/length)-(b[1]-a[1])/length*side*.38,z=THREE.MathUtils.lerp(a[1],b[1],i/length)+(b[0]-a[0])/length*side*.38;
        dummy.position.set(x,this.ground(x,z)+.18,z);dummy.scale.set(.39,.24,.30);dummy.rotation.set(i*.1,i*.72,0);dummy.updateMatrix();rocks.push({matrix:dummy.matrix.clone()});
      }
    }
    createSpatialInstancedMeshes(this.dressing,new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x777765,roughness:1}),rocks,{cellSize:128,name:'wada-stone-watercourse',castShadow:true});
  }
  /** Static local reflection probe: captured once, with no per-frame reflection pass. */
  captureWaterReflection(renderer:THREE.WebGLRenderer,scene:THREE.Scene){
    const target=new THREE.WebGLCubeRenderTarget(128,{type:THREE.HalfFloatType});
    const camera=new THREE.CubeCamera(.5,1800,target);camera.position.set(20,this.height(20,-65)+2,-65);
    for(const w of this.water)w.visible=false;
    try{camera.update(renderer,scene);}finally{for(const w of this.water)w.visible=true;}
    const generator=new THREE.PMREMGenerator(renderer),environment=generator.fromCubemap(target.texture);
    for(const w of this.water)(w.material as THREE.MeshStandardMaterial).envMap=environment.texture;
    generator.dispose();target.dispose();
  }
  private buildTrees(mask:THREE.Texture,oak:THREE.Texture){
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=640;const context=canvas.getContext('2d')!;context.drawImage(mask.image as HTMLImageElement,0,0,384,640);const pixels=context.getImageData(0,0,384,640).data;
    const bounds=this.data.photo,dummy=new THREE.Object3D(),broad:{matrix:THREE.Matrix4}[]=[],cedar:{matrix:THREE.Matrix4}[]=[];
    let seed=18473;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    for(let z=-2100;z<2100;z+=15)for(let x=-2100;x<2100;x+=15){
      const xx=x+random()*15,zz=z+random()*15,u=(xx-bounds.minX)/(bounds.maxX-bounds.minX),v=(zz-bounds.minZ)/(bounds.maxZ-bounds.minZ);
      const covered=u>=0&&v>=0&&u<1&&v<1;
      if(covered){if(pixels[(Math.floor(v*640)*384+Math.floor(u*384))*4]!<128)continue;}
      else if(this.heights.sample(xx,zz)<32||Math.hypot(xx,zz)<650)continue;
      if(this.pads.get(`${Math.floor(xx/40)},${Math.floor(zz/40)}`)?.some(b=>Math.hypot(xx-b.x,zz-b.z)<Math.hypot(b.width,b.depth)/2+8))continue;
      if(this.data.fields.some(f=>insideSurveyPolygon(xx,zz,f.points)))continue;
      const size=.8+random()*.55;dummy.position.set(xx,this.height(xx,zz),zz);dummy.scale.setScalar(size);dummy.rotation.y=random()*Math.PI*2;dummy.updateMatrix();
      (random()<.25?cedar:broad).push({matrix:dummy.matrix.clone()});
    }
    createSpatialInstancedMeshes(this.dressing,makeBillboardPlane(20,19),makeAxialBillboardMaterial(oak,{alphaTest:.35,color:0xe2e6c2,atlas:{frames:8,columns:4,rows:2}}),broad,{cellSize:256,name:'survey-broadleaf',boundsPadding:18});
    createSpatialInstancedMeshes(this.dressing,makeBillboardPlane(11,23),makeAxialBillboardMaterial(getCedarAtlas('a'),{alphaTest:.35,color:0xa7bc93,atlas:{frames:8,columns:4,rows:2}}),cedar,{cellSize:256,name:'survey-cedar',boundsPadding:18});
    // Short clipped garden trees belong to the house precinct, separate from the forest mask.
    const garden=[[-11,-20],[-5,-22],[8,-18],[13,-14],[18,2],[12,12],[-14,13]];
    const crowns=garden.map(([x,z])=>{dummy.position.set(x!,this.height(x!,z!),z!);dummy.scale.setScalar(.30);dummy.updateMatrix();return {matrix:dummy.matrix.clone()};});
    createSpatialInstancedMeshes(this.dressing,makeBillboardPlane(20,19),makeAxialBillboardMaterial(oak,{alphaTest:.35,color:0xd8e3a6,atlas:{frames:8,columns:4,rows:2}}),crowns,{cellSize:128,name:'wada-garden-trees',boundsPadding:8});
  }
  private async loadBuildings(){
    const loader=new GLTFLoader(),[generic,north,hakusuien,irori,mori,iroriV5]=await Promise.all([loader.loadAsync('/models/ogimachi/village-library.glb'),loader.loadAsync('/models/ogimachi/wada-precinct.glb'),loader.loadAsync('/models/ogimachi/hakusuien.glb'),loader.loadAsync('/models/ogimachi/irori-shop-v5.glb'),loader.loadAsync('/models/ogimachi/mori-workshop-v3.glb'),loader.loadAsync('/models/ogimachi/irori-restaurant-interior-v8.glb')]);
    const bases:Record<string,[number,number]>={farmhouse:[10.4,17],merchant:[9.5,12],storehouse:[5,7],'wada-main':[12.8,22.3],'wada-itakura':[6.5,10.2],'wada-hasagoya':[7.5,9.5],hakusuien:[11.894,19.555],'irori-restaurant':[10.386,13.514],'irori-shop':[8.769,10.526],'mori-workshop':[11.42,14.274]};
    const dummy=new THREE.Object3D();
    for(const [kind,base] of Object.entries(bases)){
      const asset=kind==='irori-restaurant'?iroriV5:kind==='mori-workshop'?mori:kind.startsWith('irori')?irori:kind==='hakusuien'?hakusuien:kind.startsWith('wada')?north:generic;asset.scene.updateMatrixWorld(true);const root=asset.scene.children.find(o=>o.userData['archetype']===kind);if(!root)throw Error(`Missing ${kind}`);
      const lots=this.data.buildings.filter(b=>b.model===kind&&b.id!==ONSEN_ID&&!ACT1_FRONTAGE_IDS.has(b.id));
      if(kind==='irori-restaurant'){
        for(const b of lots){
          const instance=root.clone(true);instance.name='irori-enterable-building';instance.position.set(b.x,b.height,b.z);instance.rotation.y=b.angle;instance.scale.set(b.width/base[0],1,b.depth/base[1]);
          instance.traverse(child=>{
            if(child instanceof THREE.Mesh){child.castShadow=true;child.receiveShadow=true;}
            if(child.userData['iroriLight']){const light=new THREE.PointLight(0xffcf91,12,7,2);light.castShadow=false;child.add(light);}
          });
          this.architecture.add(instance);
        }
        continue;
      }
      root.traverse(child=>{
        if(!(child instanceof THREE.Mesh))return;
        const items=lots.map(b=>{
          dummy.position.set(b.x,b.height,b.z);dummy.rotation.set(0,b.angle,0);
          const sy=kind==='mori-workshop'||kind==='hakusuien'||kind.startsWith('wada')||kind.startsWith('irori')?1:kind==='merchant'?Math.min(1.05,Math.max(.55,b.levels/2)):Math.max(.65,Math.min(1.25,b.width/base[0]));
          dummy.scale.set(b.width/base[0],sy,b.depth/base[1]);dummy.updateMatrix();return {matrix:dummy.matrix.clone().multiply(child.matrixWorld)};
        });
        if(items.length)createSpatialInstancedMeshes(this.architecture,child.geometry,child.material,items,{cellSize:180,name:`survey-${kind}`,castShadow:true,receiveShadow:true});
      });
    }
    const onsen=this.data.buildings.find(b=>b.id===ONSEN_ID);
    if(onsen)this.architecture.add(await loadOnsenExterior(onsen));
    await addAct1Frontage(this.architecture,this.data,(x,z)=>this.ground(x,z));
    const house=this.data.buildings.find(b=>b.model==='hakusuien');
    if(house){
      const lettering=new THREE.Group();lettering.position.set(house.x,house.height,house.z);lettering.rotation.y=house.angle;lettering.name='B001-authored-sign-lettering';
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=384;const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='#e3dfcc';ctx.font='bold 86px serif';ctx.textAlign='center';ctx.textBaseline='middle';['白','水','園'].forEach((c,i)=>ctx.fillText(c,64,64+i*128,110));
      const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1});
      for(const [x,y,z,w,h] of [[-5.60,1.33,2.25,.38,1.2],[-5.565,2.21,0,.29,.70]]){
        const plane=new THREE.Mesh(new THREE.PlaneGeometry(w!,h!),material);plane.position.set(x!,y!,z!);plane.rotation.y=-Math.PI/2;lettering.add(plane);
      }this.architecture.add(lettering);
    }
    for(const b of this.data.buildings.filter(b=>b.model==='irori-shop'||b.model==='mori-workshop')){
      const group=new THREE.Group();group.position.set(b.x,b.height,b.z);group.rotation.y=b.angle;group.name=`${b.model}-lettering`;
      const label=(text:string,x:number,y:number,z:number,w:number,h:number,rotation=-Math.PI/2)=>{
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
        ctx.fillStyle=b.model==='mori-workshop'?'#29251e':'#e7d8b1';ctx.font='bold 90px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64,490);
        const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
        const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map,transparent:true,depthWrite:false,roughness:1}));plane.position.set(x,y,z);plane.rotation.y=rotation;group.add(plane);
      };
      if(b.model==='mori-workshop')label('森の伝承塾',5.20,3.74,0,2.65,.49,Math.PI/2);
      else{label('いろり 白川郷',-3.823,2.68,-.1,1.56,.40);label('おみやげ',-.35,2.48,4.724,2.4,.31,0);}
      this.architecture.add(group);
    }
  }
  updateDetail(camera:THREE.Camera){updateChunkDistanceVisibility(this.vegetation,camera.position,320);return this.updateStreetProps(camera.position);}
  toggleSurvey(){this.architecture.visible=!this.architecture.visible;this.dressing.visible=this.architecture.visible;return !this.architecture.visible;}
}
