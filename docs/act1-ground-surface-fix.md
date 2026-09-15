# ACT1 street surface overlap correction

The reported screen was the ACT1 village street, not the onsen foyer. Screenshots showed intermittent grass strips, partly buried paving and curb pieces. Road overlays used different triangle subdivisions and polygon offsets at nearly equal heights; sampling only corner heights let their interiors cross the rendered terrain and each other.

`terrainOverlay.ts` clips overlays to the same 4 m grid and diagonal as the near terrain before sampling height. UVs interpolate across the cuts. ACT1 grass, dirt, paved/parking surfaces and nearby yard overlays now use this method. Surface layers have explicit offsets (yard .10 m, grass .14, dirt .16, paving/parking .18). The replaced ACT1 main-road section is omitted from the generic asphalt geometry/collider; the authored path provides walking collision instead. Curbs follow terrain height at their vertices.

Validation: typecheck and Ogimachi build pass; nine focused tests pass, including triangle-centroid clearance on folded terrain, area preservation, positive normals, street geometry budgets and Rapier parking support. Updated browser screenshot shows continuous paving and subdued grass borders. No new texture files or model assets were required. Full keyboard traversal at the user's exact camera pose was not recorded.
