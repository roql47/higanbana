import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

export const STREET_POT_POSITIONS=[[-65,-13],[-65,0],[-51.1,-53],[-51.3,-73]] as const;
export async function loadStreetPot(){return (await new GLTFLoader().loadAsync('/models/ogimachi/fern-pot.glb?v=1')).scene;}
export function addStreetPots(root:T.Group,asset:T.Group,support:(x:number,z:number)=>number){
  for(const [i,[x,z]] of STREET_POT_POSITIONS.entries()){
    const model=asset.clone(true);model.name='Tripo-Blender-fern-pot';model.position.set(x,support(x,z),z);model.rotation.y=i*1.7;
    model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});root.add(model);
  }
}
