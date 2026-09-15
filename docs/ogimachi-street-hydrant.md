# Authored street hydrant

Created through Blender MCP with `scripts/blender/build-ogimachi-hydrant.py`. Source scene: `assets/authored/ogimachi/street-hydrant.blend`; runtime: `public/models/ogimachi/street-hydrant.glb`.

Replaces the procedural hydrant beside the noticeboard. Cast barrel, domed bonnet, two capped hose outlets, operating nut, flange anchors and concrete plinth. Authored game furnishing, not a measured reconstruction of a particular historical hydrant. Muted red paint uses a small generated grain texture; concrete includes diffuse and normal maps capped at 512px. 634,680 bytes, 3,516 triangles, three material groups and three embedded images.

The plinth underside conforms to ground support while upper parts remain level. Existing collision proxy and failed-load procedural fallback remain. Added `?view=detail&prop=hydrant` and a close-up button. Typecheck, preview build and three existing streetscape/support checks passed. Browser view confirms red metal, distinct fittings and concrete plinth contacting the earth in the reviewed angle. Applies to detailed/walk/story world; no Steam package rebuild or Tripo generation in this step.
