import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function loadStreetLamp(){return (await new GLTFLoader().loadAsync('/models/ogimachi/street-lamp.glb?v=1')).scene;}
export function addStreetLamps(root:T.Group,asset:T.Group,support:(x:number,z:number)=>number){
  for(const [x,z] of [[-54,-28],[-68,-84]] as const){
    const model=asset.clone(true);model.name='Blender-street-lamp';model.position.set(x,support(x,z)-.02,z);
    model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});root.add(model);
  }
}
