import * as THREE from 'three';

/**
 * 양자화(normalized Int16/Int8)·인터리브 속성을 일반 Float32 BufferAttribute 로 풀어낸 복제본을 만든다.
 * meshopt/quantize 로 압축된 GLB 지오메트리는 그대로 translate/scale 하면 [-1,1] 범위에서 잘리므로 변환 전에 반드시 통과시킨다.
 */
export function toFloatGeometry(src: THREE.BufferGeometry, matrix?: THREE.Matrix4): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.attributes[name] as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const size = a.itemSize;
    const arr = new Float32Array(a.count * size);
    for (let i = 0; i < a.count; i++) {
      arr[i * size] = a.getX(i);
      if (size > 1) arr[i * size + 1] = a.getY(i);
      if (size > 2) arr[i * size + 2] = a.getZ(i);
      if (size > 3) arr[i * size + 3] = a.getW(i);
    }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (src.index) geo.setIndex(src.index.clone());
  for (const g of src.groups) geo.addGroup(g.start, g.count, g.materialIndex);
  if (matrix) geo.applyMatrix4(matrix);
  return geo;
}
