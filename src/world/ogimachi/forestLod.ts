import * as T from 'three';
export type ForestQuality='standard'|'low';
export interface Canopy {x:number;z:number;y:number;r:number;h:number;color:T.Color}
export function forestLevel(distance:number,quality:ForestQuality){
  if(distance>(quality==='low'?850:1300))return {fraction:0,detail:false,shadow:false};
  if(distance<350)return {fraction:quality==='low'?.6:1,detail:quality==='standard',shadow:quality==='standard'&&distance<180};
  if(distance<700)return {fraction:quality==='low'?.25:.5,detail:false,shadow:false};
  return {fraction:quality==='low'?.125:.25,detail:false,shadow:false};
}
/** Shared geometry, spatial culling and deterministic prefixes; no per-frame allocation of buffers. */
export class CanopyForest extends T.Group{
  private detailed=new T.IcosahedronGeometry(1,1);
  private coarse=new T.IcosahedronGeometry(1,0);
  private material=new T.MeshStandardMaterial({color:0xffffff,roughness:1});
  private tiles:{mesh:T.InstancedMesh;count:number;center:T.Vector3;radius:number}[]=[];
  submitted=0;triangles=0;shadowTrees=0;
  constructor(items:Canopy[]){super();const cells=new Map<string,Canopy[]>(),dummy=new T.Object3D();
    for(const o of items){const key=`${Math.floor(o.x/160)},${Math.floor(o.z/160)}`,list=cells.get(key)??[];list.push(o);cells.set(key,list);}
    for(const [key,list] of cells){const mesh=new T.InstancedMesh(this.detailed,this.material,list.length);
      // Generation order is deterministic random sampling, so prefixes are spatially mixed.
      list.forEach((o,i)=>{dummy.position.set(o.x,o.y,o.z);dummy.scale.set(o.r,o.h*.65,o.r*.87);dummy.rotation.y=(Math.sin(o.x*12.9898+o.z*78.233)*43758.5453%1)*Math.PI;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,o.color);});
      mesh.name=`woodland-tile-${key}`;mesh.receiveShadow=true;mesh.computeBoundingSphere();const bounds=mesh.boundingSphere!;
      this.tiles.push({mesh,count:list.length,center:bounds.center.clone(),radius:bounds.radius});this.add(mesh);
    }
  }
  update(eye:T.Vector3,quality:ForestQuality){let changed=false;this.submitted=0;this.triangles=0;this.shadowTrees=0;
    for(const tile of this.tiles){const level=forestLevel(Math.max(0,eye.distanceTo(tile.center)-tile.radius),quality),count=Math.ceil(tile.count*level.fraction),geometry=level.detail?this.detailed:this.coarse,m=tile.mesh;
      if(m.count!==count||m.geometry!==geometry||m.castShadow!==level.shadow){changed=true;m.count=count;m.geometry=geometry;m.castShadow=level.shadow;m.visible=count>0;}
      this.submitted+=count;this.triangles+=count*(level.detail?80:20);if(level.shadow)this.shadowTrees+=count;
    }return changed;
  }
  dispose(){for(const t of this.tiles)t.mesh.dispose();this.detailed.dispose();this.coarse.dispose();this.material.dispose();}
}
