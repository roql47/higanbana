# Ogimachi density and scale correction

The previous map still looked sparse because its spatial calibration and surrounding land use were incomplete. Matching coloured map centres did not establish visual similarity to the film.

## Scale discrepancy

The prior `200 / 115` metres-per-pixel interpretation gave the digitized terrace polygons a combined area of **176.71 ha**. The original map labels the property **45.6 ha**. The traced lowland polygons are approximate and are not identical to a surveyed property boundary, but this discrepancy was too large to ignore. Their long-axis extent was also excessive relative to the approximately 1.5 km village description.

The working scale is now **0.88335 m per source pixel**, giving the traced polygon area **45.59 ha**. This is area-based calibration, not new survey evidence and not a claim that the map scale legend has been definitively explained. The 108 source-image building centres retain their positions under the corrected common transform. The older layout correction document's `200 / 115` calibration and 188-building counts are superseded.

## Density work

- Low-house proxies can grow within their existing plots; neighbouring buildings and lanes constrain their final sizes. The source-centre positions are not scattered or regridded.
- Local Blender MCP authored three distinct low structures: lean-to, workshop and open firewood shed. Source: `assets/authored/ogimachi/outbuildings.blend`; runtime: `public/models/ogimachi/outbuildings.glb` (1.83 MB). The original Blender scene and main house library are preserved.
- **162 main buildings and 139 outbuildings** are placed after the corrected-scale clearances. Outbuildings are designed from the film's mixed roof volumes, not an inventory of real extra households. The comparison overlay labels these additions separately in orange.
- Cultivated ground now continues between residential plots. Convex parcel clipping excludes buildings, yards and road corridors. Internal clipping edges are removed before drawing bunds, so one parcel is not presented as numerous artificial strips.
- **93 cultivation groups** include multiple clipped fragments where needed; this is a rendering/layout count, not a count of cadastral land parcels. New infill parcels are authored approximations inside agricultural/residential sectors. They are not presented as exact map tracings.
- Roof and road brightness was reduced, and flooded/cultivated ground uses non-metallic materials. Rice clumps are spatially instanced and distance-culled; the terrain and parcel surfaces remain visible farther away. Outbuildings share larger instance chunks to reduce repeated draws.

## Review and verification

The same broad composition was inspected before and after the first density additions. After scale calibration, camera world positions and height were adjusted to the corrected village size. The added **중심부 밀도** camera offers a closer inspection; it is not the sole evidence that the geometry changed.

TypeScript and all **116 tests** pass. Tests cover lane/building separation, level pads, preservation of source centres and orientation, approximate property-area calibration, outbuilding parentage and clearance, parcel subtraction area and boundary seams, and the exported Blender library's archetypes/materials. The independent preview builds successfully; Vite retains its bundle-size warning.

This remains an environment production study. Exact annex positions, detailed farmland boundaries, house-specific architecture, photographic textures, surveyed heights and playable act integration are not complete. The old native Steam preparation builds were not replaced by this scene.
