import * as THREE from 'three';
import {
  PhysicsWorld,
  type BodyKind,
  type PhysicsBody,
  type PhysicsBodyOptions,
} from './simple-physics';

export interface PhysicsBinding {
  object: THREE.Object3D;
  body: PhysicsBody;
  /** World-space offset from collider center to the object's pivot. */
  visualOffset: THREE.Vector3;
}

type InferredBodyOptions = Omit<PhysicsBodyOptions, 'position' | 'halfExtents'>;

const bounds = new THREE.Box3();
const center = new THREE.Vector3();
const size = new THREE.Vector3();
const pivot = new THREE.Vector3();
const target = new THREE.Vector3();

function bodyFromBounds(
  world: PhysicsWorld,
  object: THREE.Object3D,
  options: InferredBodyOptions,
): PhysicsBody {
  object.updateWorldMatrix(true, true);
  bounds.setFromObject(object, true);
  if (bounds.isEmpty()) throw new Error(`Cannot create collider from empty object: ${object.name || '(unnamed)'}`);

  bounds.getCenter(center);
  bounds.getSize(size);
  return world.addBody({
    ...options,
    position: { x: center.x, y: center.y, z: center.z },
    halfExtents: {
      x: Math.max(size.x * 0.5, 0.001),
      y: Math.max(size.y * 0.5, 0.001),
      z: Math.max(size.z * 0.5, 0.001),
    },
    userData: options.userData ?? object,
  });
}

/** Create one world-space AABB from an object after its transforms are final. */
export function addObjectCollider(
  world: PhysicsWorld,
  object: THREE.Object3D,
  kind: BodyKind = 'static',
  options: Omit<InferredBodyOptions, 'kind'> = {},
): PhysicsBody {
  return bodyFromBounds(world, object, { ...options, kind });
}

/**
 * Build static colliders from top-level named proxy nodes such as COL_Wall_01.
 * Descendant proxy nodes are skipped when an ancestor already matches.
 */
export function addNamedStaticColliders(
  world: PhysicsWorld,
  root: THREE.Object3D,
  prefix = 'COL_',
  options: Omit<InferredBodyOptions, 'kind'> = {},
): PhysicsBody[] {
  const matches = new Set<THREE.Object3D>();
  root.traverse((object) => {
    if (object.name.startsWith(prefix)) matches.add(object);
  });

  const topLevelMatches = [...matches].filter((object) => {
    let ancestor = object.parent;
    while (ancestor) {
      if (matches.has(ancestor)) return false;
      ancestor = ancestor.parent;
    }
    return true;
  });

  return topLevelMatches.map((object) => {
    const body = bodyFromBounds(world, object, { ...options, kind: 'static' });
    object.visible = false;
    return body;
  });
}

/** Create a body from visual bounds and remember the visual pivot offset. */
export function bindDynamicObject(
  world: PhysicsWorld,
  object: THREE.Object3D,
  options: Omit<InferredBodyOptions, 'kind'> = {},
): PhysicsBinding {
  const body = bodyFromBounds(world, object, { ...options, kind: 'dynamic' });
  object.getWorldPosition(pivot);
  return {
    object,
    body,
    visualOffset: pivot.clone().sub(new THREE.Vector3(body.position.x, body.position.y, body.position.z)),
  };
}

/** Copy a simulated world position to a render object while preserving its pivot offset. */
export function syncBinding(binding: PhysicsBinding): void {
  const { body, object, visualOffset } = binding;
  target.set(
    body.position.x + visualOffset.x,
    body.position.y + visualOffset.y,
    body.position.z + visualOffset.z,
  );

  if (object.parent) {
    object.parent.updateWorldMatrix(true, false);
    object.parent.worldToLocal(target);
  }
  object.position.copy(target);
}

export function syncBindings(bindings: readonly PhysicsBinding[]): void {
  for (const binding of bindings) syncBinding(binding);
}
