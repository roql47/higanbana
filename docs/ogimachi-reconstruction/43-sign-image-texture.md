# Sign image texture — v5

Inspection confirmed the sign had no UV layer or image node. It used Noise/Wave nodes, which produced visibly artificial stripes. This pass replaces that material with a project-owned generated burl-wood image and explicit SignSlabUV coordinates; the sign silhouette and v4 comparison camera are retained.

- Albedo: public/textures/ogimachi/sign-v5/chestnut-burl-albedo.png (actual output 1254 × 1254, sRGB).
- Front uses a single slab region; sides have a separate thin-depth mapping.
- The same image drives restrained roughness variation and 2.5 mm maximum bump distance at 0.28 strength. These are artistic approximations, not measured normal/roughness maps.
- Lettering now sits close to the surface with 0.4 mm extrusion; crest thickness reduced to 4 mm, both with a rough ivory paint material.
- Upper cedar blotch contrast reduced. Slight UV distortion added to existing kaya image mapping to reduce repetitive straight stripes while preserving fiber direction.

## Outputs

- Checkpoint: assets/authored/ogimachi/before-sign-texture-v5.blend
- Editable result: assets/authored/ogimachi/photoreal-textured-v5.blend
- Whole entrance: artifacts/ogimachi-phases/sign-texture-v5-final.png
- Sign close-up: artifacts/ogimachi-phases/sign-texture-v5-detail.png
- Reproducible material pass: scripts/blender/apply-irori-sign-texture-v5.py

The built-in image generation tool was used; no Tripo generation or paid Tripo credits were used for this pass. Original generated image was copied into the project and retained at its generated location. Existing original reference photograph was neither downloaded nor edited. This is a Blender material/render update; runtime game export is not claimed.

## Generation prompt

Use case: photorealistic-natural. Asset type: diffuse albedo texture for a single irregular wooden restaurant sign in a Blender reconstruction of an old Japanese farmhouse. Generate one square 2048x2048 edge-to-edge material photograph of a SINGLE continuous old chestnut burl wood slab surface, no board joints. Straight-on orthographic macro scan, evenly lit diffuse light with no cast shadows or glossy highlights. Deep warm umber, smoked brown, subtle ochre age variation. Beautiful organically curling, tangled irregular wood grain, a few natural knots and fine checking cracks, fine pores, rubbed smooth areas and slightly weathered pale fibers. Tangential swirling burl grain rather than a circular tree-ring cross section. Real old wood, not orange plastic, not repetitive sinusoidal stripes. Texture fills every pixel; no visible outer edge of a board, no background, no text, no logo, no lettering, no nails, no border, no watermark. It will be mapped onto an existing modeled sign; do not draw a sign or any lettering.
