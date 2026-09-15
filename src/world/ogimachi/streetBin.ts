import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
export async function loadStreetBin(){return (await new GLTFLoader().loadAsync('/models/ogimachi/street-bin.glb?v=1')).scene;}
export function addStreetBins(root:T.Group,asset:T.Group,support:(x:number,z:number)=>number){
  for(const z of [-71,-71.65]){
    const model=asset.clone(true);model.name='Blender-street-bin';model.position.set(-50.9,support(-50.9,z),z);
    model.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;}});root.add(model);
  }
}
