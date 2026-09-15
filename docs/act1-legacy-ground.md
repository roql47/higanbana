# Original ground rendering applied to the ACT1 street

The user's requested reference is the original Higasato story-map ground. Its material was extracted without changing settings into `src/world/higasato/groundMaterial.ts`; both Higasato and the new ACT1 street use this function.

The ACT1 ground uses the exact original aerial_grass_rock 1K diffuse/normal/ARM images, 4 m world UVs with the original +100 m phase, normal scale 1, AO intensity .5, and .29 / .45 two-scale texture mixing. Original grass (.48,.62,.40) and dirt (.72,.62,.46) vertex tints and the main-lane 1.5 m half-width / 1.2 m smooth boundary are used. Plot edges use the original 1.5 m feather and .8 dirt tint.

The local 84 × 124 m patch replaces the ACT1 grass/soil/parking/shop surface overlays with one 20,832-triangle ground mesh; collision uses that same mesh. Ogimachi's existing coordinates/elevations remain authoritative, so this is the original rendering method on the new terrain, not a copy of Higasato's geographic layout. The rest of the distant survey remains unchanged.

Validation: typecheck and build pass. A constructed-ground check confirms texture paths, world UVs, normal orientation, AO/normal settings and the shared shader's two-scale constants.

## Boundary and walking pass

The uniform 20 cm edge is now tapered over the last 3 m: the patch meets roads at +12 cm and bare terrain at +2 cm. The design preview's higher road offset fades toward the patch over 6 m. Detailed roads are clipped at the same patch bounds instead of retaining side-road collision sheets under the earth.

A real Rapier capsule test uses the generated ground mesh over a sloping terrain and crosses the patch edge in both directions without jumping or teleporting. This exposed intermittent long-ray misses exactly on a shared triangle edge. Ground-height queries now retry within 5 mm only after an exact miss. Five focused tests pass, including boundary interpolation, clipping, capsule traversal and onsen entry/exit. This verifies the tested boundaries, not every prop and route in the full village.
