# ACT 1 west frontage — September 11, 2026

ACT 1 follows OSM road 1268046903 north from route distance 8 to 80 m, west of Wada. Five repeated merchant placeholders are replaced by individual exported models, in both the map preview and story. Original survey centres, angles and collider envelopes are retained.

- 236248652: two-storey plaster/dark-timber shopfront, tiled roof, lower eave, upper windows, ground lattice and benches.
- 236248688: taller southern ochre workshop with pitched metal roof, one large shutter and a small high window; corrected during A1 reference review.
- 236248633: low northern ochre annex with two shutters and central windows; corrected during A1 reference review. Roof-axis verification remains pending.
- 236248631: flat-roof ochre block and high windows.
- 236248712: taller concrete block, window bands and flat parapet.

Street photographs were inspected directly in Google Maps, at:

- https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.25997,136.90697&heading=270&pitch=8&fov=100 — resolved photograph September 2012, pano tcA1tFv0uHCgiNklZQAEjw.
- https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26025,136.90686&heading=270&pitch=5&fov=100 — resolved photograph August 2010, pano IYXr55LRH1CS12WE6v2qjA.
- https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26053,136.90691&heading=270&pitch=5&fov=100 — resolved photograph August 2010, pano 1klGzVcZcKM23vkWlwVZQQ.

GSI aerial and original OSM outlines provide placement/envelopes. Photos establish facade types and the open paved forecourt; heights, window dimensions, parking stripe spacing and rear elevations remain estimates. This is an archival frontage reconstruction, not a current-date or measured replica. The old Yoze shop has since moved according to its official website, so no current business name is assigned from stale OSM labels. Existing B001 Hakusuien and other individually authored buildings are retained.

Images are visual references only; none are included as game textures. Materials reuse local authored assets. The parking and road-edge drainage are merged static meshes following the existing ground. The DEM, forest optimization, ACT timing, actor motion and road centreline are unchanged. Story flowers and torii remain fictional scene elements.

Editable model: assets/authored/ogimachi/ACT1-frontage.blend. Generator: scripts/blender/build-ogimachi-act1.py. Runtime asset: public/models/ogimachi/act1-frontage.glb. Runtime placement/dressing: src/world/ogimachi/act1Frontage.ts. Preview button: 액트 1 거리.

## Street surfaces and props

The full ACT 1 road segment now has authored asphalt color/normal/roughness maps, while the forecourt, shop paving, Hakusuien gravel approach, east grass verge and both stone drain bands use separate materials. Ground UVs use metres. The road overlay uses the original road geometry and polygon offset; its existing physical height is retained. Grass does not cover mapped field polygons.

Reference additionally inspected: the same 2010 pano IYXr55LRH1CS12WE6v2qjA looking east (heading 90°, pitch −12°). It shows the stone drainage band, hydrant plinth, noticeboards, lamp/utility poles and low timber rail fence. The earlier west-facing photograph shows portable A barriers, a cone and marked parking.

Inventory: 30 grate sections, 3 manhole covers, 11 wheel stops, 8 parking barriers, 2 cones, 12 timber fence bays, 2 noticeboards, 1 hydrant/plinth, 2 lamp poles, 3 additional benches, 4 pots, 2 bins, 832 small grass tufts and 4 shrubs. Counts, exact positions, markings and small dimensions are authored estimates; transient parked vehicles/people are not recreated. Noticeboard lines are generic, not a transcription of illegible reference text. This remains a reconstruction, not an exact inventory of the historical site.

Static streetscape geometry is merged by material: 16 meshes / 26,385 triangles excluding the five building assets. This is a geometry budget, not a whole-game FPS guarantee. New textures are 512 px and tileable; grass is a color-adjusted derivative of the existing project texture. The deterministic generator is scripts/build-act1-surfaces.mjs.

Walkable paving carries explicit walkSurface metadata. Rails/barriers/boards/hydrant/poles/benches/bins use separate box proxies; decorative slats, grass and grate bars are not individual colliders. Existing Rapier remains the single physics authority. Tests verify merged geometry, all prop categories, no proxy in the main road, parking support and barrier collision. Preview views: 액트 1 거리 and 액트 1 길가.

## User-directed dirt path revision

ACT 1 now uses a 3 m compacted-earth path instead of the 6.2 m asphalt appearance. The old source ribbon is covered by grass shoulders; the narrower dirt ribbon follows the same centreline and elevation. Drain bands, barriers and fence offsets follow the new half-width. Painted road-edge and parking stripes are removed, and the west forecourt also uses compacted earth. Source survey data stays intact. This intentional game-art change supersedes the historical asphalt reference above. Unused asphalt PBR maps are no longer loaded by the streetscape.

## Remaining side buildings

Nine additional generic merchant/storehouse instances are replaced within the reviewed area x (-130, 40), z (-120, 30). Combined with the western five, 14 buildings now have individual assets; existing landmark models remain. This coverage is a defined corridor, not the entire village.

| OSM ID | Authored form | Evidence limits |
| --- | --- | --- |
| 236248636 | Tall thatched gable, two attic window levels, shop lean-to | South-facing street photo supports the nearby form; exact building association and hidden elevations need verification. |
| 236248639 | Low tiled timber house | Footprint retained; roof, height and facade inferred. |
| 236248655 | Two-storey plaster/timber building with lower canopy | Footprint retained; facade and height provisional. |
| 236248682 | Raised timber storehouse with steep thatch and battens | Wada entrance photo shows a nearby thatched shed; exact association and hidden elevations provisional. |
| 586010787 | Low pitched metal-roof building with porch | Footprint retained; facade and roof detailing inferred. |
| 984794590 | Small tiled timber outbuilding, plank door | Footprint retained; facade inferred. |
| 986683700 | Low plaster/timber tiled building | Footprint retained; facade inferred. |
| 986683701 | Small metal-roof service shed | Partially obscured in north-side reference; facade inferred. |
| 1465226332 | Small tiled timber shed | Partially obscured in north-side reference; facade inferred. |

Additional photographs inspected in Google Maps (reference only, not bundled):

- South street: https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.25985,136.90696&heading=180&pitch=7&fov=100 — August 2010, pano vhHbwNydXKsUDvAlKpkVyw.
- Wada entrance: https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.25991,136.90725&heading=90&pitch=5&fov=100 — September 2012, pano QMKcQFCqg73UGo3mRwHV0w.
- Northern alley: https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26065,136.90683&heading=70&pitch=5&fov=100 — August 2010, pano KNd0YsNP-vXjhBybRKZWvg.

Editable source: assets/authored/ogimachi/ACT1-side-buildings.blend. Generator: scripts/blender/build-ogimachi-act1-sides.py, followed by node scripts/optimize-act1-sides.mjs. Runtime: public/models/ogimachi/act1-sides.glb. Preview: 액트 1 양옆 건물 in ?view=detail. Models reuse local materials; textures are deduplicated and compressed to WebP at up to 1024 px. Tests check nine unique IDs, upright bounds, lot envelopes, asset size and absence of generic fallback buildings in the reviewed corridor.
