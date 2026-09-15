import * as THREE from 'three';

// Near-village and mountain impostors must share GPU textures, not merely decoded image data.
const atlases=new Map<string,{texture:THREE.Texture;ready:Promise<THREE.Texture>}>();
function atlas(variant:'a'|'b') {
  const cached=atlases.get(variant);if(cached)return cached;
  let resolve!:(texture:THREE.Texture)=>void,reject!:(error:unknown)=>void;
  const ready=new Promise<THREE.Texture>((yes,no)=>{resolve=yes;reject=no;});
  // Synchronous users can render while loading; async users retain explicit failure handling.
  void ready.catch(()=>{});
  const texture=new THREE.TextureLoader().load(`/textures/impostors/cedar-${variant}-8.webp`,resolve,undefined,reject);
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;
  const entry={texture,ready};atlases.set(variant,entry);return entry;
}
export const getCedarAtlas=(variant:'a'|'b')=>atlas(variant).texture;
export const loadCedarAtlas=(variant:'a'|'b')=>atlas(variant).ready;
