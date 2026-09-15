import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {makeAxialBillboardMaterial,makeBillboardPlane} from '../billboard';
import {getCedarAtlas} from '../cedarAtlas';
import {createSpatialInstancedMeshes,updateChunkDistanceVisibility} from '../instancing';
import {FIELDS,LOTS,ANNEXES,ALL_BUILDINGS,PATHS,RIVER,TRIBUTARY,BRIDGE_SPAN,pointInPolygon,lineDistance,terraceDistance,type Point} from './plan';
import {terrainElevation as terrainHeight,buildingHeight,fieldHeight,roadHeight,waterHeight} from './elevation';
import {parcelBoundaryEdges} from './parcelGeometry';

/** Independent 1.5 km river-terrace village, loaded by the new landscape preview. */
export class OgimachiWorld {
  readonly group=new THREE.Group();
  readonly ready:Promise<void>;
  readonly stats={houses:LOTS.length,annexes:ANNEXES.length,fields:new Set(FIELDS.map(f=>f.parcelId??f.id)).size,trees:0,modelMeshes:0};
  private cropMeshes:THREE.InstancedMesh[]=[];
  updateDetail(camera:THREE.Camera){updateChunkDistanceVisibility(this.cropMeshes,camera.position,360);}
  constructor() {
    this.group.name='ogimachi-new-world';
    this.buildTerrain();this.buildFields();this.buildRetainingEdges();this.buildTrees();this.ready=Promise.all([this.loadBuildings(),this.loadOutbuildings()]).then(()=>undefined);
  }
  private buildTerrain() {
    const pixels=new Uint8Array(256*256*4);
    let seed=7131;for(let i=0;i<256*256;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=182+(seed/4294967296)*48;pixels.set([n,n,n,255],i*4);}
    const map=new THREE.DataTexture(pixels,256,256);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.generateMipmaps=true;map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
    const grassMap=new THREE.TextureLoader().load('/textures/grass/aerial_grass_rock_diff_1k.webp');grassMap.colorSpace=THREE.SRGBColorSpace;grassMap.wrapS=grassMap.wrapT=THREE.RepeatWrapping;grassMap.anisotropy=4;
    const gravelMap=new THREE.TextureLoader().load('/textures/ogimachi/packed-gravel.webp');gravelMap.colorSpace=THREE.SRGBColorSpace;gravelMap.wrapS=gravelMap.wrapT=THREE.RepeatWrapping;gravelMap.anisotropy=8;
    const groundNormal=new THREE.TextureLoader().load('/textures/grass/aerial_grass_rock_nor_gl_1k.webp');groundNormal.wrapS=groundNormal.wrapT=THREE.RepeatWrapping;groundNormal.anisotropy=4;
    const groundMaterial=new THREE.MeshStandardMaterial({map:grassMap,normalMap:groundNormal,normalScale:new THREE.Vector2(.38,.38),vertexColors:true,roughness:1});
    groundMaterial.onBeforeCompile=shader=>{
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
        #ifdef USE_MAP
          vec4 a = texture2D(map, vMapUv);
          vec4 b = texture2D(map, mat2(0.731, 0.682, -0.682, 0.731) * vMapUv * 0.713 + vec2(0.31, 0.57));
          vec4 c = texture2D(map, mat2(-0.342, 0.940, -0.940, -0.342) * vMapUv * 0.427 + vec2(0.73, 0.19));
          vec4 mixedGround = (a + b + c) / 3.0;
          float luminance = dot(mixedGround.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor *= vec4(mix(vec3(luminance), mixedGround.rgb, 0.45), mixedGround.a);
        #endif
      `);
    };
    // Four-metre cells around the village resolve embankments and graded paths. Outer
    // mountains use coarser tiles; all tile edges share samples to avoid cracks.
    for(let tz=-2500;tz<2500;tz+=500)for(let tx=-2200;tx<2200;tx+=400){
      const near=tx>=-1000&&tx<1000&&tz>=-1000&&tz<1000,step=near?4:20;
      const geo=new THREE.PlaneGeometry(400,500,400/step,500/step);geo.rotateX(-Math.PI/2);geo.translate(tx+200,0,tz+250);
      const p=geo.getAttribute('position'),col=new Float32Array(p.count*3),uv=geo.getAttribute('uv');
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),z=p.getZ(i);let y=terrainHeight(x,z);
        // Match fine boundary vertices to the adjacent twenty-metre edge segments.
        if(near&&Math.abs(x)===1000){const a=Math.floor(z/20)*20,t=(z-a)/20;y=terrainHeight(x,a)*(1-t)+terrainHeight(x,a+20)*t;}
        if(near&&Math.abs(z)===1000){const a=Math.floor(x/20)*20,t=(x-a)/20;y=terrainHeight(a,z)*(1-t)+terrainHeight(a+20,z)*t;}
        p.setY(i,y);uv.setXY(i,x/8,z/8);
        const woodland=terraceDistance(x,z)>16,tone=.94+Math.sin(x*.021+z*.019)*.06;
        col.set(woodland?[.32*tone,.48*tone,.23*tone]:[.56*tone,.75*tone,.42*tone],i*3);
      }
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.computeVertexNormals();
      const ground=new THREE.Mesh(geo,groundMaterial);ground.name='graded-river-terrace-tile';ground.receiveShadow=true;this.group.add(ground);
    }
    const roadParts:THREE.BufferGeometry[]=[],laneParts:THREE.BufferGeometry[]=[];
    for(const path of PATHS)(path.width<4?laneParts:roadParts).push(this.ribbon(path.points,path.width,(x,z)=>roadHeight(path,x,z)+.09));
    const road=new THREE.Mesh(mergeGeometries(roadParts)!,new THREE.MeshStandardMaterial({map,bumpMap:map,bumpScale:.045,color:0x777b73,roughness:.94}));road.name='new-connected-lanes';road.receiveShadow=true;this.group.add(road);roadParts.forEach(g=>g.dispose());
    const lanes=new THREE.Mesh(mergeGeometries(laneParts)!,new THREE.MeshStandardMaterial({map:gravelMap,bumpMap:gravelMap,bumpScale:.06,color:0xa9a59a,roughness:1}));lanes.name='compacted-gravel-footpaths';lanes.receiveShadow=true;this.group.add(lanes);laneParts.forEach(g=>g.dispose());
    const yards:THREE.BufferGeometry[]=[];
    for(const lot of ALL_BUILDINGS) {
      const w=lot.width/2+2.8,d=lot.depth/2+2,x=lot.x,z=lot.z;
      const shape=new THREE.Shape();shape.moveTo(x-w,-z+d-1);shape.lineTo(x-w+1,-z+d);shape.lineTo(x+w-1,-z+d);shape.lineTo(x+w,-z+d-1);shape.lineTo(x+w,-z-d+1);shape.lineTo(x+w-1,-z-d);shape.lineTo(x-w,-z-d);shape.closePath();
      const yard=new THREE.ShapeGeometry(shape);yard.rotateX(-Math.PI/2);yard.translate(0,buildingHeight(lot)+.034,0);
      const positions=yard.getAttribute('position'),uv=yard.getAttribute('uv');for(let i=0;i<positions.count;i++)uv.setXY(i,positions.getX(i)/2,positions.getZ(i)/2);yards.push(yard);
    }
    const yardMesh=new THREE.Mesh(mergeGeometries(yards)!,new THREE.MeshStandardMaterial({map:gravelMap,bumpMap:gravelMap,bumpScale:.05,color:0x9c9687,roughness:1}));yardMesh.receiveShadow=true;yardMesh.name='packed-earth-house-yards';this.group.add(yardMesh);yards.forEach(g=>g.dispose());
    for(const [course,width] of [[RIVER,36],[TRIBUTARY,15]] as const){
      // Follow the exposed lower bank instead of hiding a flat gravel sheet below the water.
      this.group.add(new THREE.Mesh(this.ribbon(course,width*1.65,(x,z)=>Math.max(waterHeight(z)-.42,this.renderedGround(x,z)+.12),12),new THREE.MeshStandardMaterial({map:gravelMap,bumpMap:gravelMap,bumpScale:.07,color:0xaca99e,roughness:1})));
      const river=new THREE.Mesh(this.ribbon(course,width,(_x,z)=>waterHeight(z)),new THREE.MeshStandardMaterial({color:0x557b76,metalness:0,roughness:.5,envMapIntensity:.22,bumpMap:map,bumpScale:.13}));river.name=course===RIVER?'sho-river-traced':'ushikubi-tributary-traced';this.group.add(river);
    }
    const parapetMaterial=new THREE.MeshStandardMaterial({color:0x665e4c,roughness:.85});
    const ba=BRIDGE_SPAN[0]!,bb=BRIDGE_SPAN[1]!,dx=bb[0]-ba[0],dz=bb[1]-ba[1],len=Math.hypot(dx,dz);
    for(const side of [-1,1]) {
      const ox=-dz/len*side*2.2,oz=dx/len*side*2.2;
      const bridge=PATHS.find(p=>p.id==='river-bridge-road')!;
      const a=new THREE.Vector3(ba[0]+ox,roadHeight(bridge,...ba)+1.05,ba[1]+oz),b=new THREE.Vector3(bb[0]+ox,roadHeight(bridge,...bb)+1.05,bb[1]+oz);
      const rail=new THREE.Mesh(new THREE.BoxGeometry(.12,a.distanceTo(b),.12),parapetMaterial);rail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());rail.position.copy(a).lerp(b,.5);this.group.add(rail);
      for(let t=0;t<=len;t+=5){const x=ba[0]+dx*t/len+ox,z=ba[1]+dz*t/len+oz,post=new THREE.Mesh(new THREE.BoxGeometry(.12,1,.12),parapetMaterial);post.position.set(x,roadHeight(bridge,x,z)+.55,z);this.group.add(post);}
    }
  }
  /** Height on the rendered grid triangle, for thin overlays over a curved bank. */
  private renderedGround(x:number,z:number){
    const step=Math.abs(x)<1000&&Math.abs(z)<1000?4:20,a=Math.floor(x/step)*step,b=Math.floor(z/step)*step,u=(x-a)/step,v=(z-b)/step;
    const h00=terrainHeight(a,b),h10=terrainHeight(a+step,b),h01=terrainHeight(a,b+step),h11=terrainHeight(a+step,b+step);
    return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
  }
  private ribbon(points:Point[],width:number,height:(x:number,z:number)=>number,crossSegments=1) {
    const vertices:number[]=[];
    const closed=points[0]![0]===points.at(-1)![0]&&points[0]![1]===points.at(-1)![1];
    const offsets=points.map((p,i)=>{
      const prev=points[i>0?i-1:closed?points.length-2:0]!,next=points[i<points.length-1?i+1:closed?1:i]!;
      const a=new THREE.Vector2(p[0]-prev[0],p[1]-prev[1]),b=new THREE.Vector2(next[0]-p[0],next[1]-p[1]);
      if(!a.lengthSq())a.copy(b);if(!b.lengthSq())b.copy(a);a.normalize();b.normalize();
      const normal=new THREE.Vector2(-a.y-b.y,a.x+b.x).normalize();
      return normal.multiplyScalar(width/2/Math.max(.35,normal.dot(new THREE.Vector2(-b.y,b.x))));
    });
    for(let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),n=Math.ceil(length/3);
      for(let strip=0;strip<crossSegments;strip++)for(let j=0;j<n;j++)for(const [side,k] of [[-1,j],[1,j+1],[-1,j+1],[-1,j],[1,j],[1,j+1]]) {
        const t=k!/n,oa=offsets[i-1]!,ob=offsets[i]!;
        const across=-1+(2*strip+side!+1)/crossSegments;
        const x=a[0]+dx*t+(oa.x+(ob.x-oa.x)*t)*across,z=a[1]+dz*t+(oa.y+(ob.y-oa.y)*t)*across;vertices.push(x,height(x,z),z);
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]!/3,vertices[i+2]!/3);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();return geo;
  }
  private buildFields() {
    const waterParts:THREE.BufferGeometry[]=[],riceParts:THREE.BufferGeometry[]=[],vegetableParts:THREE.BufferGeometry[]=[],banks:THREE.BufferGeometry[]=[],plants:THREE.Matrix4[]=[];
    const dummy=new THREE.Object3D();
    for(const f of FIELDS) {
      const shape=new THREE.Shape();f.corners.forEach((p,i)=>i?shape.lineTo(p[0],-p[1]):shape.moveTo(p[0],-p[1]));shape.closePath();
      const indexed=new THREE.ShapeGeometry(shape),geo=indexed.toNonIndexed();indexed.dispose();geo.rotateX(-Math.PI/2);
      const positions=geo.getAttribute('position');for(let i=0;i<positions.count;i++)positions.setY(i,fieldHeight(f)+.075);geo.computeVertexNormals();
      (f.crop==='rice'?riceParts:f.crop==='vegetable'?vegetableParts:waterParts).push(geo);
      const xs=f.corners.map(p=>p[0]),zs=f.corners.map(p=>p[1]);
      for(let z=Math.min(...zs)+1;z<Math.max(...zs)-1;z+=1.4)for(let x=Math.min(...xs)+1;x<Math.max(...xs)-1;x+=.9) {
        if(!pointInPolygon(x,z,f.corners))continue;
        dummy.position.set(x,fieldHeight(f)+.04,z);dummy.rotation.set(0,Math.sin(x*17+z)*.4,0);dummy.scale.setScalar(f.crop==='water'?.32:f.crop==='vegetable'?.65:1);dummy.updateMatrix();plants.push(dummy.matrix.clone());
      }
      // Narrow open irrigation branch beside each field; two banks with a visible water bottom.
      const a=f.corners[0]!,b=f.corners[1]!;
      waterParts.push(this.ribbon([[a[0],a[1]-1],[b[0],b[1]-1]],.42,()=>fieldHeight(f)+.095));
    }
    const parcels=new Map<string,typeof FIELDS>();for(const f of FIELDS){const key=f.parcelId??f.id;parcels.set(key,[...(parcels.get(key)??[]),f]);}
    for(const pieces of parcels.values())for(const edge of parcelBoundaryEdges(pieces))banks.push(this.ribbon(edge,.65,()=>fieldHeight(pieces[0]!)+.19));
    for(const [parts,color,roughness] of [[waterParts,0x3d493d,.28],[riceParts,0x485332,.84],[vegetableParts,0x51452e,1],[banks,0x4b5030,1]] as const) {
      if(!parts.length)continue;const geo=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());const material=new THREE.MeshStandardMaterial({color,roughness,metalness:0});
      material.onBeforeCompile=shader=>{
        shader.vertexShader='varying vec3 parcelPosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nparcelPosition = position;');
        shader.fragmentShader='varying vec3 parcelPosition;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float soil = sin(parcelPosition.x * 1.73 + sin(parcelPosition.z * 2.71)) * sin(parcelPosition.z * 3.19);
          diffuseColor.rgb *= 0.94 + soil * 0.055;
        `);
      };
      const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;this.group.add(mesh);
    }
    const verts:number[]=[];
    for(let i=0;i<4;i++){const a=i*Math.PI/2,dx=Math.cos(a),dz=Math.sin(a);verts.push(-dz*.025,0,dx*.025,dz*.025,0,-dx*.025,dx*.21,.62,dz*.21);}
    const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));blade.computeVertexNormals();
    this.cropMeshes=createSpatialInstancedMeshes(this.group,blade,new THREE.MeshStandardMaterial({color:0x7d9343,side:THREE.DoubleSide,roughness:.96}),plants.map(matrix=>({matrix})),{cellSize:120,name:'rice-parcels'}).meshes;
    for(const mesh of this.cropMeshes)mesh.computeBoundingSphere();
  }
  private buildRetainingEdges(){
    const stoneVertices:number[]=[],earthVertices:number[]=[];
    const wall=(points:Point[],top:number,vertices:number[],minimumDepth:number)=>{
      for(let i=0;i<(points.length===2?1:points.length);i++){
        const a=points[i]!,b=points[(i+1)%points.length]!,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));
        for(let j=0;j<n;j++){
          const x0=a[0]+(b[0]-a[0])*j/n,z0=a[1]+(b[1]-a[1])*j/n,x1=a[0]+(b[0]-a[0])*(j+1)/n,z1=a[1]+(b[1]-a[1])*(j+1)/n;
          const y0=Math.min(top-minimumDepth,terrainHeight(x0,z0)-.10),y1=Math.min(top-minimumDepth,terrainHeight(x1,z1)-.10);
          if(top-Math.min(y0,y1)<.13)continue;
          vertices.push(x0,y0,z0,x1,y1,z1,x1,top,z1,x0,y0,z0,x1,top,z1,x0,top,z0);
        }
      }
    };
    for(const h of ALL_BUILDINGS){const w=h.width/2+2.8,d=h.depth/2+2,x=h.x,z=h.z;wall([[x-w,z+d-1],[x-w+1,z+d],[x+w-1,z+d],[x+w,z+d-1],[x+w,z-d+1],[x+w-1,z-d],[x-w,z-d]],buildingHeight(h)+.025,stoneVertices,0);}
    const parcels=new Map<string,typeof FIELDS>();for(const f of FIELDS){const id=f.parcelId??f.id;parcels.set(id,[...(parcels.get(id)??[]),f]);}
    for(const pieces of parcels.values())for(const edge of parcelBoundaryEdges(pieces))wall(edge,fieldHeight(pieces[0]!)+.17,earthVertices,.20);
    const loader=new THREE.TextureLoader(),map=loader.load('/textures/stone/japanese_stone_wall_diff_1k.webp'),normal=loader.load('/textures/stone/japanese_stone_wall_nor_gl_1k.webp');
    map.colorSpace=THREE.SRGBColorSpace;for(const texture of [map,normal]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;}
    for(const [vertices,mat,name] of [[stoneVertices,new THREE.MeshStandardMaterial({map,normalMap:normal,normalScale:new THREE.Vector2(.55,.55),roughness:.95,side:THREE.DoubleSide}),'stone-yard-retaining-edges'],[earthVertices,new THREE.MeshStandardMaterial({color:0x4e4834,roughness:1,side:THREE.DoubleSide}),'terraced-earth-field-bunds']] as const){
      if(!vertices.length)continue;const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push((vertices[i]!+vertices[i+2]!)/1.8,vertices[i+1]!/1.8);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();
      const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.receiveShadow=true;this.group.add(mesh);
    }
  }
  private buildTrees() {
    let state=19531;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const dummy=new THREE.Object3D(),conifers:{matrix:THREE.Matrix4}[]=[],broadleaves:{matrix:THREE.Matrix4}[]=[];
    // Eight views baked from the actual oak mesh in Blender, sharing one atlas across the forest.
    const leafMap=new THREE.TextureLoader().load('/textures/ogimachi/oak-8.png');leafMap.colorSpace=THREE.SRGBColorSpace;
    for(let i=0;i<180000;i++) {
      const x=(rand()*2-1)*2100,z=(rand()*2-1)*2350;
      if(terraceDistance(x,z)<12)continue;
      if(ALL_BUILDINGS.some(h=>Math.hypot(x-h.x,z-h.z)<Math.max(h.width,h.depth)*.7+12))continue;
      if(lineDistance(x,z,PATHS[PATHS.length-1]!.points)<8)continue;
      const y=terrainHeight(x,z);if(y<3)continue;
      dummy.position.set(x,y-1.1,z);dummy.rotation.set(0,rand()*Math.PI*2,0);const scale=.75+rand()*.7;dummy.scale.setScalar(scale);dummy.updateMatrix();
      (rand()<.28?conifers:broadleaves).push({matrix:dummy.matrix.clone()});
    }
    for(const [i,lot] of LOTS.entries()) {
      if(lot.kind==='storehouse')continue;
      for(const side of [-1,1]) {
        const x=lot.x+side*(lot.width/2+5.5),z=lot.z+lot.depth/2+4+(i%3)*1.5;
        if(ALL_BUILDINGS.some(h=>Math.abs(x-h.x)<h.width/2+3.5&&Math.abs(z-h.z)<h.depth/2+3.5))continue;
        if(PATHS.some(p=>lineDistance(x,z,p.points)<p.width/2+4))continue;
        if(FIELDS.some(f=>pointInPolygon(x,z,f.corners)))continue;
        dummy.position.set(x,terrainHeight(x,z)-.45,z);dummy.rotation.set(0,rand()*Math.PI*2,0);dummy.scale.setScalar(.52+rand()*.20);dummy.updateMatrix();broadleaves.push({matrix:dummy.matrix.clone()});
      }
    }
    // Courtyard trees fill uncultivated edges, not the rice plots or road sightlines.
    for(let i=0;i<2400;i++){
      const x=rand()*650-260,z=rand()*1000-470;if(terraceDistance(x,z)>3)continue;
      if(ALL_BUILDINGS.some(h=>Math.abs(x-h.x)<h.width/2+4&&Math.abs(z-h.z)<h.depth/2+4))continue;
      if(PATHS.some(p=>lineDistance(x,z,p.points)<p.width/2+4)||FIELDS.some(f=>pointInPolygon(x,z,f.corners)))continue;
      if(lineDistance(x,z,RIVER)<38||lineDistance(x,z,TRIBUTARY)<18)continue;
      dummy.position.set(x,terrainHeight(x,z)-.3,z);dummy.rotation.set(0,rand()*Math.PI*2,0);dummy.scale.setScalar(.38+rand()*.30);dummy.updateMatrix();broadleaves.push({matrix:dummy.matrix.clone()});
    }
    createSpatialInstancedMeshes(this.group,makeBillboardPlane(10,22),makeAxialBillboardMaterial(getCedarAtlas('a'),{alphaTest:.3,color:0x91ac82,atlas:{frames:8,columns:4,rows:2}}),conifers,{cellSize:250,name:'mountain-cedars',boundsPadding:12});
    createSpatialInstancedMeshes(this.group,makeBillboardPlane(19,17),makeAxialBillboardMaterial(leafMap,{alphaTest:.3,color:0xd4dda6,atlas:{frames:8,columns:4,rows:2}}),broadleaves,{cellSize:250,name:'mountain-broadleaf',boundsPadding:12});
    this.stats.trees=conifers.length+broadleaves.length;
  }
  private async loadBuildings() {
    const asset=await new GLTFLoader().loadAsync('/models/ogimachi/village-library.glb');asset.scene.updateMatrixWorld(true);
    this.toneRoofMaterials(asset.scene);
    const dummy=new THREE.Object3D();
    for(const archetype of ['farmhouse','farmhouse-shutters','merchant','merchant-boarded','storehouse'] as const) {
      const kind=archetype.startsWith('farmhouse')?'farmhouse':archetype.startsWith('merchant')?'merchant':'storehouse';
      const root=asset.scene.children.find(o=>o.userData['archetype']===archetype);
      if(!root)throw new Error(`Missing Blender archetype: ${archetype}`);
      const base=kind==='farmhouse'?[10.4,17]:kind==='merchant'?[9.5,12]:[5,7];
      const lots=LOTS.filter(l=>l.kind===kind).filter((_l,i)=>kind==='storehouse'||(archetype===kind?i%3!==1:i%3===1));
      root.traverse(child=>{
        if(!(child instanceof THREE.Mesh))return;
        const items=lots.map((lot,i)=>{
          dummy.position.set(lot.x,buildingHeight(lot),lot.z);dummy.rotation.set(0,lot.yaw,0);dummy.scale.set(lot.width/base[0]!,Math.max(.8,Math.min(kind==='merchant'?1.12:1.65,Math.sqrt(lot.width/base[0]!))),lot.depth/base[1]!);dummy.updateMatrix();
          const shade=.88+(i%7)*.018;
          return {matrix:dummy.matrix.clone().multiply(child.matrixWorld),color:new THREE.Color(shade,shade*.985,shade*.96)};
        });
        const made=createSpatialInstancedMeshes(this.group,child.geometry,child.material,items,{cellSize:180,name:`blender-${kind}`,receiveShadow:true});
        for(const mesh of made.meshes)mesh.castShadow=true;this.stats.modelMeshes+=made.meshes.length;
      });
    }
  }
  private async loadOutbuildings(){
    const asset=await new GLTFLoader().loadAsync('/models/ogimachi/outbuildings.glb');asset.scene.updateMatrixWorld(true);const dummy=new THREE.Object3D();
    this.toneRoofMaterials(asset.scene);
    for(const variant of ['lean-to','workshop','woodshed'] as const){
      const root=asset.scene.children.find(o=>o.userData['archetype']===variant);if(!root)throw new Error(`Missing outbuilding ${variant}`);
      const lots=ANNEXES.filter(a=>a.variant===variant),base=variant==='woodshed'?[6,5]:variant==='workshop'?[8,10]:[8,9];
      root.traverse(child=>{if(!(child instanceof THREE.Mesh))return;
        const items=lots.map(lot=>{dummy.position.set(lot.x,buildingHeight(lot),lot.z);dummy.rotation.set(0,lot.yaw,0);dummy.scale.set(lot.width/base[0]!,1,lot.depth/base[1]!);dummy.updateMatrix();return {matrix:dummy.matrix.clone().multiply(child.matrixWorld)};});
        const made=createSpatialInstancedMeshes(this.group,child.geometry,child.material,items,{cellSize:320,name:`blender-${variant}`,receiveShadow:true});for(const mesh of made.meshes)mesh.castShadow=true;this.stats.modelMeshes+=made.meshes.length;
      });
    }
  }
  private toneRoofMaterials(root:THREE.Object3D){
    const seen=new Set<THREE.Material>();root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const mat of Array.isArray(o.material)?o.material:[o.material]){if(seen.has(mat))continue;seen.add(mat);if(mat instanceof THREE.MeshStandardMaterial&&mat.name.includes('roof tile'))mat.color.multiplyScalar(.55);}});
  }
}
