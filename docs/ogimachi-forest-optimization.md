# Ogimachi design preview: forest resource reduction

Replaces the single all-tree instance draw with 160 m spatial groups and distance-dependent counts/geometry. The same deterministic woodland positions and exclusion rules are retained; terrain woodland color remains when distant trees are omitted.

| Distance from tile bounding sphere | Standard | Low |
| --- | --- | --- |
| <350 m | Full count, 80 triangles/tree | 60%, 20 triangles/tree |
| 350–700 m | 50%, 20 triangles/tree | 25%, 20 triangles/tree |
| Beyond 700 m | 25%, 20 triangles/tree | 12.5%, 20 triangles/tree |
| Cutoff | 1300 m | 850 m |

Only standard-mode tiles within 180 m cast tree shadows. Low mode has no tree shadow casters. Geometry/materials and instance buffers are reused across switches. Tile bounds encompass all trees so returning to a close viewpoint restores them correctly; independent manual forest hiding remains effective. The UI quality choice persists locally.

## Reproducible geometry comparison

At the north panorama camera `(45,175,-390)`, before frustum culling:

| Configuration | Active tree instances | Tree triangles | Shadow tree instances |
| --- | ---: | ---: | ---: |
| Previous single mesh | 2823 | 225840 | 2823 |
| Standard distance LOD | 725 | 24280 | 32 |
| Low distance LOD | 302 | 6040 | 0 |

These are CPU-side configuration counts (approximately 89%/97% fewer tree triangles), not frame-time, total-scene GPU usage, or RAM measurements. Spatial grouping increases possible draw calls while enabling culling of offscreen groups. Instance buffer capacity still retains the full position set; this change does not claim a comparable RAM reduction. Distant woodland becomes visibly sparser; discrete LOD changes may be visible during camera travel. No new billboard textures are loaded.

## Scope and validation

Applies to the current `/ogimachi.html` design view. The separate detailed/story world and Steam build were not altered or repackaged. Building/road/terrain layout remains intact.

Typecheck and preview build passed, with 28 Ogimachi tests. LOD tests cover monotonic reduction, low-mode shadow removal, buffer reuse, near/far restoration and manual hide preservation. Browser inspection compared both quality settings in the north panorama; the standard detailed radius was expanded after the first visual pass to retain the nearby woodland shape.
