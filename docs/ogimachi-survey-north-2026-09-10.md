# Ogimachi northern precinct — real-coordinate reconstruction

This replaces the default `ogimachi.html` scene with a georeferenced study. The earlier authored plan is retained in its original modules, but the preview now loads `SurveyWorld`. The main game and Steam packages are not changed.

## Inputs and reproducibility

- GSI: 25 DEM10B text tiles at zoom 14, 60 seamless photographic tiles at zoom 17. All 85 requests succeeded. Raw URLs, acquisition date and cached paths are in `assets/reference/ogimachi-gis/manifest.json`.
- OSM: 456 building outlines, 215 road ways and 91 agricultural land-use ways from a bounded Overpass query. The original response and query are retained alongside the tiles. These data have incomplete roof and height tags.
- Local coordinates: X east, Z south, ground metres at latitude 36.259924, longitude 136.907628. Origin elevation 493.14 m. Projection uses locally scaled Web Mercator, suitable for this small study area, not survey certification.
- The generated DEM is a 601 × 601 Float32 grid sampled every 8 m. Rendering uses 4 m cells in the precinct to support authored pads and banks; this does **not** increase the source elevation accuracy. Distant terrain uses 32 m cells.
- Aerial coverage is approximately 1.48 × 2.47 km. The wider terrain context is 4.608 km square.
- Ten northern paddy polygons and woodland masks were manually traced from the registered aerial mosaic. Their accuracy is approximate and their capture season differs from the supplied video.

Rebuild in order:

1. `python3 scripts/gis/fetch-ogimachi.py` (network, cached)
2. Bundled Python: `scripts/gis/inspect-ogimachi.py` (Pillow)
3. Bundled Python: `scripts/gis/prepare-ogimachi.py` (NumPy/Pillow)
4. `python3 scripts/blender/run-local-mcp.py scripts/blender/build-ogimachi-north.py`
5. `npm run build:ogimachi`

## New Blender models

`public/models/ogimachi/wada-precinct.glb` contains three material-merged models; editable scene is `assets/authored/ogimachi/wada-precinct.blend`.

- Wada main house: documented body 12.8 × 22.3 m, deep thatch roof, two attic tiers, white infill panels, dark timber/plaster, west formal entrance and stone steps. Roof height, window spacing and detailed proportions are photograph estimates.
- Wada itakura: open perimeter posts and drying rails around an inset raised board storehouse, with a thatched roof. Mapped to OSM way 660927470.
- Wada hasagoya: open drying frame with a shallow metal roof. Mapped to way 236248645. Exact elevations and construction dimensions have not been measured.

The sheds' identification uses official descriptions of their relative positions plus the aerial mosaic, not an authoritative footprint-to-monument register. They should be checked against a ground-level walk-through before claiming exact reconstruction. Existing generic models stand in for other buildings; only several obvious nearby thatched roofs have manual overrides. Minimum rectangles approximate irregular footprints in the rendered architecture.

## Visual work and validation

- Reference video remains directly embedded from its original host, with the 0:16 north view and a side-by-side/stacked comparison.
- Northern camera is anchored near the real castle observation point. Its height, target and lens remain approximate; the video camera has not been photogrammetrically solved.
- GSI ground relief, original street alignments and building centres now replace the invented terrain/placement.
- Foreground paddies have level water surfaces, banks, grass ground, local static reflection probe, textured yards and an authored stone-lined ditch. The ditch is an architectural interpretation, not a traced measured survey.
- Static 128 px reflection probe is captured once; it is an approximate environment reflection, not a planar water reflection. No continuous extra reflection pass.
- Distant trees use spatially grouped impostors. Buildings use instanced existing/new meshes. No minimum-system-spec claim has been established by this work.
- Checked the web north view, original 0:16 comparison, and Wada close-up. Fixed reversed west entrance caused by the 180-degree ambiguity of a footprint rectangle, garden placeholder spheres, overlapping parcel grading, and grass triangles crossing terrain diagonals.
- Tests: 11 survey/legacy-world checks passed; typecheck and standalone production build passed. These checks validate data/model invariants, not visual similarity to the video.

## Remaining work before a faithful finished environment

1. Individually classify and model the street-side foreground roofs and facades; current generic two-storey houses are visibly repetitive.
2. Replace photographic ground outside the northern precinct with finished PBR terrain and detailed river banks. The aerial base retains baked shadows and roof imagery, which looks poor at close range.
3. Match all northern field boundaries against additional video frames, refine water reflections and rice growth stage, and replace broad woodland masks with observed tree groups.
4. Refine Wada roof edge/reed detail, actual garden, white storehouse and other precinct buildings; current models are authored approximations.
5. Solve reference camera and lighting more closely before rating visual fidelity. This is not an identical or completed replica.

## Sources and usage

- [GSI tile catalog](https://maps.gsi.go.jp/development/ichiran.html)
- [GSI DEM specification](https://maps.gsi.go.jp/development/demtile.html)
- [GSI content terms](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html): attribution and processing statement included in the preview. Individual survey-product reuse provisions still need review for the actual release use.
- [OpenStreetMap copyright/ODbL](https://www.openstreetmap.org/copyright): OSM-derived geometry remains attributable to its contributors. Do not treat it as unrestricted proprietary source data when distributing a game/database.
- [Wada main house — Agency for Cultural Affairs](https://online.bunka.go.jp/heritages/detail/188943)
- [Wada house — Shirakawa Village](https://www.vill.shirakawa.lg.jp/1344.htm)
- [Wada itakura and hasagoya — Shirakawa Village](https://www.vill.shirakawa.lg.jp/2352.htm)
- [Original village reference](https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/)

Official monument photos and the video were viewed as references; they were not copied into the model textures. PBR imagery reuses the project's existing authored/licensed texture library. This preview is not a Steam-ready asset clearance or performance certification.
