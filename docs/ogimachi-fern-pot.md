# Tripo + Blender fern pot

User authorized Tripo API use for suitable props. Generated one textured fern pot with project API scripts: task `4486ed20-a7a4-4092-b8f0-f8a74cfb83c6`, reported cost 20 credits; balance after generation 1650. Source outputs and task metadata are retained in `assets/tripo/ogimachi-fern-pot` and the existing Tripo log.

Inspected the returned render. The organic foliage is suitable as a modest stylized village prop, not a scanned replica. Imported through connected Blender MCP into a new scene, centered its footprint, set its base to zero, normalized dimensions and reduced embedded textures to 512px. Source Blender file: `assets/authored/ogimachi/fern-pot.blend`; reproducible preparation script: `scripts/blender/prepare-ogimachi-fern-pot.py`.

Runtime `public/models/ogimachi/fern-pot.glb`: 882,180 bytes, 3,845 triangles, one mesh, three embedded images, height 0.7604 m and maximum horizontal span 0.70 m. Four detailed-world locations share geometry/materials with rotated placements on the established ground-support function. Procedural pots are suppressed only after successful load; retained on failure. No new collisions are added to the formerly decorative pots. Simplified design preview does not show street props.

Typecheck and preview build pass. In-game close-up reviewed on 2026-09-11: terracotta, soil and foliage render on the earth surface. Added a close-up button and `?view=detail&prop=pot` entry. Camera approaches from the road side to avoid the adjacent building. Foliage remains visibly stylized/angular at close range; this is not a photoreal scan. Five street geometry, support and side-lane walking checks passed. No additional Tripo generation was requested for this review.
