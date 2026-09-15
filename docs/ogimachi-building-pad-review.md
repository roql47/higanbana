# Building pad follow-up

The old sequential pad blend changed 44 inset-corner samples by more than 3cm on the current full survey dataset (sampling local ±0.49 width/depth; base height set to each building's own height). The revised footprint-priority calculation leaves zero failing samples under that same audit. This is a mathematical pad-height audit, not a claim that every rendered terrain triangle now meets every model.

Added a regression test using the survey data and a `?view=detail&foundation=236248631` preview camera. It chooses an available corner camera outside neighbouring expanded footprints. Typecheck, preview build and seven targeted pad, terrain-overlay and side-lane checks pass.

Visually reviewed building 236248631, previously showing roughly -1.6m pad interference. The reviewed corner now shows the stone foundation adjoining the sloped earth. A contrasting gravel strip and the outer terrain/overlay boundary remain visible nearby; they are not fixed by the pad calculation. The terrain still uses a 4m grid and all building perimeters have not been visually certified. No Blender asset or Steam package rebuild in this follow-up.
