# Shop roof and wall surface pass

Blender source: assets/authored/ogimachi/shop-roof-v2.blend. Reproducible authoring script: scripts/blender/refine-shop-roof-v2.py.

Separated vertical thatch cut faces from sloping roof material, using compacted-end shading and UVs in physical dimensions. Added short reed tip geometry on low eave faces (5440 polygons before triangulation), preserving roof mass and footprint. Copied facade materials before adjusting roughness and applied a 4 mm two-segment board-edge bevel. First test had an excessively bright cut band; reduced the end material color and inspected the updated render.

This refines existing interpreted geometry; no new surveyed reference reconstruction or roof silhouette match is claimed. Runtime export through export-irori-shop-runtime.py, optimized by scripts/qa/optimize-irori-shop.mjs, yields 3 meshes and 6 baked texture maps. Browser exterior view and Blender render inspected; typecheck passed. Footing implementation from prior pass remains active.

View: /ogimachi.html?view=detail&building=shop&exterior=1
Render: artifacts/ogimachi-phases/shop-roof-v2.png
