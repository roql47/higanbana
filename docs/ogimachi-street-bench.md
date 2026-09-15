# Authored street bench

Created through the connected Blender MCP using `scripts/blender/build-ogimachi-bench.py`. Source: `assets/authored/ogimachi/street-bench.blend`; runtime: `public/models/ogimachi/street-bench.glb`.

Four cedar seat planks with bevelled edges, iron legs and wide feet, diagonal braces, a lower stretcher and small fasteners. This is an authored village furnishing, not a measured reconstruction of a particular photographed bench. Existing project cedar diffuse and normal maps are embedded.

736,996 bytes, 2,508 triangles, two material groups. Three benches in the detailed/walking/story world share the loaded material textures; each has its own geometry to fit foot height to the terrain. Existing collision proxies remain in place. If loading fails, the procedural benches remain available. The simplified design preview does not contain these street furnishings.

Typecheck and preview build pass. Export counts were inspected directly from the GLB. In-game close-up reviewed on 2026-09-11: cedar seat, metal braces and feet are visible, with no obvious ground gap in the reviewed view. Added a close-up button and `?view=detail&prop=bench` entry. Five street geometry, support and side-lane walking checks passed. This review covers the representative first bench, not every camera angle or placement.
