# Irori v5 runtime integration

The authored photoreal v5 restaurant replaces only the restaurant archetype in SurveyWorld, including the detail and walking routes. The shop retains its existing model. The separate layout-study route remains unchanged.

Source: assets/authored/ogimachi/photoreal-textured-v5.blend. Export script: scripts/blender/export-irori-runtime-v5.py. Runtime copy: artifacts/ogimachi-phases/runtime-irori-v5/irori-runtime-v5.blend. The original scene is restored after export.

Color, roughness and tangent normal atlases are baked for sign (1024), body, roof and garden (2048 each). Glass and fine reed fibers retain separate materials. Source UV mapping is preserved during atlas creation. Optimizer: scripts/qa/optimize-irori-runtime-v5.mjs. Runtime GLB: public/models/ogimachi/irori-restaurant-v5.glb (17,052,280 bytes; uncompressed export 31,920,292 bytes).

The root is localized to the restaurant origin before export; SurveyWorld applies the existing surveyed lot position, angle, elevation and footprint scale. Legacy restaurant canvas lettering is removed because the authored sign lettering is included. Existing building collision remains unchanged; this is an exterior replacement, not an interior implementation.

Review: /ogimachi.html?view=detail&building=irori
Walk: /ogimachi.html?play=1&spawn=irori

Validation: npm run typecheck and npm run build:ogimachi passed. Build retains the large-chunk advisory. Browser screenshots of both routes confirmed roof, wall, sign and props load on the map. This is not a minimum-spec benchmark or a Steam package update. Runtime illumination differs from the Blender reference render.
