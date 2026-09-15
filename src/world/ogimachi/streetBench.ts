import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadStreetBench(){return (await new GLTFLoader().loadAsync('/models/ogimachi/street-bench.glb?v=1')).scene;}
export function addStreetBenches(root:T.Group,asset:T.Group,support:(x:number,z:number)=>number){
  asset.updateMatrixWorld(true);
  for(const collider of root.children.filter(o=>o.name==='COL_ACT1_bench')){
    const x=collider.position.x,z=collider.position.z,base=Math.max(support(x,z-.61),support(x,z+.61));
    const group=new T.Group();group.name='Blender-street-bench';group.position.set(x,base,z);
    asset.traverse(o=>{if(!(o instanceof T.Mesh))return;
      const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),p=geometry.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const y=p.getY(i),weight=1-T.MathUtils.clamp(y/.38,0,1);
        p.setY(i,y+weight*(support(x+p.getX(i),z+p.getZ(i))-base));
      }
      geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,o.material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    });root.add(group);
  }
}
