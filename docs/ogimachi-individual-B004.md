# B004 — Shirakawa-go no Yu: textured exterior

Built with the connected Blender MCP `execute_blender_code` endpoint, from `scripts/blender/build-ogimachi-onsen.py`, in a separate scene. Prior authored scenes were retained.

Deliverables:
- `assets/authored/ogimachi/B004-onsen.blend`
- `public/models/ogimachi/onsen.glb` — 1,796,236 bytes, 8,042 triangles, 9 material mesh groups. Cedar/stone albedo and normals plus embedded roof/cloth normal and roughness maps.

Includes textured cedar cladding and stone foundation, separate window frames and inner curtain panels, lower timber screens, balcony rails, sheet-roof seams, gutters/downpipes, snow stops, lattice sliding doors and handles, canopy posts/braces, three folded indigo fabric panels, sign slab and bench. The current preview adds Japanese sign lettering and adjusts the cedar material tint for its lighting.

Reference observations carry forward from the official exterior photographs in `ogimachi-overall-design-04.md`: long two-storey timber front, glazed upper bays, lower screens, projecting rails and small entrance canopy. Photo pixels were not baked into the asset. Existing project cedar and granite texture assets are embedded in the GLB.

## Placement and limits

Targets OSM 236248626 only; source centre, angle and 15.135 × 54.613 m roof envelope remain unchanged. Blender local -X faces the provisional east elevation; Blender entrance Y=-14 exports to runtime Z=+14. Height, bay count/spacing, exact entrance offset and facade orientation remain estimates. Unseen ends/rear are closed with neutral textured surfaces, not verified replicas. A small estimated foyer is now enterable in walking mode; see the latest pass below.

The design preview loads this GLB and removes/disposes its B004 blockout meshes after successful load. Load failure retains the blockout and displays an error. The detailed/story world now excludes B004 from generic merchant instances and uses the same shared exterior loader, orientation, tint and sign. Existing ACT1 authored buildings and forest LOD remain intact. No new Steam package was created.

The roof and noren now use authored tileable 256px normal/roughness images exported through Blender MCP. These approximate sheet-metal variation and woven cloth; they are not scans. Mesh complexity is unchanged, with a 46,212-byte asset increase. This is a file-size measurement, not a GPU/RAM benchmark.

## Validation and next work

Typecheck, preview build, 29 Ogimachi tests, and browser checks of the model load and entrance. Asset validation checks embedded textures/normal maps, UVs, identity, entrance coordinates, mesh count and triangle budget. An initial preview used a cached GLB; the revised asset URL now refreshes it. Warm cedar was replaced with weathered cedar and adjusted for preview illumination.

Next: verify B004's access alignment against source imagery before authoring interior access. Then identify the next unreviewed street building from source imagery before authoring it. Avoid inventing detailed facades for all anonymous footprints at once.

## Latest: enterable foyer study

Official facility page: https://www.shirakawagou-onsen.jp/facility.html. It establishes a shop and relaxation facilities but not a measured entrance floorplan. The new 5 × 8 m foyer is explicitly an estimated design study, not an exact interior reconstruction. Baths, guest rooms and a full lobby are not authored.

Blender shell now has a real entrance opening, enclosed room, timber lining, ceiling, bench and shoe shelves. Two independently grouped sliding leaves retain shared material batches. The shared runtime adds a stone floor, shallow approach ramp and one non-shadowed warm light. Updated GLB: 1,838,224 bytes, 14 mesh groups, below 12,000 triangles. Foyer proxies replace the old solid lower body only around this room; the rest of the building remains closed.

Walking mode: use “온천 앞에서 걷기”, then E or the nearby door button. Leaves open over 1.2 seconds; collision disables only when fully open. The door stays open for exit. Story mode does not yet expose this interaction. Tests cover closed/open collision, exit clearance and animation completion at 30/60/120 FPS; this does not claim full story QA or a new Steam build.

### Foyer finishing and door-axis correction

Corrected the runtime animation to move along glTF local Z, not Y. The exporter had baked Blender's Y-up conversion; the earlier animation test incorrectly duplicated that assumption. A new regression reads the actual exported door geometry and checks that the central passage clears while vertical bounds remain unchanged. Seven focused asset, door and collision tests pass, including capsule entry/exit and 30/60/120 FPS animation.

Added cubby dividers/backboard, wall trim, ceiling beams, a timber-framed light diffuser and an interior sign using shared materials. Current GLB is 1,853,528 bytes (15,304 more than the previous foyer). The threshold now sits above the detailed yard's +0.10 m overlay and joins the foyer at +0.16 m, avoiding an apron buried below gravel. The interior remains a design study.

## Exterior access pass

Walk/story collision now uses the 13.1 × 52.4 m solid wall body instead of the 15.135 × 54.613 m roof footprint. Two porch posts, canopy and bench have separate small box proxies. Closed doors still block entry; no interior was invented. Existing Rapier simulation and terrain colliders remain authoritative.

The detailed preview has a B004 entrance camera. Walking mode has an explicit “온천 앞에서 걷기” inspection shortcut, placed outside the porch using the actual ground collider height. This is a preview navigation control, not a story teleport. Typecheck, build and a real Rapier regression test passed: rotated porch approach stays clear; closed walls, posts and bench block rays. Full character traversal and source-accurate access alignment remain to be verified.
