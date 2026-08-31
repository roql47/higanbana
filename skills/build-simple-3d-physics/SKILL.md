---
name: build-simple-3d-physics
description: Build or adapt a lightweight, deterministic 3D game-physics layer around imported model assets. Use when a TypeScript or JavaScript 3D game—especially Three.js with GLB/GLTF models—needs gravity, fixed-step simulation, ground and wall collision, jumping, simple moving bodies, triggers, collision layers, or render/physics synchronization without full rigid-body simulation. Also use to decide whether an existing engine such as Rapier, Cannon, Ammo, or a framework-native physics API should be retained instead. Do not use for 2D-only physics or model authoring.
---

# Build Simple 3D Physics

Create the smallest physics system that satisfies the game's interactions, fits its existing stack, and remains deterministic enough to debug.

## Operating rules

- Inspect the target repository before choosing an implementation. Find its renderer, update loop, model loader, units, up axis, dependency set, tests, and any existing collision or physics code.
- Keep exactly one authority for position. Physics owns simulated world transforms; rendering reads them after each physics step.
- Prefer an existing installed physics engine over adding a second one. Extend the project's current Rapier/Cannon/Ammo/framework integration when present.
- Treat render meshes and colliders as separate assets. Use boxes, spheres, capsules, and explicit proxy meshes; do not turn every visible triangle into a collider.
- Use a fixed simulation step, normally 1/60 second. Clamp frame deltas and cap catch-up steps.
- Establish scale before tuning: default to 1 world unit = 1 meter and Y-up unless the project already defines another convention.
- Preserve unrelated project behavior and dependencies. Avoid architectural rewrites unless the request requires them.

## Choose the implementation

1. Reuse the project's existing physics package when it already owns gameplay collisions.
2. Use the bundled TypeScript template when the game needs only axis-aligned boxes, gravity, basic dynamic or kinematic bodies, triggers, and fewer than roughly 200 active bodies.
3. Use a mature engine when requirements include rotated colliders, slopes that must feel physical, capsule sweeps, stable body stacking, joints, vehicles, ragdolls, continuous collision detection, or large simulations.

Read [references/physics-design.md](references/physics-design.md) when choosing colliders, defining units, or deciding whether the lightweight template is sufficient. Read [references/threejs-integration.md](references/threejs-integration.md) for Three.js or GLB/GLTF projects.

## Workflow

### 1. Map the target project

- Locate the render loop and record its exact update order.
- Identify the gameplay objects that need collision and classify each as static, dynamic, kinematic, or trigger.
- Inspect model bounds, pivots, nested transforms, and world scale. Prefer authored nodes named `COL_*`, `TRIGGER_*`, or the project's equivalent.
- Write a short interaction list such as: player stands on floor, cannot cross walls, can jump only while grounded, crate falls, goal trigger fires.

### 2. Define the physics contract

Set these explicitly before coding:

- coordinate system and units;
- fixed timestep and maximum substeps;
- body kinds and supported collider shapes;
- collision layers and masks;
- who owns transforms and when render objects synchronize;
- required contact or trigger events;
- known non-goals.

### 3. Scaffold or adapt

For a compatible TypeScript project, copy the standalone engine and optional Three.js adapter:

```bash
python3 <skill-dir>/scripts/scaffold_physics.py \
  --target <project>/src/physics \
  --adapter three
```

Use `--adapter none` for a renderer-neutral copy. The script refuses to overwrite files unless `--force` is passed. Adapt import aliases, naming, and public APIs to the target repository instead of forcing the template's structure onto it.

If the project already uses a physics library, do not run the scaffold script. Implement the same contract through the existing library's bodies and colliders.

### 4. Integrate in a stable order

Use this frame order unless the project has a documented alternative:

1. Read input and AI intent.
2. Update kinematic targets or desired velocities.
3. Advance physics with the accumulated fixed timestep.
4. Read contacts and trigger state.
5. Synchronize render transforms from physics bodies.
6. Update animation and camera from the synchronized transforms.
7. Render.

Never multiply movement by both render delta and physics delta. Apply gravity only inside fixed physics steps.

### 5. Build model colliders

- Prefer explicit low-poly proxy nodes exported with the model.
- Fall back to world-space bounding boxes only for box-like objects.
- Store a pivot-to-collider-center offset when the visual origin differs from its bounds center.
- Recompute bounds after model scale and transforms are final, not on every frame.
- Keep collider debug visualization available in development builds.

### 6. Verify behavior

Test at 30, 60, and 120 render FPS when possible. At minimum verify:

- a falling body settles on a floor without sinking or gaining energy;
- walls block movement from both directions;
- the player cannot jump repeatedly in midair;
- a corner contact does not eject the player unpredictably;
- triggers report overlap without pushing bodies;
- collision masks suppress the intended pairs;
- a long frame is clamped and does not cause an unbounded catch-up loop;
- removing a body also removes its render binding and gameplay references.

Run the repository's typecheck, tests, and build. Report the supported shapes and explicit limitations with the result.

## Bundled resources

- `assets/typescript/simple-physics.ts`: renderer-neutral AABB physics world with fixed stepping, gravity, friction, restitution, triggers, and layers.
- `assets/typescript/threejs-adapter.ts`: collider extraction and visual binding helpers for Three.js.
- `scripts/scaffold_physics.py`: safely copy the templates into a target project.
- `references/physics-design.md`: scope, collider, tuning, and escalation guidance.
- `references/threejs-integration.md`: GLB/GLTF and game-loop integration patterns.
