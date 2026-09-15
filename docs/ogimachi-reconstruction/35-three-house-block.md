# First three-house block

2026-09-12. User requires retaining at least the B001 visual baseline while progressing by a group of 3–5 buildings.

The first group contains B001 Hakusuien 236248693, B002 restaurant 236248710 and B002-S shop 236248704. The latter two reuse existing individually authored models, not two new measured reconstructions. Their different roof sizes, attic openings, storefronts, canopy, lanterns and furniture remain distinct. B001 is appended unchanged from its latest refinement blend.

The restaurant entrance and shop photograph were viewed again on the official site https://www.shirakawagou.jp/ through the browser. The former shows lattice doors, twin lanterns, timber, a stone lantern and pots; the shop crop shows cloth and timber glazing. Whole shop gable configuration still relies on the earlier B002 record. Source photos were not copied into textures. Footprint identity mapping, dimensions and unseen facades remain inferred.

## Changes and review

- Blender MCP executed a separate group authoring script. Added under-eave rafters, braces, horizontal facade courses, footing stones and small worn edge bevels to the two existing models.
- Corrected stretched roof cut-face UVs after the first render revealed vertical stripes.
- Replaced upright ellipsoid plant leaves with curved pointed leaf meshes; reduced restaurant triangle count in the process.
- Placed three roots at existing survey positions and angles. Leveled building pads, feathered terrain and added three inferred earth approaches to nearby actual road vertices.
- Cropped the review terrain and road meshes to the block. Welded crop vertices and smoothed normals after seeing faceted ground. Nearby unmodeled buildings are omitted from this focused presentation; their omission is not a claim that the real lots are empty.
- Viewed Blender overview, restaurant and shop views and the browser preview. Corrected visible WebGL ground shadow banding by adjusting shadow bias, and excluded road/terrain surfaces from casting shadows.

## Outputs

- `scripts/blender/build-phase3-cluster.py`
- `assets/authored/ogimachi/phase3-three-house-block.blend`
- `artifacts/ogimachi-phases/phase3-cluster-{overview,restaurant,shop}.png`
- `artifacts/ogimachi-phases/phase3-cluster-web.glb`
- `phase3-cluster.html`: overview, restaurant and shop camera presets.

GLB reread after deduplication, pruning and 1024px WebP conversion: 42 meshes, 25 materials, 6 textures; 11,436,592 → 4,900,264 bytes. Building triangles: restaurant 12,414; shop 12,854; B001 27,770. These are asset counts and file size, not measured minimum GPU/RAM specifications.

## Remaining

This is a three-building exterior integration study, not a finished village or playable release. Ground and paths still use plain study materials; their boundaries and slopes are interpreted. Street reference alignment, forecourt shapes, exact eave silhouettes, lettering and rear/interior details need further work. No production game replacement, collision certification or Steam package was performed. The next phase should finish this group's ground/material transitions and reference alignment before expanding to another group.
