# Irori staggered floorboards — 2026-09-13

Replaced the old single textured floor slab and its 40 overlaid dark joint lines with long cedar boards. Rows use approximately 19.5 cm widths, 2.35–3.15 m main lengths, varied starting offsets and 1.8 mm joints. Top height stays at local Z=0.30 m, matching the unchanged floor collision proxy and threshold. The old visual meshes are hidden, not removed from the editable source.

A dedicated grain material contains no photographed tile border. UVs and stretched procedural grain run lengthwise along each plank; slight edge bevel and fine bump provide relief. All boards share one mesh and material before runtime baking. Color, roughness and tangent normal maps use a separate floor atlas.

Source: `assets/authored/ogimachi/irori-interior-v5.blend`; pre-edit backup alongside it. Script: `scripts/blender/refine-irori-floor-v5.py`; inspected render: `artifacts/ogimachi-phases/irori-interior-v5.png`. This pass covers the floor; wall/ceiling refinements and further lighting work remain separate.

Integrated runtime: `public/models/ogimachi/irori-restaurant-interior-v5.glb`. SurveyWorld and the build asset list select v5. Export confirms floor normal atlas, 30 textures, 20 colliders, four moving door/glass nodes. Typecheck, actual Irori controller entry/exit regression and Ogimachi build pass. Built model presence verified in dist-ogimachi. Game screenshot confirms the staggered long-board floor without the former square grid. No full performance benchmark was performed.
