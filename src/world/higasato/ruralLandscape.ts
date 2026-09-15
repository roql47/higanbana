import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LANES, SETTLEMENT_LANES, ROUTES, type HigasatoGround } from './ground';
import { SETTLEMENT_FIELDS } from './settlementPlan';
import { makeAxialBillboardMaterial, makeBillboardPlane } from '../billboard';
import { getCedarAtlas } from '../cedarAtlas';

/** Agricultural foreground and a mixed forest skyline, all shared/instanced and shadow-free. */
export class RuralLandscape {
  readonly group=new THREE.Group();
  constructor(ground:HigasatoGround) {
    this.group.name='ogimachi-inspired-landscape';
    const roadPositions:number[]=[],roadColors:number[]=[],roadUv:number[]=[];
    for(const [index,path] of [ROUTES[0]!,...LANES,...SETTLEMENT_LANES].entries()) {
      for(let i=1;i<path.pts.length;i++) {
        const [ax,az]=path.pts[i-1]!,[bx,bz]=path.pts[i]!,length=Math.hypot(bx-ax,bz-az);
        const nx=-(bz-az)/length,nz=(bx-ax)/length,steps=Math.ceil(length/.65);
        for(let step=0;step<steps;step++) {
          const points=[[-1,step],[-1,step+1],[1,step+1],[1,step]];
          for(const corner of [0,2,1,0,3,2]) {
            const [side,k]=points[corner]!,t=k!/steps;
            const x=ax+(bx-ax)*t+nx*side!*path.halfWidth*.88,z=az+(bz-az)*t+nz*side!*path.halfWidth*.88;
            roadPositions.push(x,ground.heightAt(x,z)+.045+index*.0003,z);roadUv.push(x/1.4,z/1.4);
            const tone=path.surface==='gravel'?.57:.42;roadColors.push(tone,tone*.96,tone*.86);
          }
        }
      }
    }
    const roadGeo=new THREE.BufferGeometry();roadGeo.setAttribute('position',new THREE.Float32BufferAttribute(roadPositions,3));
    roadGeo.setAttribute('color',new THREE.Float32BufferAttribute(roadColors,3));roadGeo.setAttribute('uv',new THREE.Float32BufferAttribute(roadUv,2));roadGeo.computeVertexNormals();
    const grain=new Uint8Array(128*128*4);
    for(let i=0;i<128*128;i++){const value=175+Math.sin(i*731.17)*28;grain.set([value,value,value,255],i*4);}
    const roadMap=new THREE.DataTexture(grain,128,128);roadMap.colorSpace=THREE.SRGBColorSpace;roadMap.wrapS=roadMap.wrapT=THREE.RepeatWrapping;
    roadMap.generateMipmaps=true;roadMap.minFilter=THREE.LinearMipmapLinearFilter;roadMap.magFilter=THREE.LinearFilter;roadMap.needsUpdate=true;
    const road=new THREE.Mesh(roadGeo,new THREE.MeshStandardMaterial({map:roadMap,vertexColors:true,roughness:1}));road.name='village-gravel-and-earth-lanes';road.receiveShadow=true;this.group.add(road);
    const waterParts:THREE.BufferGeometry[]=[],bankParts:THREE.BufferGeometry[]=[];
    const riceTransforms:THREE.Matrix4[]=[];
    const dummy=new THREE.Object3D();
    for(const f of SETTLEMENT_FIELDS) {
      const y=ground.fieldWaterHeight(f.x,f.z);
      const water=new THREE.PlaneGeometry(f.w-1.3,f.d-1.3);
      water.rotateX(-Math.PI/2);water.translate(f.x,y,f.z);waterParts.push(water);
      for(const side of [-1,1])for(const horizontal of [true,false]) {
        const bank=new THREE.BoxGeometry(horizontal?f.w:.38,.07,horizontal?.38:f.d, horizontal?12:1,1,horizontal?1:12);
        bank.translate(f.x+(horizontal?0:side*f.w/2),0,f.z+(horizontal?side*f.d/2:0));
        const p=bank.getAttribute('position');
        for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+ground.heightAt(p.getX(i),p.getZ(i))+.025);
        bank.computeVertexNormals();bankParts.push(bank);
      }
      for(let z=f.z-f.d/2+.9;z<f.z+f.d/2-.8;z+=.48)for(let x=f.x-f.w/2+.9;x<f.x+f.w/2-.8;x+=.38) {
        const n=Math.sin(x*81.2+z*47.9);
        dummy.position.set(x+n*.035,y-.09,z+n*.03);dummy.rotation.set(0,n*.4,0);
        dummy.scale.setScalar(.8+(n+1)*.13);dummy.updateMatrix();riceTransforms.push(dummy.matrix.clone());
      }
    }
    const addMerged=(parts:THREE.BufferGeometry[],mat:THREE.Material,name:string)=>{
      const geo=mergeGeometries(parts,false)!;for(const g of parts)g.dispose();
      const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.receiveShadow=true;this.group.add(mesh);
    };
    addMerged(waterParts,new THREE.MeshStandardMaterial({color:0x526a65,roughness:.24,metalness:.18}), 'farm-shallow-water');
    addMerged(bankParts,new THREE.MeshStandardMaterial({color:0x4a5532,roughness:1}), 'grass-field-bunds');
    const verts:number[]=[];
    for(let i=0;i<5;i++) {
      const a=i*Math.PI*2/5,dx=Math.cos(a),dz=Math.sin(a);
      verts.push(-dz*.015,0,dx*.015,dz*.015,0,-dx*.015,dx*.09,.43,dz*.09);
    }
    const blade=new THREE.BufferGeometry();blade.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));blade.computeVertexNormals();
    const rice=new THREE.InstancedMesh(blade,new THREE.MeshStandardMaterial({color:0x65843a,side:THREE.DoubleSide,roughness:.95}),riceTransforms.length);
    riceTransforms.forEach((m,i)=>rice.setMatrixAt(i,m));rice.computeBoundingSphere();rice.name='farm-young-rice';this.group.add(rice);

    // Reuse the actual cedar-model atlas. Two triangles per distant tree, without cone-shaped crowns.
    let state=41921;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    for(const variant of ['a','b'] as const) {
      const map=getCedarAtlas(variant);
      const mat=makeAxialBillboardMaterial(map,{alphaTest:.3,color:0x435847,atlas:{frames:8,columns:4,rows:2}});
      const mesh=new THREE.InstancedMesh(makeBillboardPlane(9,19),mat,1200);
      for(let i=0;i<1200;i++) {
        let x:number,z:number;
        do{x=(random()*2-1)*230;z=(random()*2-1)*230;}while(Math.max(Math.abs(x),Math.abs(z))<104);
        dummy.position.set(x,ground.backdropHeightAt(x,z)-1,z);dummy.rotation.set(0,random()*Math.PI*2,0);
        const scale=.75+random()*.55;dummy.scale.set(scale,scale,scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.computeBoundingSphere();mesh.name=`mountain-forest-${variant}`;this.group.add(mesh);
    }
  }
}
