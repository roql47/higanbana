import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {massingRoof,massingSize} from '../src/world/ogimachi/massing.ts';
import {surveyPoint} from '../src/world/ogimachi/survey.ts';
import {LandscapeLayout,forestCover} from '../src/world/ogimachi/landscape.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const data=read('../public/data/ogimachi/survey.json');
test('overall design keeps mapped building data and identified roof types intact',()=>{
  const original=JSON.stringify(data.buildings);
  for(const b of data.buildings){const m=massingSize(b);assert.ok(m.wall>0&&m.rise>0&&Number.isFinite(m.rise));}
  assert.equal(JSON.stringify(data.buildings),original);
  assert.equal(massingRoof(data.buildings.find(b=>b.id===236248644)),'low');
  assert.equal(massingRoof(data.buildings.find(b=>b.id===236248621)),'steep');
  assert.equal(massingRoof(data.buildings.find(b=>b.id===236248626)),'low');
});
test('paddy interiors are level and supporting meshes cannot pierce their edges',()=>{
  const parcel={id:'rice',kind:'rice-reviewed',points:[[0,0],[20,0],[20,20],[0,20],[0,0]]};
  const layout=new LandscapeLayout({...data,buildings:[],roads:[],fields:[parcel]},(x,z)=>x*.2+z*.1);
  const level=layout.terraces[0].level;
  for(const p of [[1,1],[10,10],[19,19]])assert.equal(layout.height(...p),level);
  for(const p of [[0,0],[25,10],[10,-5],[10,10]])assert.ok(layout.belowTerraces(...p,100,6)<level);
  assert.equal(layout.belowTerraces(40,40,100,6),100);
});
test('canopy clearance respects rotated buildings, fields and road corridors',()=>{
  const building={...data.buildings[0],x:100,z:100,width:10,depth:20,angle:Math.PI/4,height:7};
  const layout=new LandscapeLayout({...data,buildings:[building],fields:[{id:1,kind:'farmland',points:[[0,0],[20,0],[20,20],[0,20]]}],roads:[{id:2,points:[[0,50],[50,50]],kind:'road',width:6,bridge:false}]},()=>0);
  assert.equal(layout.height(100,100),7);
  assert.equal(layout.clearForCanopy(100,100,8),false);
  assert.equal(layout.clearForCanopy(10,10,8),false);
  assert.equal(layout.clearForCanopy(25,50,8),false);
  assert.equal(layout.clearForCanopy(25,60,8),false);
  assert.equal(layout.clearForCanopy(200,200,8),true);
});
test('woodland mask has the exported dimensions and uses the aerial coordinate bounds',()=>{
  const meta=read('../public/data/ogimachi/massing.json').forest;
  const cover=readFileSync(new URL('../public/data/ogimachi/forest-cover.bin',import.meta.url));
  assert.equal(cover.length,meta.width*meta.height);
  assert.ok(cover.some(v=>v>200)&&cover.some(v=>v===0));
  const p=data.photo;
  assert.equal(forestCover(p.minX-1,p.minZ,data,cover,meta.width,meta.height),0);
  assert.equal(forestCover(p.maxX,p.maxZ,data,cover,meta.width,meta.height),0);
  const x=12,z=25;
  assert.equal(forestCover(p.minX+(x+.5)*(p.maxX-p.minX)/meta.width,p.minZ+(z+.5)*(p.maxZ-p.minZ)/meta.height,data,cover,meta.width,meta.height),cover[z*meta.width+x]/255);
});
test('design watercourses retain raw OSM coordinates instead of invented curves',()=>{
  const source=read('../assets/reference/ogimachi-gis/osm.json').elements;
  const rivers=read('../public/data/ogimachi/massing.json').rivers;
  assert.ok(rivers.some(r=>r.name==='庄川'));assert.ok(rivers.some(r=>r.name==='牛首谷'));
  for(const r of rivers){const raw=source.find(e=>e.id===r.id);assert.equal(r.points.length,raw.geometry.length);assert.ok(r.width>0);
    for(let i=0;i<r.points.length;i++){const expected=surveyPoint(raw.geometry[i].lat,raw.geometry[i].lon,data.origin);assert.ok(Math.hypot(expected[0]-r.points[i][0],expected[1]-r.points[i][1])<.002);}
  }
});
