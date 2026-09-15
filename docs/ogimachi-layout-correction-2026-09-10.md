# Ogimachi layout correction

The first independent map used authored rows and regular frontage spacing. It did not preserve the reference village's actual arrangement. Its 145-house / 90-field layout is superseded by this correction; earlier completion notes must not be read as evidence of reference fidelity.

## Source and method

The original reference page itself provides a **Location and Extent of Traditional Buildings** map:

https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/

Map image: https://whc-shirakawa-goandgokayama.jp/wp/wp-content/uploads/2024/05/%E2%97%8F%E8%8D%BB%E7%94%BA%E3%80%80%E8%A9%B3%E7%B4%B0%E5%9B%B3%EF%BC%88%E5%BB%BA%E9%80%A0%E7%89%A9%E4%BD%8D%E7%BD%AE%E5%90%AB%E3%82%80%EF%BC%89-scaled.jpg

The 2560 × 1811 image was inspected, including the central area and scale legend. North points left; map-up maps to east. The visible scale bar is approximately 115 source pixels for 200 m. Pixel positions are converted with a single rotation/scale, not redistributed into rows.

`scripts/qa/trace-ogimachi-plan.py` extracts connected red and blue symbols. It produces 60 red and 48 blue centres in `referenceTrace.ts`. All 108 positions survive in the runtime map exactly under that transform. Additional uncoloured building centres were read manually from the central crop; after avoiding intersecting proxies, the scene contains 188 buildings. These additional centres are approximate readings of the raster map, not a surveyed inventory.

Road polylines, lowland boundaries, the Sho River bends, tributary and agricultural sectors were traced manually from this map. The previous long rectangular ground strip and regularly repeated cross streets were removed. Where a traced road intersects an enlarged cartographic building proxy, `roadClearance.ts` applies a local detour, preserving building centres. These local road adjustments are game clearances, not claims of exact real-world road geometry.

The red/blue map categories provide location evidence. The existing three Blender archetypes remain stand-ins for individual buildings. Bounding-box dimensions are reduced cartographic envelopes; models, roof orientation details, annex shapes and terrain heights are not photogrammetric reconstructions. The religious buildings have not all been given bespoke models.

## Review UI

`http://127.0.0.1:5188/ogimachi.html`

- **공식 도면 대조** overlays runtime building centres, roads, rivers and lowland boundaries on the official source map. The slider reveals the source underneath; **중심부** and **전체** change the area shown.
- **위에서 보기** inspects the whole 3D layout from above.
- The source map is fetched from the original website for comparison; it is not copied into shipped game textures. The comparison background needs a network connection, while the 3D assets remain local.

## Validation

All 113 repository tests and TypeScript checks pass. The standalone build succeeds with Vite's existing bundle-size warning. The map tests check building/road separation and lane connectivity, every building's level ground, river depth, and preservation/orientation of all 108 extracted centres. The browser's source-map overlay and updated 3D view were visually checked.

This correction improves placement evidence. It does not claim video-identical rendering. The 29 field polygons are an incomplete first tracing of cultivated sectors; garden/parcellation coverage, photographic terrain detail, model variation and game/story integration remain separate unfinished work. Existing game saves and native release packages were not migrated.
