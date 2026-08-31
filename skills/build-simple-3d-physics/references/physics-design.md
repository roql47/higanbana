# Lightweight 3D physics design guide

## Contents

- Scope decision
- World contract
- Body and collider choices
- Character movement
- Tuning order
- Failure modes
- Escalation boundary

## Scope decision

Use the bundled AABB engine for small arcade interactions where predictable behavior matters more than physical realism. Its collision pass is O(n²), boxes never rotate, and fast bodies can tunnel.

Keep or add a mature physics engine when any core feature depends on rotated boxes, capsules, slopes, mesh colliders, joints, angular velocity, stable piles, vehicles, ragdolls, or continuous collision detection. If the repository already includes one, extending it is normally less risky than maintaining two simulations.

## World contract

- Prefer Y-up and 1 unit = 1 meter for a new project.
- Use a fixed 1/60-second step and no more than 4–8 catch-up steps.
- Clamp render-frame deltas to about 0.1 seconds after tab suspension.
- Let physics own simulated world positions.
- Convert player or AI intent into target velocity before stepping.
- Synchronize visuals, animation, and camera only after stepping.

## Body and collider choices

| Gameplay object | Body kind | Collider | Notes |
| --- | --- | --- | --- |
| Floor, wall, building | Static | Authored box proxies | Merge adjacent boxes only when it preserves openings |
| Door, platform | Kinematic | Box | Set velocity consistently so dynamic bodies react |
| Crate, pickup | Dynamic | Box | Keep center of mass near the visual center |
| Goal, damage area | Static trigger | Box | Trigger contacts never resolve |
| Player | Dynamic arcade box | Box | Lock rotation because the lightweight engine has none |

Name exported collision proxies clearly, for example `COL_Floor`, `COL_Wall_03`, and `TRIGGER_Exit`. Hide proxy meshes after extracting bounds. Do not generate one collider per decorative child mesh.

A world-space bounding box is conservative for a rotated model. Use it only when the extra empty collision volume is acceptable. Author an axis-aligned proxy or switch engines otherwise.

## Character movement

For an arcade controller, preserve vertical velocity and set only horizontal velocity from input:

```ts
player.velocity.x = desiredX;
player.velocity.z = desiredZ;
if (jumpPressed && player.grounded) player.velocity.y = jumpSpeed;
```

Compute `jumpSpeed` from desired jump height `h`: `sqrt(2 * abs(gravityY) * h)`. Do not use render delta in this assignment; the physics step applies time.

The template marks a body grounded when a resolved contact supports it from below. It does not provide step climbing, slope limits, crouching, or capsule sweeps. Use a dedicated character controller when these define the game feel.

## Tuning order

1. Fix world scale and collider dimensions.
2. Tune gravity and jump height.
3. Tune horizontal acceleration or target speed.
4. Tune friction and damping.
5. Add restitution only to objects that should bounce.
6. Test corners, narrow gaps, moving platforms, and low frame rates.

Do not compensate for incorrect scale by using extreme gravity, mass, or speed values.

## Failure modes

- **Falling through floors:** reduce speed, increase fixed-step frequency, thicken the collider, or use CCD in a mature engine.
- **Jitter while resting:** confirm one physics authority, avoid rewriting body position from rendering, and reduce overlapping spawn positions.
- **Invisible walls:** inspect world-space bounds and pivot offsets; a rotated visual may have a much larger AABB.
- **Frame-rate-dependent speed:** remove render-delta multiplication from velocity assignments and keep integration inside the fixed step.
- **Trigger misses:** avoid tiny triggers and high speeds; use swept tests or a mature engine when misses are unacceptable.
- **Slow collision pass:** reduce active bodies, partition the world spatially, or use an engine with broadphase acceleration.

## Escalation boundary

Stop extending the template and adopt a mature engine when two or more unsupported features become required. Migration usually costs less than accumulating special-case collision code. Preserve the same body categories, layers, model-proxy naming, and render synchronization contract during migration.
