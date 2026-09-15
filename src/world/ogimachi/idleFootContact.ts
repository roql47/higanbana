import * as THREE from 'three';
/** Stationary contact only: leave authored stepping and airborne poses untouched. */
export function createIdleFootContact(root:THREE.Object3D,height:(x:number,z:number)=>number|null){
 const feet:{mesh:THREE.SkinnedMesh;bone:THREE.Bone;toe:THREE.Bone;indices:number[];raw:THREE.Quaternion|null;rawPosition:THREE.Vector3|null}[]=[];
 root.traverse(o=>{if(!(o instanceof THREE.SkinnedMesh))return;
  for(const side of ['L','R']){
   const bone=o.skeleton.bones.find(b=>b.name===`${side}_Foot`),toe=o.skeleton.bones.find(b=>b.name===`${side}_ToeBase`);if(!bone||!toe)continue;
   const joints=new Set([o.skeleton.bones.indexOf(bone),o.skeleton.bones.indexOf(toe)]);
   const skin=o.geometry.getAttribute('skinIndex'),weight=o.geometry.getAttribute('skinWeight'),indices:number[]=[];
   for(let i=0;i<skin.count;i++){let w=0;for(let j=0;j<4;j++)if(joints.has(skin.getComponent(i,j)))w+=weight.getComponent(i,j);if(w>.15)indices.push(i);}
   if(indices.length)feet.push({mesh:o,bone,toe,indices,raw:null,rawPosition:null});
  }
 });
 const point=new THREE.Vector3();
 function samples(f:typeof feet[number]){return f.indices.map(i=>f.mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(f.mesh.matrixWorld));}
 return {
  restore(){for(const f of feet)if(f.raw){f.bone.quaternion.copy(f.raw);f.raw=null;}for(const f of feet)if(f.rawPosition){f.bone.position.copy(f.rawPosition);f.rawPosition=null;}},
  update(){
   root.updateMatrixWorld(true);
   const support=new Map<typeof feet[number],{x:number;z:number;y:number;dx:number;dz:number;slope:number}>();
   for(const f of feet){
    for(let iteration=0;iteration<4;iteration++){
    const origin=f.bone.getWorldPosition(new THREE.Vector3()),direction=new THREE.Vector3(0,0,-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));direction.y=0;if(direction.lengthSq()<1e-8)continue;direction.normalize();
    const vertices=samples(f),projection=vertices.map(p=>point.copy(p).sub(origin).dot(direction));const lo=Math.min(...projection),hi=Math.max(...projection),span=hi-lo;if(span<.04)continue;
    let heel:THREE.Vector3|undefined,toe:THREE.Vector3|undefined;
    vertices.forEach((p,i)=>{if(projection[i]!<lo+span*.3&&(!heel||p.y<heel.y))heel=p;if(projection[i]!>hi-span*.3&&(!toe||p.y<toe.y))toe=p;});
    if(!heel||!toe)continue;
    const h=height(heel.x,heel.z),t=height(toe.x,toe.z);if(h===null||t===null)continue;
    const distance=toe.clone().sub(heel).dot(direction);
    support.set(f,{x:heel.x,z:heel.z,y:h,dx:direction.x,dz:direction.z,slope:(t-h)/distance});
    const from=toe.clone().sub(heel),to=from.clone();to.y=t-h;
    const correction=new THREE.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
    if(correction.angleTo(new THREE.Quaternion())>.9)continue;
    f.raw??=f.bone.quaternion.clone();
    const parent=f.bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    f.bone.quaternion.premultiply(parent.clone().invert().multiply(correction).multiply(parent));
    root.updateMatrixWorld(true);
    }
   }
   // Each foot has its own support height; a single body offset leaves the other foot hanging.
   for(const f of feet){
    const plane=support.get(f);if(!plane)continue;
    let gap=Infinity;
    for(const p of samples(f)){const h=plane.y+((p.x-plane.x)*plane.dx+(p.z-plane.z)*plane.dz)*plane.slope;gap=Math.min(gap,p.y-h);}
    if(Number.isFinite(gap)&&Math.abs(gap)<.25){
     f.rawPosition=f.bone.position.clone();
     const parent=f.bone.parent!;
     const origin=parent.worldToLocal(f.bone.getWorldPosition(new THREE.Vector3()));
     const target=parent.worldToLocal(f.bone.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-gap,0)));
     f.bone.position.add(target.sub(origin));root.updateMatrixWorld(true);
    }
   }
  }
 };
}
