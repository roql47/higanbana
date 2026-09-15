import * as THREE from 'three';

/**
 * Three r185 updates objects before incrementing the render frame, but its shadow
 * pass updates them after it. With intermittent shadows, the next main pass can
 * consider the previous skeleton current. Explicitly upload the final pose after
 * presentation transforms so skipped shadow frames never draw stale bones.
 */
export function syncSkinnedPose(root: THREE.Object3D) {
  if (!root.visible) return;
  root.updateMatrixWorld(true);
  const updated = new Set<THREE.Skeleton>();
  root.traverseVisible(object => {
    if (!(object instanceof THREE.SkinnedMesh) || updated.has(object.skeleton)) return;
    object.skeleton.update(); updated.add(object.skeleton);
  });
}
