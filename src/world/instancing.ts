import * as THREE from 'three';

/** 공간 청크 하나에 들어갈 인스턴스 데이터. */
export interface SpatialInstance {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

/** 원본 인스턴스 번호가 어느 청크의 몇 번째 슬롯으로 갔는지 가리킨다. */
export interface SpatialInstanceRef {
  mesh: THREE.InstancedMesh;
  index: number;
}

interface SpatialInstancingOptions {
  cellSize: number;
  name: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** 바람·애니메이션으로 지오메트리가 바운딩 밖으로 움직이는 만큼의 여유. */
  boundsPadding?: number;
  usage?: THREE.Usage;
}

/**
 * 맵 전역의 인스턴스를 하나의 거대한 InstancedMesh 로 만들면 Three.js 는 개별 인스턴스를
 * 프러스텀 컬링하지 못한다. 월드 XZ 격자로 나눠, 화면 밖 청크는 드로우콜 자체가 생기지 않게 한다.
 */
export function createSpatialInstancedMeshes(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  instances: readonly SpatialInstance[],
  opts: SpatialInstancingOptions,
) {
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < instances.length; i++) {
    const e = instances[i]!.matrix.elements;
    const cx = Math.floor(e[12]! / opts.cellSize);
    const cz = Math.floor(e[14]! / opts.cellSize);
    const key = `${cx}:${cz}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }

  const meshes: THREE.InstancedMesh[] = [];
  const refs: SpatialInstanceRef[] = new Array(instances.length);
  let chunk = 0;
  for (const indices of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, indices.length);
    mesh.name = `${opts.name}-${chunk++}`;
    mesh.castShadow = opts.castShadow ?? false;
    mesh.receiveShadow = opts.receiveShadow ?? false;
    mesh.frustumCulled = true;
    mesh.instanceMatrix.setUsage(opts.usage ?? THREE.StaticDrawUsage);
    for (let local = 0; local < indices.length; local++) {
      const global = indices[local]!;
      const instance = instances[global]!;
      mesh.setMatrixAt(local, instance.matrix);
      if (instance.color) mesh.setColorAt(local, instance.color);
      refs[global] = { mesh, index: local };
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += opts.boundsPadding ?? 0;
    meshes.push(mesh);
    parent.add(mesh);
  }
  return { meshes, refs };
}

const worldCenter = new THREE.Vector3();

/** 청크의 가장 가까운 끝이 거리 안에 있을 때만 표시한다. */
export function updateChunkDistanceVisibility(
  meshes: readonly THREE.InstancedMesh[],
  center: THREE.Vector3,
  maxDistance: number,
) {
  for (const mesh of meshes) {
    const sphere = mesh.boundingSphere;
    if (!sphere) continue;
    mesh.updateWorldMatrix(true, false);
    worldCenter.copy(sphere.center).applyMatrix4(mesh.matrixWorld);
    const radius = sphere.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    const limit = maxDistance + radius;
    mesh.visible = worldCenter.distanceToSquared(center) <= limit * limit;
  }
}

/**
 * 같은 인스턴스 목록으로 만든 고해상도/빌보드 청크를 거리별로 하나만 보이게 한다.
 * 청크의 중심이 아니라 가장 가까운 경계까지의 거리를 써서, 눈앞의 꽃 일부가 카드로 바뀌지 않게 한다.
 */
export function updatePairedChunkLodVisibility(
  nearMeshes: readonly THREE.InstancedMesh[],
  farMeshes: readonly THREE.InstancedMesh[],
  center: THREE.Vector3,
  switchDistance: number,
  maxDistance: number,
) {
  const count = Math.max(nearMeshes.length, farMeshes.length);
  for (let i = 0; i < count; i++) {
    const near = nearMeshes[i];
    const far = farMeshes[i];
    const reference = near ?? far;
    const sphere = reference?.boundingSphere;
    if (!reference || !sphere) {
      if (near) near.visible = false;
      if (far) far.visible = false;
      continue;
    }
    reference.updateWorldMatrix(true, false);
    worldCenter.copy(sphere.center).applyMatrix4(reference.matrixWorld);
    const radius = sphere.radius * reference.matrixWorld.getMaxScaleOnAxis();
    const centerDistance = worldCenter.distanceTo(center);
    const surfaceDistance = Math.max(0, centerDistance - radius);
    const inFogRange = centerDistance <= maxDistance + radius;
    if (near) near.visible = inFogRange && surfaceDistance <= switchDistance;
    if (far) far.visible = inFogRange && surfaceDistance > switchDistance;
  }
}

/**
 * 같은 인스턴스 목록으로 만든 근경/중경/원경 청크를 세 구간으로 나눠 표시한다.
 * `surfaceDistance` 를 쓰므로 큰 청크의 일부가 플레이어 가까이에 닿아 있으면 성급하게
 * 낮은 LOD 로 바뀌지 않는다. 세 벌은 같은 `cellSize` 와 인스턴스 순서로 만들어야 한다.
 */
export function updateTripleChunkLodVisibility(
  nearMeshes: readonly THREE.InstancedMesh[],
  midMeshes: readonly THREE.InstancedMesh[],
  farMeshes: readonly THREE.InstancedMesh[],
  center: THREE.Vector3,
  nearDistance: number,
  midDistance: number,
  maxDistance: number,
) {
  const count = Math.max(nearMeshes.length, midMeshes.length, farMeshes.length);
  for (let i = 0; i < count; i++) {
    const near = nearMeshes[i];
    const mid = midMeshes[i];
    const far = farMeshes[i];
    const reference = near ?? mid ?? far;
    const sphere = reference?.boundingSphere;
    if (!reference || !sphere) {
      if (near) near.visible = false;
      if (mid) mid.visible = false;
      if (far) far.visible = false;
      continue;
    }
    reference.updateWorldMatrix(true, false);
    worldCenter.copy(sphere.center).applyMatrix4(reference.matrixWorld);
    const radius = sphere.radius * reference.matrixWorld.getMaxScaleOnAxis();
    const centerDistance = worldCenter.distanceTo(center);
    const surfaceDistance = Math.max(0, centerDistance - radius);
    const inFogRange = centerDistance <= maxDistance + radius;
    if (near) near.visible = inFogRange && surfaceDistance <= nearDistance;
    if (mid) mid.visible = inFogRange && surfaceDistance > nearDistance && surfaceDistance <= midDistance;
    if (far) far.visible = inFogRange && surfaceDistance > midDistance;
  }
}

/** FogExp2 에 완전히 섞여 육안으로 구분되지 않는 거리를 컬링 거리로 쓴다. */
export function fogCullDistance(density: number, residual = 0.003, cap = 400) {
  if (density <= 0) return cap;
  return Math.min(cap, Math.sqrt(-Math.log(residual)) / density);
}
