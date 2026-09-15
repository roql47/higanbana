# Adjacent shop fabric pass

Restaurant sign revision 7 remains in the production detail/walk model. The adjacent shop now loads its own irori-shop-v5.glb instead of the old combined library.

Blender changes: five connected box-shaped noren panels replaced with subdivided draped surfaces, variable folds, gently sagging hems, 2 mm thickness and rough red textile shading. Structural timber and canopy edges received a 6 mm two-segment bevel. Existing shop dimensions, placement and lettering are preserved. This is a fabric and edge refinement, not a completed photo reconstruction of the shop.

Editable checkpoint: assets/authored/ogimachi/shop-fabric-v1.blend. Scripts: refine-irori-shop-fabric.py and export-irori-shop-runtime.py in scripts/blender. Runtime bake artifacts: artifacts/ogimachi-phases/runtime-irori-shop-v1. Roof and body atlases compressed to 2048 WebP before runtime integration.

Validation: Blender close render shop-fabric-detail.png and browser detail route inspected. Initial camera was obstructed by the neighboring building; moved into the gap. Typecheck and Ogimachi build passed. Large bundle advisory persists. Review route: /ogimachi.html?view=detail&building=shop.
