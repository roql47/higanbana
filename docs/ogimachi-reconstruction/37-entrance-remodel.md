# Irori entrance remodel

2026-09-12. User requests matching the original rather than another palette change.

Rebuilt visible restaurant entrance components through Blender MCP using `scripts/blender/refine-irori-entrance.py`, called before material consolidation. Removed the former coarse components. Added two sliding leaves with finer lower bars, separate tracks and pulls; a live-edge upright sign with staggered letters; narrow ribbed lantern cages; a curved stone-lantern roof and open chamber; a rounded tanuki with eye masks, pupils, ears, muzzle, paws, feet and hat; additional layered garden stems/leaves. Existing reference material correction is retained. Font lettering approximates rather than reproduces calligraphy.

Rebuilt cluster blend and GLB. Final conversion reread reports 53 meshes, 28 materials, 6 textures, 5,481,864 bytes. Restaurant has 39,076 triangles (previous 15,114), so this refinement increases geometry cost. No hardware performance claim. Comparison page uses the new model; camera was adjusted for the reference entrance, with upward viewing enabled instead of OrbitControls forcing a downward pitch.

Observed remaining differences: roof still has a thick continuous edge instead of fine cut fibre; original irregular timber and glass reflections remain more complex; sign silhouette/lettering and planting do not match exactly. Camera is not calibrated to source intrinsics. Ground/forecourt and full village are still unverified. This is an entrance refinement, not an exact-replica completion or production deployment.

Follow-up visual correction: the old eave occluded the sign even after the sign remodel. Raised the restaurant roof, ridge cap, gables and rafters by 0.55m and added an upper timber wall/post band. This dimension is a photographic proportion estimate, not measured height. Restaurant triangles now 39,160. Full source reconstruction still not achieved.
