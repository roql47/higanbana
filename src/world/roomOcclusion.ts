import * as THREE from 'three';

const corner = new THREE.Vector3();
const ray = new THREE.Ray();
const hit = new THREE.Vector3();

/** All eight corners must lie in the shadow volume of ONE convex opaque box.
 * Testing each corner against a different wall would incorrectly close doorways.
 * Wall bounds are inset and target bounds expanded, favouring a visible result.
 */
export function boxOccluded(bounds: THREE.Box3, walls: readonly THREE.Box3[], eye: THREE.Vector3,
  towardLight?: THREE.Vector3): boolean {
  if (bounds.isEmpty() || bounds.containsPoint(eye) && !towardLight) return false;
  for (const wall of walls) {
    if (wall.intersectsBox(bounds) || !towardLight && wall.containsPoint(eye)) continue;
    let covered = true;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z);
      if (towardLight) {
        ray.origin.copy(corner); ray.direction.copy(towardLight);
        if (!ray.intersectBox(wall, hit)) { covered = false; break; }
      } else {
        ray.origin.copy(eye); ray.direction.subVectors(corner, eye).normalize();
        if (!ray.intersectBox(wall, hit) || hit.distanceToSquared(eye) >= corner.distanceToSquared(eye) - 1e-5) {
          covered = false; break;
        }
      }
    }
    if (covered) return true;
  }
  return false;
}

/** Furniture only: walls, collision, lights and story state remain independent.
 * Visibility is temporary for the main render and restored before mirror renders.
 */
export class RoomOcclusion {
  private walls: THREE.Box3[] = [];
  private region = new THREE.Box3();
  private hidden: THREE.Object3D[] = [];
  private localBounds = new WeakMap<THREE.Object3D, THREE.Box3 | null>();
  private bounds = new THREE.Box3();
  private lightPosition = new THREE.Vector3();
  private lightTarget = new THREE.Vector3();
  private eye = new THREE.Vector3();
  lastHidden = 0;
  addBox = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    // Only substantial, axis-aligned opaque wall/ceiling slabs are worth testing.
    if (!(h >= 1.5 && Math.max(w, d) >= 1 && Math.min(w, d) <= 0.4 || w * d >= 4 && h <= 0.4)) return;
    const box = new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)).expandByScalar(-0.01);
    if (!box.isEmpty()) { this.walls.push(box); this.region.union(box); }
  };
  nearby(camera: THREE.Camera) {
    camera.getWorldPosition(this.eye);
    return this.region.distanceToPoint(this.eye) < 40;
  }
  apply(camera: THREE.Camera, roots: readonly THREE.Object3D[], shadowLights: readonly THREE.Light[]) {
    this.restore(); this.lastHidden = 0;
    if (!this.nearby(camera)) return;
    for (const root of roots) {
      if (!root.visible || !root.parent?.visible) continue;
      let local = this.localBounds.get(root);
      if (local === undefined) {
        let animated = false;
        root.traverse(object => {
          if ((object as THREE.Light).isLight || (object as THREE.SkinnedMesh).isSkinnedMesh) animated = true;
        });
        root.updateWorldMatrix(true, true);
        local = animated ? null : new THREE.Box3().setFromObject(root)
          .applyMatrix4(root.matrixWorld.clone().invert()).expandByScalar(0.1);
        this.localBounds.set(root, local);
      }
      if (!local) continue;
      root.updateWorldMatrix(true, false);
      this.bounds.copy(local).applyMatrix4(root.matrixWorld);
      if (!boxOccluded(this.bounds, this.walls, this.eye)) continue;
      // An unseen furniture piece can still cast a visible shadow through a door.
      // Keep it unless every shadow light is out of range or blocked by a wall.
      const neededForShadow = shadowLights.some(light => {
        light.getWorldPosition(this.lightPosition);
        if ((light as THREE.DirectionalLight).isDirectionalLight) {
          (light as THREE.DirectionalLight).target.getWorldPosition(this.lightTarget);
          this.lightPosition.sub(this.lightTarget).normalize();
          return !boxOccluded(this.bounds, this.walls, this.eye, this.lightPosition);
        }
        if ((light as THREE.PointLight).isPointLight || (light as THREE.SpotLight).isSpotLight) {
          const distance = (light as THREE.PointLight).distance;
          if (distance > 0 && this.bounds.distanceToPoint(this.lightPosition) > distance) return false;
          return !boxOccluded(this.bounds, this.walls, this.lightPosition);
        }
        return true; // unknown light type: retain its potential shadow caster
      });
      if (!neededForShadow) { root.visible = false; this.hidden.push(root); }
    }
    this.lastHidden = this.hidden.length;
  }
  restore() {
    for (const root of this.hidden) root.visible = true;
    this.hidden.length = 0;
  }
}
