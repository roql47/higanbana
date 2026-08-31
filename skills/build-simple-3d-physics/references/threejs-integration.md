# Three.js and GLB/GLTF integration

## Contents

- Import and setup
- Model collider workflow
- Game-loop order
- Visual bindings
- Debugging and cleanup

## Import and setup

Copy both templates with `scripts/scaffold_physics.py --adapter three`, then adapt the relative imports if the project uses path aliases.

```ts
import { PhysicsWorld } from './physics/simple-physics';
import {
  addNamedStaticColliders,
  bindDynamicObject,
  syncBindings,
  type PhysicsBinding,
} from './physics/threejs-adapter';

const physics = new PhysicsWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
const bindings: PhysicsBinding[] = [];
```

## Model collider workflow

Apply final scale and transforms before extracting bounds. `updateWorldMatrix(true, true)` is required for nested GLB scenes.

```ts
gltf.scene.scale.setScalar(1);
scene.add(gltf.scene);
gltf.scene.updateWorldMatrix(true, true);

const staticBodies = addNamedStaticColliders(physics, gltf.scene, 'COL_');
```

Prefer authored proxy nodes. If a box-like asset has no proxy, use `addObjectCollider` once after loading. Avoid calling `Box3.setFromObject` every frame.

The adapter uses world-space AABBs. A rotated mesh produces a conservative enclosing box, not a rotated collider. Treat excessive empty volume as a signal to author a proxy or use an engine that supports oriented shapes.

## Game-loop order

```ts
function frame(nowMs: number) {
  const frameDelta = Math.min((nowMs - previousMs) / 1000, 0.1);
  previousMs = nowMs;

  updateIntent();
  applyDesiredVelocities();
  physics.update(frameDelta);
  handleContacts(physics.contacts);
  syncBindings(bindings);
  updateAnimationAndCamera(frameDelta);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
```

If the project has separate `update` and `lateUpdate` phases, step physics in `update` and sync camera-follow targets in `lateUpdate`.

## Visual bindings

`bindDynamicObject` creates an AABB from the visual's initial bounds and stores the world-space offset from collider center to model pivot.

```ts
const crateBinding = bindDynamicObject(physics, crate, {
  mass: 12,
  friction: 0.7,
  restitution: 0.05,
});
bindings.push(crateBinding);
```

The template does not simulate rotation. Preserve a dynamic object's existing visual rotation, but do not imply that its collider rotated with it.

For a player model, create the physics body from deliberate gameplay dimensions instead of skinned-mesh bounds. Animated bounds change with each pose and are unsuitable as a stable collider.

## Debugging and cleanup

- Render `Box3Helper` equivalents from body centers and half-extents in development builds.
- Log body IDs and model node names together through `userData`.
- On scene unload, remove bodies from `PhysicsWorld`, remove their bindings, and dispose only the Three.js resources owned by that scene.
- Compare contact body-pair IDs between frames to derive trigger enter, stay, and exit events.
- Run the project's typecheck after copying; Three.js releases can change type signatures.
