import * as THREE from 'three';
import type { HouseMaterials } from '../village/houseMaterials';

export interface GasshoPart { geo: THREE.BufferGeometry; mat: THREE.Material }
let roofMaterial: THREE.MeshStandardMaterial | undefined;
let woodMaterials: {plank:THREE.MeshStandardMaterial;plankDark:THREE.MeshStandardMaterial;timber:THREE.MeshStandardMaterial}|undefined;

/** Quieter, smoke-aged cedar; actual battens provide depth instead of giant black photo streaks. */
export function gasshoWood() {
  if(woodMaterials)return woodMaterials;
  const size=512,data=new Uint8Array(size*size*4),normals=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const board=Math.floor(x/128),k=x%128;
    const fibre=Math.sin(x*.78+Math.sin(y*Math.PI*2/512)*2.5);
    const broad=Math.sin(x*.043+Math.cos(y*Math.PI*4/512)*.3);
    const value=101+fibre*5+broad*9+Math.sin(board*21.2)*9;
    const seam=k<2?.55:1;
    const i=(y*size+x)*4;
    data.set([value*1.05*seam,value*.86*seam,value*.66*seam,255],i);
    normals.set([128+Math.cos(x*.78+Math.sin(y*Math.PI*2/512)*2.5)*12,128,253,255],i);
  }
  const texture=(d:Uint8Array,srgb=false)=>{
    const t=new THREE.DataTexture(d,size,size);t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;t.needsUpdate=true;return t;
  };
  const map=texture(data,true),normalMap=texture(normals);
  const mat=(name:string,color:number)=>{
    const m=new THREE.MeshStandardMaterial({map,normalMap,color,roughness:.91,normalScale:new THREE.Vector2(.45,.45),vertexColors:true});m.name=name;return m;
  };
  woodMaterials={plank:mat('gassho-cedar-boards',0xffffff),plankDark:mat('gassho-attic-boards',0xb8b0a8),timber:mat('gassho-smoked-frame',0x8c8074)};
  return woodMaterials;
}

/** Aligned reed fibres, generated once. Separate from the old loose-straw roof texture. */
export function gasshoThatch() {
  if(roofMaterial) return roofMaterial;
  const size=512, height=new Float32Array(size*size);
  const diffuse=new Uint8Array(size*size*4), normal=new Uint8Array(size*size*4), arm=new Uint8Array(size*size*4);
  const hash=(n:number)=>{const v=Math.sin(n*127.1)*43758.5453;return v-Math.floor(v);};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=y*size+x;
    const fibre=Math.sin(x*2.4+Math.sin(y*Math.PI*2/size)*.8)*.5+.5;
    const bundle=Math.sin(x*Math.PI*2/64)*.5+.5;
    const weather=Math.sin(y*Math.PI*4/size+x*.018)*.5+.5;
    height[i]=fibre*.5+bundle*.18+hash(i)*.13;
    const value=82+fibre*30+bundle*12+weather*12+hash(i+61)*13;
    diffuse.set([value*1.08,value,value*.83,255],i*4);
    arm.set([205+fibre*45,235+hash(i)*18,0,255],i*4);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const at=(xx:number,yy:number)=>height[((yy+size)%size)*size+(xx+size)%size]!;
    const n=new THREE.Vector3((at(x-1,y)-at(x+1,y))*.85,(at(x,y-1)-at(x,y+1))*.85,1).normalize();
    normal.set([(n.x*.5+.5)*255,(n.y*.5+.5)*255,(n.z*.5+.5)*255,255],(y*size+x)*4);
  }
  const texture=(data:Uint8Array,srgb=false)=>{
    const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
    t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;
    t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;
  };
  const packed=texture(arm);
  roofMaterial=new THREE.MeshStandardMaterial({map:texture(diffuse,true),normalMap:texture(normal),roughnessMap:packed,
    roughness:1,normalScale:new THREE.Vector2(.65,.65),vertexColors:true});
  roofMaterial.name='gassho-aligned-weathered-reed';
  return roofMaterial;
}

/** Local ridge follows Z; two solid roof slopes, boarded gables and recessed attic windows. */
export function buildGasshoRoof(halfSpan:number,halfLength:number,base:number,tex:HouseMaterials,seed:number):GasshoPart[] {
  const parts:GasshoPart[]=[],rise=halfSpan*Math.tan(56*Math.PI/180),thickness=.40;
  const angle=Math.atan2(rise,halfSpan),length=Math.hypot(halfSpan,rise);
  const put=(geo:THREE.BufferGeometry,mat:THREE.Material)=>{parts.push({geo,mat});};
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat=tex.timber)=>{
    const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);put(g,mat);
  };
  for(const side of [-1,1]) {
    const g=new THREE.BoxGeometry(length,thickness,halfLength*2,8,1,8);
    // V follows the fall of the roof; the material's fibres therefore run down the slope.
    const p=g.getAttribute('position'),uv=g.getAttribute('uv');
    for(let i=0;i<p.count;i++)uv.setXY(i,p.getZ(i)/1.7,p.getX(i)/1.7);
    g.rotateZ(-side*angle);g.translate(side*halfSpan/2,base+rise/2,0);put(g,gasshoThatch());
    const count=Math.ceil(halfLength*2/.30);
    for(let i=0;i<count;i++) {
      const jitter=Math.sin(seed+i*47)*.035;
      box(.19,.33+jitter,halfLength*2/count,side*(halfSpan-.025),base-.035, -halfLength+(i+.5)*halfLength*2/count,gasshoThatch());
    }
  }
  // Rounded ridge cap, without the protruding board-roof rafters of the previous houses.
  const cap=new THREE.CylinderGeometry(.23,.23,halfLength*2+.08,8);
  cap.rotateX(Math.PI/2);cap.translate(0,base+rise+.10,0);put(cap,gasshoThatch());
  for(const side of [-1,1]) {
    const z=side*(halfLength-.5),span=halfSpan-.30;
    const top=rise*(span/halfSpan);
    const shape=new THREE.Shape();shape.moveTo(-span,0);shape.lineTo(span,0);shape.lineTo(0,top);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:false});g.translate(0,base,z-.06);put(g,tex.plankDark);
    for(let x=-span+.12;x<span;x+=.23) {
      const h=top*(1-Math.abs(x)/span);
      if(h>.1)box(.032,h,.055,x,base+h/2,z+side*.09,tex.timber);
    }
    // Two lower attic windows and one upper opening: the recognizable gable silhouette.
    for(const [x,y,w,h] of [[-.65,.72,.72,.85],[.65,.72,.72,.85],[0,top*.58,.62,.70]]) {
      if(y!+h!/2>top*(1-(Math.abs(x!)+w!/2)/span)-.10) continue;
      const face=z+side*.16;
      box(w!+.15,h!+.15,.06,x!,base+y!,face,tex.timber);
      box(w!,h!,.035,x!,base+y!,face+side*.045,tex.shojiMat);
      for(const dx of [-w!/2,0,w!/2])box(.035,h!+.03,.055,x!+dx,base+y!,face+side*.08);
      box(w!,.035,.055,x!,base+y!,face+side*.08);
      box(w!+.25,.075,.25,x!,base+y!-h!/2-.06,face+side*.04);
    }
    for(const t of [.04,.42])box(span*2*(1-t),.12,.15,0,base+top*t,z+side*.13);
    for(const s of [-1,1]) {
      const beam=new THREE.BoxGeometry(.12,Math.hypot(span,top),.15);
      beam.rotateZ(s*Math.atan2(span,top));beam.translate(s*span/2,base+top/2,z+side*.12);put(beam,tex.timber);
    }
  }
  return parts;
}
