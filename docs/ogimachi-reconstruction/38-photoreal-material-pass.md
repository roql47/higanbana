# Architectural material/light pass with fixed camera

Used blender-photoreal-architecture skill. Read-only inspection found Blender 5.1.2, active Phase3_Three_House_Block.006, unsaved session filepath, 272 objects, 42 scene-used materials vs 1122 file materials. Viewport looked at unrelated terrain; root world coordinates and camera were valid. Saved scene checkpoint before modifying it in place; historical scenes were not removed.

Added stable Photoreal_Entrance_Camera, rendered baseline, then retained its transform/lens through test/final renders. Existing object links/parents were preserved and modified mesh data copied. Timber UV directions now follow each connected member's longest axis, normal strength reduced, roughness adjusted. Carved stone uses fine-grain packed albedo rather than masonry wall texture; procedural micro-bump adds pores. Thin 5mm glass panes use transmission 1, IOR 1.46, roughness .045; existing pockets/reveals are retained. Added fine reed tips only at near visible eave. Small worn edge bevels, localized lintel paint variation and daylight/bounce illumination.

Baseline: 700×630, 24 samples. Test: 700×630, 48 samples. Final: 1600×1440, 96 samples, Cycles Metal GPU, AgX, exposure 0. Final render inspected; first excessive paint mottling softened and rerendered.

Files:
- assets/authored/ogimachi/photoreal-before-checkpoint.blend
- assets/authored/ogimachi/photoreal-entrance.blend
- artifacts/ogimachi-phases/photoreal-before.png
- artifacts/ogimachi-phases/photoreal-entrance-final.png
- artifacts/ogimachi-phases/photoreal-validation.json
- photoreal-compare.html

Final scene images are packed. Saved library scene metadata can be read. Separate background Blender startup crashed with exit 139 before verification, so separate-process reopening did NOT pass. Current UI session was not replaced. The .blend includes final node adjustments beyond the base in-place pass script.

Limits: rendered architectural improvement, not an exact photographic replica. Vegetation remains visibly simplified, pottery stylized, glazing lacks detailed reflected surroundings, dimensions/camera not measured. No new 3D runtime asset or Steam package; Cycles material/lighting results must be baked/adapted and tested before game integration. Do not call current full scene photorealism complete.
