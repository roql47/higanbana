# Overall design study 01

The user paused interiors, props and individual-building refinement to review the whole village first. `/ogimachi.html` now opens a separate massing study; `?view=detail` retains the existing authored buildings and `?play=1` retains the separate walk entry.

## Reference and changes

The supplied [World Heritage Center page and its Ogimachi video](https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/) were inspected, including the 0:16 northern panorama alongside the previous map. The page describes a crescent river terrace, a north–south main road, small irregular fields and road-side clusters. The former view lacked modeled river surfaces, rendered only ten field overlays, used aerial imagery across steep ground and classified nearly all buildings as the same merchant archetype.

This study:

- Retains GSI elevations and all 456 mapped building centres/orientations; no random extra buildings or relocated streets.
- Removes photographic terrain from the design view. Continuous colored terrain makes the valley slopes readable without photographic shadows or roof images on the ground.
- Adds eight source OSM watercourses, including the Sho and Ushikubi, with interpreted widths and a shallow bank transition. These are not surveyed river boundaries.
- Displays all 101 available agricultural polygons, with a separate raised layer for reviewed paddies that overlap broader farmland.
- Uses plain walls and roof masses. Known reviewed structures retain their broad roof type; other steep/low roof assignments are an explicit design hypothesis based on location and footprint proportions, not verified building identities.
- Separates north panorama, whole-valley and overhead plan cameras; includes a buildings visibility switch and the original reference-video comparison.
- Loads the detailed GLBs only in the preserved detail view. No new paid assets were generated.

## Deliberate limits

This is a blockout, not a final textured environment or an exact replica. Roof heights and unverified classifications, river widths and bank profiles still need visual calibration. Terrain uses an 8 m mesh; bridges are schematic. Exact parcel terraces and woodland boundaries need another pass. The game and Steam package were not redesigned here.

## Validation

Typecheck and Ogimachi regression tests; source-coordinate consistency and immutability tests for the new study; browser inspection of panorama, plan, visibility toggle and video comparison. Data export is reproducible with `python3 scripts/gis/prepare-ogimachi-massing.py`.
