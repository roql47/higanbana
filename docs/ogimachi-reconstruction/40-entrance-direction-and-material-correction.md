# Entrance direction, geometry and surface correction

Reference: the Irori official exterior photograph already shown in photoreal-compare.html. This is photo-guided modeling, not measured reconstruction. Building root / GIS coordinates are preserved.

## Scope
- Corrected entrance camera approach, target and crop; tanuki faces the approaching camera (145° local Z).
- Rebuilt separate rounded live-edge sign, horizontal lettering approximation and circular crest. Exact original calligraphy is not reproduced.
- Brought existing lamp assemblies inward without deleting merged facade objects.
- Rebuilt closed thick swept stone lantern roof, chamber posts, octagonal foot and finial. Weathered granite material has coarse mineral color variation and fine bump.
- Warmed existing cedar and thatch texture maps, retained texture-driven grain and existing UVs. Shortened excessive thatch fringe.
- Moved entrance shadow backing deeper; added floor, jamb depth, interior screen/counter and modest interior illumination.
- Reoriented existing Tripo tanuki; no additional Tripo generation / credits.
- Rebuilt inferred garden root display with curved trunks/forks, added slender arching grass and compacted-grit entrance apron.

## Files and reproducibility
- Before checkpoint: assets/authored/ogimachi/before-entrance-correction.blend
- Base pass: scripts/blender/correct-irori-reference-v2.py
- Final pass: scripts/blender/refine-irori-reference-v2.py (executes the base pass first)
- Owned additions tagged entrance_correction_v2; reruns replace these only. Merged source data retains correction_v2_source provenance, and lamp/fringe adjustments have drift guards.
- Camera: existing Photoreal_Entrance_Camera, root-local location (-10.7, 3.3, 2.15), target (-4.6, -.85, 1.95), 46 mm. Final image 1600 × 1310.

## Limits
This update is the editable Blender entrance study and its comparison render. Procedural surfaces have not been baked/exported into the runtime game GLB or Steam package. Camera intrinsics, exact signage, stone weathering and unphotographed interior are inferred; no exact-match percentage is asserted.

## Output and validation
- Packed scene: assets/authored/ogimachi/photoreal-entrance-corrected.blend
- Final render: artifacts/ogimachi-phases/entrance-correction-final.png
- Three 800 × 655 test renders visually inspected; final 1600 × 1310 at 96 samples.
- All 14 directly referenced mesh material images packed at save. No separate-process reload claimed.
- Final pass conforms earth apron to the actual terrain with object ray casts to avoid coplanar green terrain showing through.
