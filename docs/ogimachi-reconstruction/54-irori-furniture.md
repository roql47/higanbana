# Irori furniture and finishes — 2026-09-13

Continuation after the padded zabuton pass. Scope: four tatami mats, four table tops with joinery, four chair seats/stretchers, and four ceiling lanterns.

The tatami receives a separate woven rush material with crossed reed/cord relief, rounded thickness, dark cloth binding and stitch detail. Table tops are three joined planks with rounded edges, underside aprons and joinery pegs. Chairs receive closed scooped seats and lower stretchers. Lantern cubes are replaced by thin folded washi panels, horizontal wooden ribs, lower diffuser and an internal socket. Prior geometry remains hidden in the editable source. Existing aisle and collision layout is retained.

Source authoring: `scripts/blender/refine-irori-furniture-v4.py`. Editable output: `assets/authored/ogimachi/irori-interior-v4.blend`, with a pre-edit checkpoint alongside it. Target runtime: `public/models/ogimachi/irori-restaurant-interior-v4.glb`. Tatami has an independent color/roughness/normal atlas; the rest shares the room atlas. The independently modeled v3 cushions are retained.

The Ogimachi build asset list still selected the older exterior-only restaurant. That asset path was updated to the current interior so the static build includes the same restaurant as the development map. This does not create a new Steam package.

Validation completed: Blender room render inspected; game screenshot inspected after v4 reload. Export preserves 20 colliders, four moving door/glass nodes and four light anchors; 27 textures include separate tatami and cushion normal atlases. Production character-controller entry/exit test, type checking and Ogimachi build pass. The new 29 MB GLB is present in both public and dist-ogimachi. Existing large JavaScript bundle advisory remains. No minimum hardware or FPS guarantee was established by this check.
