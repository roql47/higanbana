# Irori front roof and door wall rebuild

Photo-guided study of the existing official Irori exterior photograph in photoreal-compare.html. The previous entrance camera, GIS root, signage and prop placements are retained. This is not a measured reconstruction.

## Geometry
- Removed only the front roof slab component from its merged source mesh; preserved the rear slope and ridge.
- Built a closed front thatch pack with separate sloped surface, rounded compressed eave, underside and end caps. Added localized irregular packing, short cut reed tips and near-eave sloping fibers.
- Replaced the front solid wall box and shallow horizontal decorative strips with actual posts, upper board panels, continuous header and eave plate.
- Extended adjacent window bays toward the door: modeled deep recesses, two sliding leaves, narrow lattice, projecting sills and separate lower vertical boards.
- Removed the obsolete opaque side glazing/shadow sheets from rendering. Door and side glazing have real thickness; signed volume checks corrected inward-facing closed volumes.
- Added restrained joinery pegs and localized longitudinal splits.

## Surfaces
- Existing project cedar and kaya image assets are reused and packed. Cedar UVs sample inside individual boards, avoiding photographed board gaps/nail rows on small structural members.
- Grain follows the member's long axis. Albedo, normal strength and patina contrast were adjusted after render review.
- Roof slope and compressed cut ends use independent mappings and geometry; loose ends avoid a uniform comb outline.

## Reproduction and outputs
1. Run scripts/blender/rebuild-irori-roof-wall-v3.py on the corrected entrance scene.
2. Run scripts/blender/finish-irori-roof-wall-v3.py.
3. Final render settings: existing 46 mm camera, 1600 × 1310, Cycles 96 samples.

Owned new geometry is tagged irori_roof_wall_v3. Original edited mesh data is retained through roof_wall_v3_source; no unrelated scenes removed.

- Checkpoint: assets/authored/ogimachi/before-roof-wall-rebuild.blend
- Editable output: assets/authored/ogimachi/photoreal-roof-wall-v3.blend
- Final image: artifacts/ogimachi-phases/roof-wall-v3-final.png
- Test images: roof-wall-v3-test.png, roof-wall-v3-test2.png

## Validation and limits
Two fixed-camera 800 × 655 renders were inspected before final rendering. All 17 directly referenced mesh material images were packed before saving. This pass corrected 233 inward closed volumes among the newly authored objects, earlier entrance additions and thin glass.

No full separate-process reopening or runtime-game GLB export is claimed. Window proportions, hidden room surfaces, exact roof section and material aging remain photo-based estimates. This affects the Blender study and comparison page, not the Steam build.
