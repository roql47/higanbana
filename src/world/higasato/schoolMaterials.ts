import * as THREE from 'three';
import { tileTex } from './kit';

interface SchoolMaterials {
  plaster: THREE.MeshStandardMaterial;
}

let cached: SchoolMaterials | undefined;

/**
 * 폐교 전용 1K 회벽 재질.
 *
 * 세 맵만 공유하고 모든 칸막이는 한 메시로 병합된다. AO·roughness는 한 ARM 텍스처에
 * 같이 들어 있으므로 디테일을 늘려도 텍스처 메모리와 샘플 수가 불필요하게 늘지 않는다.
 */
export function makeSchoolMaterials(): SchoolMaterials {
  if (cached) return cached;

  const albedo = tileTex('/textures/school/aged-school-plaster-diff-1k.webp', true);
  const normal = tileTex('/textures/school/aged-school-plaster-nor-gl-1k.webp', false);
  const arm = tileTex('/textures/school/aged-school-plaster-arm-512.webp', false);
  arm.channel = 0;

  const plaster = new THREE.MeshStandardMaterial({
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.58, 0.58),
    aoMap: arm,
    aoMapIntensity: 0.72,
    roughnessMap: arm,
    roughness: 1,
    metalness: 0,
    color: 0xffffff,
    vertexColors: true,
  });
  plaster.name = 'school-aged-plaster-1k';

  cached = { plaster };
  return cached;
}
