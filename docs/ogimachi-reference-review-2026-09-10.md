# Reference comparison correction

The user correctly rejected the prior scene as visually too different from the supplied Ogimachi film. Texturing and passing geometry tests had been given more weight than visual fidelity.

The original film was opened again in the browser. The northern view around 0:16 shows connected flooded paddies, taller ordinary street houses, substantial deciduous trees inside the settlement and an irregular green valley. In contrast, the current reconstruction had broad low ordinary-house volumes, flat bare ground and dark conifers dominating both wooded margins. House-specific architecture, cultivated-land outlines and the valley silhouette remain insufficiently matched.

This correction removes the arbitrary 1.25–1.85 enlargement pass for ordinary-house footprints. The mapped source centres are preserved. Blender merchant-house models now have two storeys, upper timber walls, floor belts and additional upstairs windows. Their height scaling is capped at 1.12, avoiding warehouse-like widths or excessively tall stretched roofs. Darker glazing replaces the uniformly pale panels.

Deciduous trees now make up a larger share of the forest. Courtyard trees are added only outside buildings, paths, fields and watercourses. The billboard tint no longer multiplies already-dark baked foliage by a very dark green. A simple outdoor environment replaces the studio-room reflection that produced rectangular white highlights over paddies.

`원본 영상 대조` embeds the original hosted film without copying it into game assets. It offers 0:16, 0:25 and 1:39 presets and corresponding approximate views of the authored map. Wide screens show the pair side by side; narrow panels stack them. The renderer labels its view as approximate. Camera positions and lens values are not recovered from the footage and the view is not an image-registration proof.

Current layout totals: 162 main buildings, 146 authored annexes and 95 cultivated parcel groups. Annex/field totals changed when the oversized ordinary-house envelopes were removed. The previously documented 139 annexes and 93 parcel groups are superseded. Main GLB is 9,873,760 bytes.

Eight Ogimachi tests pass after the geometry/layout change. TypeScript and the standalone build pass. Visual improvement is not certified by these tests. The terrain silhouette, exact roof/house inventory, field boundaries, foreground props and natural tree detail still differ from the reference. This is a corrected environment study, not a completed replica or a migrated Steam game.
