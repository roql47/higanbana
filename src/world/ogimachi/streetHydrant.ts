import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function loadStreetHydrant(){return (await new GLTFLoader().loadAsync('/models/ogimachi/street-hydrant.glb?v=1')).scene;}
export function addStreetHydrant(root:T.Group,asset:T.Group,support:(x:number,z:number)=>number){
  const x=-54.9,z=-33,base=support(x,z),group=new T.Group();group.name='Blender-street-hydrant';group.position.set(x,base,z);
  asset.updateMatrixWorld(true);
  asset.traverse(o=>{if(!(o instanceof T.Mesh))return;
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),p=geometry.getAttribute('position');
    // Fit only the plinth underside to the earth, preserving level mechanical parts.
    for(let i=0;i<p.count;i++){const y=p.getY(i);p.setY(i,y+(1-T.MathUtils.clamp(y/.15,0,1))*(support(x+p.getX(i),z+p.getZ(i))-base));}
    geometry.computeVertexNormals();const mesh=new T.Mesh(geometry,o.material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  });root.add(group);
}
