# Three-house reference correction

2026-09-12, requested after direct comparison with the reference.

Blender MCP rebuilt the three-house study with the following changes:

- All three cedar materials now use a packed, contrast-reduced brown variant of the existing material. Original source files are preserved. No reference photograph is used as a texture.
- Roof edges receive a small, continuous deformation to soften the straight silhouette; no footprint repositioning.
- Restaurant and shop wall shells have Boolean pockets behind side glazing and the entrances. Separate outer sash/lattice remains in place; dark backing moves inward about 0.43m. This is visual depth, not playable interior or physically transmissive glazing.
- Restaurant sign has irregular edges and a readable `いろり` mesh in a plain font. This is not an exact copy of the reference calligraphy. Paper lantern cores slightly enlarged.
- Restaurant pot and blade groups have varied heights and widths rather than identical silhouettes.
- Added an entrance camera to the web preview. Browser close-up verified visible lettering, lattice, backing and corrected wood. Blender restaurant render verified broader appearance.

Scripts: `build-phase3-cluster.py`, `correct-phase3-surfaces.py`. Outputs update the separate `phase3-three-house-block.blend`, cluster renders and GLB. No production map or package replacement.

Final optimized GLB reread: 49 meshes, 25 materials, 6 textures; 12,612,708 → 5,007,344 bytes. Restaurant 15,114 triangles; shop 12,944; Hakusuien 27,770. Counts are not GPU/RAM performance measurements.

Still incomplete: exact roof fibre silhouette, varied timber construction/board mapping, measured facade proportions, detailed pottery, source-aligned forecourt and plot boundaries. Existing study earth ribbons and inferred ground levels are unchanged; do not describe these as corrected to actual surveyed boundaries. No exact-replica completion claim.
