# Volumetric zabuton — 2026-09-13

Replaced the four box cushions with closed padded meshes: thinner perimeter, convex stuffing, central depression, edge wrinkles, perimeter welt and a small center thread. The old box objects remain hidden in the source and are excluded from runtime export. The four replacements retain the seating positions and use slight orientation/wrinkle variations.

Indigo cotton uses woven microrelief and color variation; the cushion group gets its own color, roughness and tangent normal atlas rather than sharing the whole room atlas. Geometry carries the silhouette and larger folds. No SVG or Tripo asset is used.

Source: `assets/authored/ogimachi/irori-interior-v3.blend`; authoring: `scripts/blender/refine-irori-cushions-v3.py`; close-up render: `artifacts/ogimachi-phases/irori-cushion-v3.png`. The source close-up was inspected for thickness, seams and mat contact. Runtime export retains all 20 room colliders and four moving door/glass nodes.

Runtime asset `public/models/ogimachi/irori-restaurant-interior-v3.glb` is now selected by SurveyWorld. Export validation found the separate cushion normal atlas, 24 total textures, 20 colliders and four door/glass nodes. Typecheck, entry/exit controller regression and Ogimachi production build pass. During an MCP response delay a second background export was run from the saved source into a separate artifact directory; both completed, and the MCP export is the integrated one.
