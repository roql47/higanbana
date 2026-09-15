# Overall design study 02

Continues the separate `/ogimachi.html` large-form study. Individual building details and new generated props remain deferred at the user's request.

## Changes

- Applies the existing aerial-reviewed woodland mask to ground color and a single instanced canopy mesh. Deterministic irregular spacing avoids plantation-like rows. Building envelopes, field polygons, road corridors and watercourses exclude crowns.
- Levels the ten reviewed northern paddy parcels, using the median DEM boundary elevation as an **estimated** terrace height. Adds earth banks and transitions to the surrounding terrain. Supporting terrain and overlapping general farmland stay below these surfaces to prevent diagonal intersections.
- Uses a 4 m terrain grid around the northern parcels and 8 m elsewhere, stitching fine boundary vertices to the coarse grid. Building pads blend into surrounding terrain.
- Separates pale gable ends from roof slopes and increases the steep-roof massing pitch. Unidentified building roof types and heights remain provisional.
- Adds a paddy close-up camera and woodland visibility control. Mapped building centers, orientations and road coordinates are unchanged.

## Sources and limits

Uses the same reference video, GSI DEM, existing traced woodland image and mapped parcels as study 01. No new survey was obtained. The forest mask is a broad hand-reviewed interpretation, not a surveyed forestry boundary; individual trees, bank heights, river widths and unreviewed roof identities are not exact reconstructions. Colors and canopy shapes are blockout materials, not final textures. Detailed mode and the separately developed story route remain separate from this design study.

## Validation

- TypeScript checks and 22 Ogimachi tests passed, covering source coordinates, parcel levels, support clearance, canopy exclusions and mask registration.
- Production preview build passed. Browser inspection covered the north panorama, valley view, paddy close-up and visibility controls. The visible diagonal farmland intersections were corrected after the first visual check.
- Export `scripts/gis/prepare-ogimachi-massing.py` with Python plus Pillow to reproduce `massing.json` and `forest-cover.bin` (128 × 214 bytes). The existing `woodland.png` is the mask input.

Next large-form review: verify dense central street frontage and roof classifications against the reference before resuming individual facade and prop work.
