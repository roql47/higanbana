# B003 — 森の伝承塾 / Mori no Densho Juku

## Identification and evidence

OSM way **236248644**, centre **(-91.166, -115.022)**, mapped roof envelope **11.420 × 14.274 m**. This is the two-storey timber workshop on the west side of the main road, opposite the Irori buildings. The sign can be read in the reference; it is not a generic thatched house.

Reference images were visually inspected in Google Street View, **August 2010**, at two viewpoints:

- [East facade, sign and entrance](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26095,136.90677&heading=260&pitch=14&fov=110)
- [North oblique view, projecting bay and frontage](https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26107,136.90676&heading=220&pitch=8&fov=95)

Google's place title refers to a nearby preservation foundation; identification here relies on the photographed **森の伝承塾** sign and corresponding mapped frontage. The observed roof is low and dark; exact pitch/ridge height are estimates. Current use and alterations after 2010 are not established.

## Authored work

- Separate `mori-workshop` GLB root, with OSM identity, reference date and roof envelope extras.
- Long upper window row, fine vertical-board aprons, distinct ground-floor frosted utility windows, central timber sliding entrance and rose curtains.
- Pale irregular-edged sign, transom lattice, small woven basket displays, projecting north bay with upper window guard.
- Sheet roof with standing seams, gutter/downpipes, small pots and blue tub. Project textures are embedded; Street View pixels are not used as textures.
- Generic merchant instance replaced at this footprint only. Local **+X** faces east toward the existing road; ridge axis and footprint centre are preserved.
- Narrow frontage follows the rendered terrain to the surveyed road edge. Its exact boundary is interpreted, not measured. Neighboring buildings and road centreline remain in place.
- B003 button and registered aerial overlay expose the new model and its facade direction.

## Limits and verification

Unverified: rear/end faces, precise height, exact bay/door dimensions, hidden interior and post-2010 changes. This is a source-based reconstruction of the visible elevation, not a surveyed replica.

Editable source: `scripts/blender/build-ogimachi-mori.py`; scene: `assets/authored/ogimachi/B003-mori-workshop.blend`; runtime: `public/models/ogimachi/mori-workshop.glb`.

Validation covers mapped identity/orientation, roof envelope metadata, textured material presence, preview build/typecheck and browser inspection. Ogimachi preview only; the main game/Steam package is not updated by this step. Next queued building: **B004 白川郷の湯**.
