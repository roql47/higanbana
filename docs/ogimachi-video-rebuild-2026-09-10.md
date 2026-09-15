# Ogimachi original-video landscape study — 2026-09-10

## Reference and observations

Primary reference: https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/

The embedded original video is 264.33 seconds long. Representative frames were examined directly in the browser using playback and seeking; this is not a reconstruction from a downloaded video, a survey, or photogrammetry.

| Video time | Observed composition | Applied to this new scene |
| --- | --- | --- |
| Opening, approximately 0:07–0:10 | Long settlement, fields in the foreground, wooded sides | Long river terrace, broad foreground and distant wooded slopes |
| 0:25 | Detached gassho houses beside wet rectangular fields; lower additions | Gassho farm model with tiled side canopy; interspersed fields and storehouses |
| 1:12 | Green rice fields, narrow boundaries, mixed roof heights | Planted parcels, small irrigation channels, three building archetypes |
| 1:39 | Denser frontage along a continuous central street | Added lower merchant-house frontage around a connected six-metre main road |
| 2:04 and 2:34 | Winter views expose steep gables, attic windows and thick eaves | Thick roof geometry, closed timber gables, attic windows on both ends; no snow season implemented |
| 3:06 | Traditional house with a low extension and adjacent tree | Side entrance canopy and smaller trees around house yards |
| 3:38 | Open timber bell tower and blossom tree | Identified for a subsequent bespoke asset; not represented by an unrelated placeholder |
| 4:04 | Wide green panorama, elongated low terrace and river along one edge | New independent terrain, river corridor and surrounding forest |

The site's description gives an approximately 1,500 m north–south settlement, up to 350 m across, a six-metre central road and smaller local lanes. These constrain the study's scale. Individual house positions and field corners are authored approximations; they are not claimed to match real addresses or measured footprints. The green-season footage is the working art reference, although the video also includes snow and blossom sequences.

## Deliverables

- Independent preview: `http://127.0.0.1:5188/ogimachi.html`; run `npm run dev:ogimachi` if the server has stopped.
- New map code: `src/world/ogimachi/`; no imports from the old Higasato layout or story coordinates.
- 145 placed buildings, 90 cultivation parcels, connected main and local roads, a river crossing, and 15,350 forest/yard trees.
- Editable Blender scene: `assets/authored/ogimachi/village-library.blend`.
- Runtime model: `public/models/ogimachi/village-library.glb`, approximately 4.1 MB, with farmhouse, merchant-house and storehouse archetypes.
- Authored wood/thatch albedo and normal maps are embedded in the GLB. The low houses include timber wainscots, plaster bays, side windows, entrance slats and canopies.
- Oak atlas: `public/textures/ogimachi/oak-8.png`, eight views rendered in Blender from the existing oak mesh. Forest uses spatially grouped instances; the preview redraws on loading, camera interaction or resize rather than continuously while idle.
- Standalone export: `npm run build:ogimachi`, output `dist-ogimachi/`. Only the assets needed by this preview are copied.

The local Blender MCP add-on was used through its loopback `execute_code` endpoint, via `scripts/blender/run-local-mcp.py`. Authoring happens in a separate Blender scene and exports only that scene's selected assets; the user's original scene is preserved. Reproduction scripts are `build-ogimachi-library.py` and `bake-ogimachi-oak.py` in the same directory. The oak bake consumes the decoded, uncompressed intermediate `assets/authored/ogimachi/oak-bake-source.glb`.

## Validation and limits

TypeScript checks, all 112 repository tests and the independent production build pass. Tests cover building/road/field separation, connected lanes, terrace/river height relationships and the exported GLB's archetypes, geometry and materials. Browser views were inspected at elevated and street level. Earlier geometry-merge errors were corrected; historical entries can remain in the same browser tab's console. Vite reports its standard greater-than-500-kB JS chunk warning; this is not a benchmark of the shipped game.

This is a new environment study, not a finished replica or the Steam build. The existing game, saves and native release packages were not migrated to it. Remaining production work includes bespoke house variants and annex footprints, roof/reed/weathering detail, continuous water-edge dressing, the observed bell tower, fences/stonework and daily-life props where the reference supports them, near-camera tree geometry, and integration of player collision, story entrances, triggers and navigation. The present orbit preview has no playable physics or act progression. Visual review still shows repeated building forms and simplified terrain edges; passing code tests does not certify reference-level art fidelity.
