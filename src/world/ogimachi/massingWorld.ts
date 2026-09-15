import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {SurveyHeightfield,type SurveyData,type SurveyPoint} from './survey';
import {clipRoad,roadStrip,roadWidth} from './roadGeometry';
import {massingSize} from './massing';
import {LandscapeLayout,forestCover} from './landscape';
import {frontageGeometry,streetFronts,buildingPoint} from './streetStudy';
import {ONSEN_ID,onsenParts,onsenEntryPad} from './onsenStudy';
import {loadOnsenExterior} from './onsenAsset';
import {addLegacyGround,outsideLegacyGround,LEGACY_GROUND_BOUNDS,legacyGroundInset} from './legacyGround';
import {CanopyForest,type ForestQuality} from './forestLod';
interface Watercourse{id:number;name:string;width:number;points:SurveyPoint[]}
/** A separate, reversible large-form study. Detailed GLBs and their positions stay untouched. */
export class MassingWorld{
  private legacyGroundLoaded=false;
  async loadLegacyGround(){
    if(this.legacyGroundLoaded)return;
    await addLegacyGround(this.terrain,this.data,(x,z)=>this.ground(x,z));
    this.legacyGroundLoaded=true;
    const materials=new Set<T.Material>();
    this.roads.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    this.roads.clear();materials.forEach(m=>m.dispose());this.buildRoads();
    const bounds=LEGACY_GROUND_BOUNDS;
    for(const mesh of this.frontages.children){
      if(!mesh.name.startsWith('street-study-forecourt-'))continue;
      const id=Number(mesh.name.slice('street-study-forecourt-'.length)),b=this.data.buildings.find(b=>b.id===id);
      if(b&&b.x>bounds.minX&&b.x<bounds.maxX&&b.z>bounds.minZ&&b.z<bounds.maxZ)mesh.visible=false;
    }
  }
  private onsenPlaceholder=new T.Group();
  private onsenAsset?:T.Group;
  async loadOnsen(){
    if(this.onsenAsset)return;
    const root=await loadOnsenExterior(this.data.buildings.find(b=>b.id===ONSEN_ID)!);
    this.buildings.add(root);this.onsenAsset=root;this.onsenPlaceholder.removeFromParent();
    this.onsenPlaceholder.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])mat.dispose();}});
  }
  group=new T.Group();terrain=new T.Group();buildings=new T.Group();fields=new T.Group();roads=new T.Group();river=new T.Group();forest=new T.Group();frontages=new T.Group();
  data!:SurveyData;heights!:SurveyHeightfield;ready:Promise<void>;stats={buildings:0,steep:0,fields:0,canopies:0};
  private layout!:LandscapeLayout;private cover!:Uint8Array;private coverSize={width:0,height:0};
  private channels:{a:SurveyPoint;b:SurveyPoint;width:number;ya:number;yb:number}[]=[];
  constructor(){this.group.add(this.terrain,this.fields,this.roads,this.river,this.buildings,this.forest,this.frontages);this.ready=this.load();}
  private material(color:number){return new T.MeshStandardMaterial({color,roughness:.95});}
  private add(group:T.Group,geo:T.BufferGeometry,mat:T.Material){geo.computeVertexNormals();const m=new T.Mesh(geo,mat);m.receiveShadow=true;group.add(m);return m;}
  private async load(){
    const [data,dem,water,cover]=await Promise.all([fetch('/data/ogimachi/survey.json').then(r=>r.json() as Promise<SurveyData>),fetch('/data/ogimachi/dem.f32').then(r=>r.arrayBuffer()),fetch('/data/ogimachi/massing.json').then(r=>r.json() as Promise<{rivers:Watercourse[];forest:{width:number;height:number}}>),fetch('/data/ogimachi/forest-cover.bin').then(r=>r.arrayBuffer())]);
    this.data=data;this.heights=new SurveyHeightfield(data,new Float32Array(dem));this.layout=new LandscapeLayout(data,(x,z)=>this.heights.sample(x,z));this.cover=new Uint8Array(cover);this.coverSize=water.forest;
    for(const w of water.rivers)for(const pts of clipRoad(w.points,-1800,1800))for(let i=1;i<pts.length;i++)this.channels.push({a:pts[i-1]!,b:pts[i]!,width:w.width,ya:this.heights.sample(...pts[i-1]!)+.6,yb:this.heights.sample(...pts[i]!)+.6});
    this.buildTerrain();this.buildWater(water.rivers);this.buildFields();this.buildRoads();this.buildMasses();this.buildFrontages();this.buildForest();
  }
  private channel(x:number,z:number){let best=Infinity,result:{distance:number;width:number;y:number}|undefined;
    for(const q of this.channels){if(x<Math.min(q.a[0],q.b[0])-60||x>Math.max(q.a[0],q.b[0])+60||z<Math.min(q.a[1],q.b[1])-60||z>Math.max(q.a[1],q.b[1])+60)continue;
      const dx=q.b[0]-q.a[0],dz=q.b[1]-q.a[1],length=dx*dx+dz*dz;if(!length)continue;
      const t=T.MathUtils.clamp(((x-q.a[0])*dx+(z-q.a[1])*dz)/length,0,1),d=Math.hypot(x-q.a[0]-dx*t,z-q.a[1]-dz*t);
      if(d-q.width/2<best){best=d-q.width/2;result={distance:d,width:q.width,y:T.MathUtils.lerp(q.ya,q.yb,t)};}
    }return result;
  }
  height(x:number,z:number){let y=this.layout.height(x,z);const q=this.channel(x,z);
    if(q){const t=T.MathUtils.smoothstep(q.distance,q.width*.5+4,q.width*.5+16);y=T.MathUtils.lerp(Math.min(y,q.y-1.8),y,t);}
    return y;
  }
  /** Four metres around the reviewed paddies, eight metres elsewhere. */
  private vertexHeight(x:number,z:number){
    const sample=(xx:number,zz:number)=>this.layout.belowTerraces(xx,zz,this.height(xx,zz),6);
    // Stitch odd fine-grid boundary vertices to the neighbouring 8 m edge.
    if((x===-256||x===256)&&z>=-512&&z<=256&&z%8!==0){const a=Math.floor(z/8)*8;return T.MathUtils.lerp(sample(x,a),sample(x,a+8),(z-a)/8);}
    if((z===-512||z===256)&&x>=-256&&x<=256&&x%8!==0){const a=Math.floor(x/8)*8;return T.MathUtils.lerp(sample(a,z),sample(a+8,z),(x-a)/8);}
    return sample(x,z);
  }
  private ground(x:number,z:number){const step=x>=-256&&x<256&&z>=-512&&z<256?4:8,a=Math.floor(x/step)*step,b=Math.floor(z/step)*step,u=(x-a)/step,v=(z-b)/step;
    const h00=this.vertexHeight(a,b),h10=this.vertexHeight(a+step,b),h01=this.vertexHeight(a,b+step),h11=this.vertexHeight(a+step,b+step);
    return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
  }
  private buildTerrain(){
    const mat=new T.MeshStandardMaterial({vertexColors:true,roughness:1});
    for(let z=-2048;z<2048;z+=256)for(let x=-2048;x<2048;x+=256){
      const near=x>=-256&&x<256&&z>=-512&&z<256,g=new T.PlaneGeometry(256,256,near?64:32,near?64:32);g.rotateX(-Math.PI/2);g.translate(x+128,0,z+128);const p=g.getAttribute('position'),colors=[];
      for(let i=0;i<p.count;i++){const xx=p.getX(i),zz=p.getZ(i),y=this.vertexHeight(xx,zz);p.setY(i,y);
        const slope=Math.hypot(this.heights.sample(xx+8,zz)-this.heights.sample(xx-8,zz),this.heights.sample(xx,zz+8)-this.heights.sample(xx,zz-8))/16;
        const forest=Math.max(this.coverAt(xx,zz)*.95,T.MathUtils.smoothstep(y,24,85)*.65+T.MathUtils.smoothstep(slope,.18,.55)*.35);
        const color=new T.Color(0xa3ad7c).lerp(new T.Color(0x405b43),Math.min(1,forest));color.multiplyScalar(.96+.04*Math.sin(xx*.017)*Math.cos(zz*.013));colors.push(color.r,color.g,color.b);
      }g.setAttribute('color',new T.Float32BufferAttribute(colors,3));this.add(this.terrain,g,mat);
    }
  }
  private strip(points:SurveyPoint[],width:number,height:(x:number,z:number)=>number){const s=roadStrip(points,width,height),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(s.positions,3));g.setIndex(s.indices);return g;}
  private buildWater(rivers:Watercourse[]){
    const water=this.material(0x709995),bank=this.material(0xb6b29a);
    for(const w of rivers)for(const points of clipRoad(w.points,-1800,1800)){
      const level=(x:number,z:number)=>this.channel(x,z)?.y??this.heights.sample(x,z);
      this.add(this.river,this.strip(points,w.width+6,(x,z)=>level(x,z)-.32),bank);
      this.add(this.river,this.strip(points,w.width,level),water);
    }
  }
  private buildFields(){
    const palette=[0x929c6b,0xaab183,0x7f925e,0xb4ae83],bank=this.material(0x8e9470);
    for(const [i,f] of this.data.fields.entries()){
      const terrace=this.layout.terraces.find(t=>t.id===f.id);
      // Subdivide within the original outline so large polygons follow the terrace.
      const minX=Math.min(...f.points.map(p=>p[0])),maxX=Math.max(...f.points.map(p=>p[0])),minZ=Math.min(...f.points.map(p=>p[1])),maxZ=Math.max(...f.points.map(p=>p[1]));
      const positions:number[]=[],indices:number[]=[];
      const shape=new T.Shape(f.points.map(([x,z])=>new T.Vector2(x,-z))),base=new T.ShapeGeometry(shape);base.rotateX(-Math.PI/2);
      const bp=base.getAttribute('position'),bi=base.getIndex()!;
      const triangle=(a:T.Vector3,b:T.Vector3,c:T.Vector3,depth=0)=>{
        if(depth<6&&Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a))>12){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);return;}
        // Reviewed northern paddies overlap broader OSM farmland. Keep a distinct
        // layer rather than coplanar polygons that flicker across the whole field.
        const n=positions.length/3;for(const v of [a,b,c])positions.push(v.x,terrace?terrace.level+.45:this.layout.belowTerraces(v.x,v.z,this.ground(v.x,v.z),12)+.30,v.z);indices.push(n,n+1,n+2);
      };
      if(maxX-minX>2000||maxZ-minZ>2000){base.dispose();continue;}
      for(let j=0;j<bi.count;j+=3)triangle(...[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(bp,bi.getX(j+k))) as [T.Vector3,T.Vector3,T.Vector3]);
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);base.dispose();
      this.add(this.fields,g,this.material(f.kind==='rice-reviewed'?0x9cadaa:palette[i%4]!));
      this.add(this.fields,this.strip([...f.points,f.points[0]!],terrace?.9:.6,(x,z)=>terrace?terrace.level+.52:this.ground(x,z)+.40),bank);
      if(terrace){const v:number[]=[],idx:number[]=[];
        for(let j=0;j<f.points.length;j++){const a=f.points[j]!,b=f.points[(j+1)%f.points.length]!,n=v.length/3;v.push(a[0],terrace.level+.43,a[1],b[0],terrace.level+.43,b[1],a[0],Math.min(this.ground(...a),terrace.level)-.7,a[1],b[0],Math.min(this.ground(...b),terrace.level)-.7,b[1]);idx.push(n,n+2,n+1,n+1,n+2,n+3);}
        const edge=new T.BufferGeometry();edge.setAttribute('position',new T.Float32BufferAttribute(v,3));edge.setIndex(idx);const mat=this.material(0x7e8060);mat.side=T.DoubleSide;this.add(this.fields,edge,mat);
      }this.stats.fields++;
    }
  }
  private buildRoads(){const paved=this.material(0x8c8d80),path=this.material(0xc3bd9f);
    for(const road of this.data.roads)for(const points of clipRoad(road.points,-1800,1800).flatMap(p=>this.legacyGroundLoaded&&!road.bridge?outsideLegacyGround(p):[p])){
      const start=this.height(...points[0]!),end=this.height(...points.at(-1)!);
      const g=this.strip(points,roadWidth(road),(x,z)=>road.bridge?Math.max(start,end)+1.7:this.ground(x,z)+.48*(this.legacyGroundLoaded?T.MathUtils.smoothstep(-legacyGroundInset(x,z),0,6):1));
      this.add(this.roads,g,['path','footway','track'].includes(road.kind)?path:paved);
    }
  }
  private buildMasses(){
    const bins:Record<string,T.BufferGeometry[]>={walls:[],gables:[],timber:[],glazing:[],steep:[],low:[],shed:[],foundation:[],linen:[]};
    const onsenBins:Record<string,T.BufferGeometry[]>=Object.fromEntries(Object.keys(bins).map(k=>[k,[]]));this.buildings.add(this.onsenPlaceholder);
    for(const b of this.data.buildings){const m=massingSize(b),w=m.bodyWidth,d=m.bodyDepth,y=b.height;
      const place=(g:T.BufferGeometry,key:string)=>{g.rotateY(b.angle);g.translate(b.x,y,b.z);g.deleteAttribute('normal');g.deleteAttribute('uv');(b.id===ONSEN_ID?onsenBins:bins)[key]!.push(g);};
      const box=(width:number,height:number,depth:number,x:number,y:number,z:number,key:string)=>{const g=new T.BoxGeometry(width,height,depth);g.translate(x,y,z);place(g,key);};
      const wall=new T.BoxGeometry(w,m.wall,d);wall.translate(0,m.wall/2,0);
      const roof=new T.BufferGeometry(),hw=m.roofWidth/2,hd=m.roofDepth/2,top=m.eave+m.rise;
      const verts=[-hw,m.eave,-hd,hw,m.eave,-hd,0,top,-hd,-hw,m.eave,hd,hw,m.eave,hd,0,top,hd];
      verts.push(...verts.map((v,i)=>i%3===1?v-m.thickness:v));
      roof.setAttribute('position',new T.Float32BufferAttribute(verts,3));
      const idx=[0,3,5,0,5,2,2,5,4,2,4,1,6,11,9,6,8,11,8,10,11,8,7,10];
      for(const [a,c] of [[0,2],[2,1],[1,4],[4,5],[5,3],[3,0]])idx.push(a!,a!+6,c!,c!,a!+6,c!+6);
      roof.setIndex(idx);
      const baseY=m.eave+(1-w/m.roofWidth)*m.rise-m.thickness;
      const gable=new T.BufferGeometry();gable.setAttribute('position',new T.Float32BufferAttribute([-w/2,baseY,-d/2,w/2,baseY,-d/2,0,top-m.thickness,-d/2,-w/2,baseY,d/2,w/2,baseY,d/2,0,top-m.thickness,d/2],3));gable.setIndex([0,2,1,3,4,5]);
      if(baseY>m.wall)box(w,baseY-m.wall,d,0,(baseY+m.wall)/2,0,m.reviewed?'timber':'gables');
      place(wall,b.id===ONSEN_ID?'timber':'walls');place(gable,m.reviewed?'timber':'gables');place(roof,m.roof);
      for(const part of onsenParts(b)){const g=new T.BoxGeometry(...part.size);if(part.tilt)g.rotateZ(part.tilt);g.translate(...part.position);place(g,part.tone);}
      if(m.reviewed&&streetFronts[b.model]){
        const side=streetFronts[b.model]!.side;
        // Broad facade bands only: enough to read front orientation in the street study.
        box(.025,1.65,d*.76,side*(w/2+.02),1.6,0,'glazing');
        if(b.model==='mori-workshop')box(.025,1.6,d*.83,w/2+.02,4.7,0,'glazing');
        if(b.model==='irori-shop'){
          box(1.35,.16,d+1.3,-w/2-.52,3.16,-.1,'low');
          box(w+1.3,.16,1.5,0,3.16,d/2+.58,'low');
        }
      }
      this.stats.buildings++;if(m.roof==='steep')this.stats.steep++;
    }
    const colors:Record<string,number>={walls:0xa99c83,gables:0xd0c8ac,timber:0x827054,glazing:0x47564e,steep:0x65513d,low:0x626964,shed:0x8e8974,foundation:0x969488,linen:0x3b647c};
    for(const [source,target] of [[bins,this.buildings],[onsenBins,this.onsenPlaceholder]] as const)for(const [key,parts] of Object.entries(source)){if(!parts.length)continue;const mat=this.material(colors[key]!);mat.flatShading=true;const mesh=this.add(target,mergeGeometries(parts)!,mat);mesh.castShadow=true;parts.forEach(g=>g.dispose());}
  }
  private buildFrontages(){
    for(const b of this.data.buildings){const front=streetFronts[b.model];if(!front)continue;
      const road=this.data.roads.find(r=>r.id===front.road);if(!road)continue;
      const shape=frontageGeometry(b,road,(x,z)=>this.ground(x,z)),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(shape.positions,3));g.setIndex(shape.indices);
      const mesh=this.add(this.frontages,g,this.material(b.model==='mori-workshop'?0x9a9c90:0xb7af96));mesh.name=`street-study-forecourt-${b.id}`;
    }
    const b=this.data.buildings.find(b=>b.id===ONSEN_ID);
    if(b){const p=onsenEntryPad,center=buildingPoint(b,p.x,p.z),g=new T.PlaneGeometry(p.halfWidth*2,p.halfDepth*2,12,28);g.rotateX(-Math.PI/2);g.rotateY(b.angle);g.translate(center[0],0,center[1]);
      const points=g.getAttribute('position');for(let i=0;i<points.count;i++)points.setY(i,this.ground(points.getX(i),points.getZ(i))+.18);
      const mesh=this.add(this.frontages,g,this.material(0x969488));mesh.name='onsen-local-entrance-landing';
    }
  }
  private coverAt(x:number,z:number){return forestCover(x,z,this.data,this.cover,this.coverSize.width,this.coverSize.height);}
  private canopyLod?:CanopyForest;
  updateForest(eye:T.Vector3,quality:ForestQuality){return this.canopyLod?.update(eye,quality)??false;}
  get forestStats(){return {trees:this.canopyLod?.submitted??0,triangles:this.canopyLod?.triangles??0,shadowTrees:this.canopyLod?.shadowTrees??0};}
  private buildForest(){
    const items:{x:number;z:number;r:number;h:number;color:T.Color}[]=[];
    const hash=(x:number,z:number)=>{const n=Math.sin(x*12.9898+z*78.233)*43758.5453;return n-Math.floor(n);};
    const cells=new Map<string,number[]>(),spacing=14;
    // Deterministic dart sampling avoids visible orchard rows on natural hillsides.
    for(let i=0;i<42000;i++){
      const xx=-950+hash(i,17)*1950,zz=-650+hash(i,83)*2350,r=7+hash(i,41)*5;
      if(this.coverAt(xx,zz)<.65)continue;
      const cx=Math.floor(xx/spacing),cz=Math.floor(zz/spacing);let crowded=false;
      for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const j of cells.get(`${x},${z}`)??[]){const o=items[j]!;if(Math.hypot(xx-o.x,zz-o.z)<spacing)crowded=true;}
      if(crowded||!this.layout.clearForCanopy(xx,zz,r))continue;
      const q=this.channel(xx,zz);if(q&&q.distance<q.width/2+r+5)continue;
      const h=9+hash(i,73)*10,color=new T.Color(0x486248).lerp(new T.Color(0x718052),hash(i,99)),key=`${cx},${cz}`,list=cells.get(key)??[];list.push(items.length);cells.set(key,list);items.push({x:xx,z:zz,r,h,color});
    }
    this.canopyLod=new CanopyForest(items.map(o=>({...o,y:this.height(o.x,o.z)+o.h*.50})));this.forest.add(this.canopyLod);this.stats.canopies=items.length;
  }
}
