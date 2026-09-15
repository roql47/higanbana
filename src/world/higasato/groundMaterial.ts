import * as THREE from 'three';
import type {TerrainTextures} from '../terrain';

/** Shared with the original Higasato terrain: 4 m world UVs and two-scale mixing. */
export function createHigasatoGroundMaterial(textures:TerrainTextures){
  const mat=new THREE.MeshStandardMaterial({map:textures.map,normalMap:textures.normalMap,
    normalScale:new THREE.Vector2(1,1),aoMap:textures.armMap,aoMapIntensity:.5,
    roughnessMap:textures.armMap,metalness:0,roughness:1,vertexColors:true});
  mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
    vec4 texA = texture2D( map, vMapUv );
    vec4 texB = texture2D( map, vMapUv * 0.29 + vec2( 0.41, 0.13 ) );
    diffuseColor *= mix( texA, texB, 0.45 );
  #endif`);};
  return mat;
}
