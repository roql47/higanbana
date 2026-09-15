import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LOTS,ANNEXES,ALL_BUILDINGS,FIELDS,PATHS,RIVER,TRIBUTARY,TERRACES,mapPoint,pointInPolygon,lineDistance,lotPathClearance} from '../src/world/ogimachi/plan.ts';
import {terrainElevation as terrainHeight,buildingHeight,waterHeight,fieldHeight,roadProfile} from '../src/world/ogimachi/elevation.ts';
import {subtractPolygon,rectangle,polygonArea,parcelBoundaryEdges} from '../src/world/ogimachi/parcelGeometry.ts';
import {REFERENCE_FOOTPRINTS} from '../src/world/ogimachi/referenceTrace.ts';

test('new Ogimachi plan separates building envelopes, fields and connected lanes',()=>{
  for(const [i,a] of LOTS.entries()) {
    // Compact mapped plots need roof clearance, not the old arbitrary three-metre yard gap.
    for(const b of LOTS.slice(0,i))assert.ok(Math.abs(a.x-b.x)>(a.width+b.width)/2+1.5||Math.abs(a.z-b.z)>(a.depth+b.depth)/2+1,`${a.id} overlaps ${b.id}`);
    for(const p of PATHS)for(const sx of [-1,0,1])for(const sz of [-1,0,1])assert.ok(lineDistance(a.x+sx*(a.width/2+1.8),a.z+sz*(a.depth/2+1),p.points)>p.width/2+.5,`${a.id} blocks ${p.id}`);
    for(const f of FIELDS) {
      assert.ok(!pointInPolygon(a.x,a.z,f.corners),`${a.id} is in ${f.id}`);
      assert.ok(!f.corners.some(([x,z])=>Math.abs(x-a.x)<a.width/2+1.8&&Math.abs(z-a.z)<a.depth/2+1),`${f.id} clips ${a.id}`);
    }
  }
  const remaining=new Set(PATHS.slice(1));const connected=[PATHS[0]];
  while(remaining.size){let progress=false;for(const p of remaining)if(p.points.some(([x,z])=>connected.some(c=>lineDistance(x,z,c.points)<10))){remaining.delete(p);connected.push(p);progress=true;}assert.ok(progress,'disconnected lane network');}
});

test('traced terrain follows its river bends and keeps every building pad level',()=>{
  for(const course of [RIVER,TRIBUTARY])for(let i=1;i<course.length;i++)for(const t of [0,.25,.5,.75,1]){
    const a=course[i-1],b=course[i],x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;assert.ok(terrainHeight(x,z)<waterHeight(z),`river centre stays below water at ${x},${z}`);
  }
  for(const h of LOTS)for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=h.x+sx*h.width/2,z=h.z+sz*h.depth/2;
    assert.ok(Math.abs(terrainHeight(x,z)-buildingHeight(h))<.05,`${h.id} needs a level pad`);
  }
  assert.ok(terrainHeight(2000,0)>150,'surrounding wooded relief remains');
  assert.ok(Math.max(...RIVER.map(p=>p[0]))-Math.min(...RIVER.map(p=>p[0]))>600,'river must not regress to a straight strip');
});

test('all 108 colored map centres are retained in the correct orientation',()=>{
  assert.equal(REFERENCE_FOOTPRINTS.filter(f=>f.color==='red').length,60);
  assert.equal(REFERENCE_FOOTPRINTS.filter(f=>f.color==='blue').length,48);
  for(const [i,f] of REFERENCE_FOOTPRINTS.entries()){
    const lot=LOTS.find(h=>h.id===`traced-${f.color}-${i}`),point=mapPoint(f.u,f.v);assert.ok(lot);
    assert.ok(Math.hypot(lot.x-point[0],lot.z-point[1])<.001,'reference centre must not be relocated by clearance or scatter');
  }
  assert.ok(mapPoint(1000,900)[1]<mapPoint(1400,900)[1],'map left is north');
  assert.ok(mapPoint(1280,700)[0]>mapPoint(1280,1000)[0],'map top is east');
  const hectares=TERRACES.reduce((s,p)=>s+polygonArea(p),0)/10000;
  assert.ok(hectares>43&&hectares<48,'trace scale stays near the source map property area of 45.6 ha');
});

test('Blender library exports five authored archetypes with textured geometry',()=>{
  const file=readFileSync(new URL('../public/models/ogimachi/village-library.glb',import.meta.url));
  assert.equal(file.toString('ascii',0,4),'glTF');const length=file.readUInt32LE(12),doc=JSON.parse(file.toString('utf8',20,20+length));
  assert.equal(doc.scenes.length,1,'original Blender scenes must not enter the runtime library');
  const roots=doc.scenes[0].nodes.map(i=>doc.nodes[i]);assert.deepEqual(roots.map(n=>n.extras.archetype).sort(),['farmhouse','farmhouse-shutters','merchant','merchant-boarded','storehouse']);
  let triangles=0;for(const mesh of doc.meshes)for(const p of mesh.primitives){assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined);triangles+=doc.accessors[p.indices].count/3;}
  assert.ok(triangles>12000&&triangles<32000,`five-archetype library triangle budget ${triangles}`);
  for(const prefix of ['Smoke-aged cedar','Bound kaya reeds','Foundation granite','Pale mineral plaster']){
    const mat=doc.materials.find(m=>m.name.startsWith(prefix));assert.ok(mat?.normalTexture&&mat.pbrMetallicRoughness.baseColorTexture,`${prefix} exports albedo and relief`);
  }
});

test('outbuilding footprints leave lanes open and cultivation does not cover buildings',()=>{
  for(const annex of ANNEXES){
    assert.ok(LOTS.some(h=>h.id===annex.parentId));
    for(const path of PATHS)assert.ok(lotPathClearance(annex,path)>path.width/2+.5,`${annex.id} blocks ${path.id}`);
    assert.ok(Math.abs(terrainHeight(annex.x,annex.z)-buildingHeight(annex))<.05);
    for(const other of ALL_BUILDINGS)if(other!==annex)assert.ok(Math.abs(annex.x-other.x)>=(annex.width+other.width)/2+.5||Math.abs(annex.z-other.z)>=(annex.depth+other.depth)/2+.5,`${annex.id} overlaps ${other.id}`);
  }
  for(const f of FIELDS)for(const h of ALL_BUILDINGS)assert.ok(!pointInPolygon(h.x,h.z,f.corners),`${f.id} covers ${h.id}`);
});

test('graded roads have bounded slopes, while each irrigated parcel shares one level',()=>{
  for(const path of PATHS){const samples=roadProfile(path),limit=path.width>=5?.065:.10;
    for(let i=1;i<samples.length;i++){const a=samples[i-1],b=samples[i];assert.ok(Math.abs(b.y-a.y)/(b.s-a.s)<=limit+1e-7,`${path.id} has a steep step`);}
  }
  const levels=new Map();for(const f of FIELDS){const id=f.parcelId??f.id,y=fieldHeight(f);if(levels.has(id))assert.equal(y,levels.get(id));levels.set(id,y);}
  assert.ok(Math.max(...levels.values())-Math.min(...levels.values())>3,'village has gradual relief rather than one flat elevation');
});

test('parcel subtraction preserves area and removes internal clipping seams',()=>{
  const pieces=subtractPolygon(rectangle(0,0,20,20),rectangle(0,0,8,8));
  assert.ok(Math.abs(pieces.reduce((s,p)=>s+polygonArea(p),0)-336)<1e-7);
  const edges=parcelBoundaryEdges(pieces.map((corners,i)=>({id:String(i),parcelId:'one-parcel',corners,crop:'rice'})));
  const perimeter=edges.reduce((s,[a,b])=>s+Math.hypot(a[0]-b[0],a[1]-b[1]),0);assert.ok(Math.abs(perimeter-112)<1e-5,'only outer perimeter plus courtyard hole remains');
});

test('Blender outbuilding library contains the authored low roof variants',()=>{
  const file=readFileSync(new URL('../public/models/ogimachi/outbuildings.glb',import.meta.url));
  const size=file.readUInt32LE(12),doc=JSON.parse(file.toString('utf8',20,20+size));
  assert.equal(doc.scenes.length,1);assert.deepEqual(doc.scenes[0].nodes.map(i=>doc.nodes[i].extras.archetype).sort(),['lean-to','woodshed','workshop']);
  assert.ok(doc.materials.some(m=>m.normalTexture),'authored timber maps are embedded');
});
