# Tripo ceramic prop and denser entrance garden

2026-09-12. User authorized using Tripo where it produces better modeling than Blender.

Tool choice: architectural dimensions, lattice and editable fern fronds remain authored in Blender. The existing Tripo fern pot was inspected and rejected for this view because its foliage was too angular. One new standalone glazed tanuki was generated from a written description; no reference photograph uploaded. It is an interpretation, not an exact replica of the photographed statue.

Tripo task: a22bf892-8fd7-45f9-a957-d21c31ca413d, model v3.1-20260211, text-to-model, detailed texture/PBR, requested 12k faces. Actual imported mesh: 11,528 triangles. Cost 30 credits, balance 1650 → 1620. Task and source outputs saved in assets/tripo/irori-weathered-tanuki-v1; task ID also recorded immediately in docs/tripo-log.jsonl before downloading. Raw model retained.

Rendered candidate was accepted for the glazed ceramic texture and more organic shape. Normalized to 1.18m high, rotated to face the street, positioned with feet on the existing 0.18m entrance slab. First render exposed reversed facing; corrected before final. Straw-hat glaze brightness and roughness adjusted in Blender. Existing simple tanuki objects hidden; old hat faces removed from a copied wood mesh with a backup mesh pointer and pre-change checkpoint.

Added three hollow rimmed clay planters with soil and twelve fern fronds each, fine paired leaflets, central folds and stems. Existing coarse leaf/pot objects hidden to avoid overlap. This is artistic dressing, not surveyed plant inventory. No additional tree density or distant geometry was added.

Outputs:
- assets/authored/ogimachi/before-tripo-dressing.blend
- assets/authored/ogimachi/photoreal-entrance-tripo.blend
- artifacts/ogimachi-phases/photoreal-tripo-final.png
- scripts/blender/dress-irori-garden.py
- scripts/blender/install-irori-tripo-tanuki.py
- photoreal-compare.html updated to new Blender render

Checked candidate render, combined test render, orientation and slab height. Final uses the same camera, 1600×1440, Cycles Metal GPU, 96 samples. PBR images packed in the saved scene. Runtime map and Steam package not replaced; render materials need baking/adaptation for runtime. Source statue likeness, full photorealism and hardware targets are not certified.
