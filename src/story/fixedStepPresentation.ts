import * as THREE from 'three';

/** Present fixed-step movement between simulation ticks without changing physics. */
export class FixedStepPresentation {
  private previous = new THREE.Vector3();
  private delta = new THREE.Vector3();
  constructor(position: THREE.Vector3) { this.previous.copy(position); }
  beforeStep(position: THREE.Vector3) { this.previous.copy(position); }
  offset(position: THREE.Vector3, remainder: number, step: number) {
    // Cinematic teleports must not sweep across the map.
    if (this.previous.distanceToSquared(position) > 4) this.previous.copy(position);
    return this.delta.lerpVectors(this.previous, position, THREE.MathUtils.clamp(remainder / step, 0, 1)).sub(position);
  }
}
