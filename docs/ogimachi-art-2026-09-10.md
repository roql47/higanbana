# Ogimachi-inspired village art pass

## Target

The user explicitly selected the Ogimachi landscape, superseding the previous generic Showa mountain-village direction. The game now uses that visual reference: steep gables, attic windows, boarded elevations, dispersed farms, shallow cultivated paddies and a forested mountain backdrop. This is an adaptation inside the existing story map, not a surveyed reconstruction of Ogimachi.

Primary references:

- https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/
- https://whc-shirakawa-goandgokayama.jp/en/learn/structure/

The official landscape photograph and architectural description were inspected. Its photographs were not copied into game textures.

## Implemented sequence

1. New solid, 56-degree thatched roof slopes with thick eaves, a capped ridge, boarded triangular gables, timber frames and two levels of small attic windows.
2. Dedicated shared reed and smoke-aged cedar PBR materials. Roof UVs follow the slope, and smooth tonal variation replaces coarse checkerboard vertex staining.
3. Fifteen gassho-style houses among nineteen village buildings; small shops and an agricultural outbuilding retain lower roofs. Two larger 8 × 10 m farms give the dispersed settlement a wider range of scales. Original eight story house anchors remain stable.
4. Three additional shallow rice plots, low banks, rows of young rice, and connecting farm lanes. Field height is shared by rendering, terrain collision and footstep classification. These plots are separate from the original tall-rice stealth area.
5. Light gravel/earth lane surfaces, terrain-following channels from the preceding pass, and raised distant ridges.
6. A distant forest using 2,400 two-triangle cedar impostors. Near-village and mountain trees share the same atlas texture objects through cedarAtlas.ts to avoid duplicating two 2048-square GPU textures. Exterior visibility includes the new landscape group.

## Validation and build

- TypeScript and all 109 tests passed.
- Added checks for roof pitch, finite geometry/UVs/normals, roof bounds, field water/soil alignment, route/site clearance and the outer terrain seam.
- Existing house anchor, roof spacing and shrine approach checks remain passing.
- Inspected both the isolated daylight environment and the integrated ACT 4 game view in the separate port-5187 save origin.
- In the integrated game, a 1.3-second forward input moved 1.85 m along the central street with no active camera sequence or blocked passage.
- Desktop content: 358 files, 87.95 MiB; main-BQ5eu-tc.js.
- macOS and Windows staging folders and preview ZIPs refreshed. Windows was not runtime-tested.
- The pre-existing large JavaScript chunk warning remains.

## Fidelity limits

Story locations, the compressed map scale and lighting remain game-specific. Existing school, inn, shrine and other story interiors were not rebuilt as real Ogimachi properties. Roof silhouettes and the farm/field composition are closer to the reference, but individual building dimensions, mountain contours, mixed broadleaf woodland and scanned surface detail are not exact matches. No claim of photogrammetric or near-identical reproduction is made.

Current tools are sufficient for this procedural game-art pass. Blender can support future bespoke hero assets and baking, but this pass was authored directly as Three.js geometry and materials; it did not use Blender MCP.
