# Overall design study 03 — northern main-street frontage

Continues the user's requested overall-design phase along Wada, Hakusuien, Irori and the opposing Mori workshop. This is a silhouette/space study, not a finished textured reconstruction.

## Reference check

Revisited the [World Heritage Center reference](https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/), the registered `assets/reference/ogimachi-gis/north-road-audit.png`, and the restaurant/adjacent shop photographs on [Irori's official website](https://www.shirakawagou.jp/). The road audit supports retaining the mapped centres and orientations. The observed frontage includes substantial open space, so filling the apparent gaps with arbitrary additional houses would be misleading.

Reused the visible-face observations and proportion estimates recorded in the individual B001/B002/B003 documents and their Blender authoring scripts. No new dimensions were measured. The assignment of Irori restaurant/shop identities to the two mapped footprints remains an inference, as recorded in B002.

## Changes

- Five named bodies now have individual wall/eave/ridge proportions in the massing view: Wada, Hakusuien, Irori restaurant, Irori shop, Mori workshop. Wada's body dimensions are distinguished from its overhanging roof dimensions. Other mapped coordinates and orientations remain unchanged.
- Roof slabs have thickness and inset gable ends with flat face shading. Preset cameras fit the existing shadow map to their viewing distance; softer filtering and corrected bias remove the conspicuous teeth along close-up eave shadows without raising the map resolution. The reviewed gables use a timber tone rather than the generic pale infill.
- The Irori shop has the observed low wrapping canopy. Broad dark facade bands show the street side; Mori has a distinct upper-storey band. These are deliberately schematic, not newly claimed window layouts or detailed asset replacements.
- Four forecourt surfaces join the individual wall faces to the existing main road's near edge. They do not relocate or widen the street. Boundaries and grade transitions are interpreted.
- The existing Wada outbuilding categories now distinguish the steep storehouse from the low metal-roof drying shed.
- New central-street overview, Irori-front and Hakusuien-front cameras. The initial view frames the corridor. Detail/story entry routes remain separate.

The calculated facade-centre setbacks to the main-road edge are about 2.9 m (Mori), 13.1 m (Hakusuien), 9.2 m (Irori shop), and 12.4 m (Irori restaurant). These describe the current source-coordinate model and estimated body dimensions, not surveyed real-world distances.

## Verification

Typecheck, standalone production build, and 25 targeted Ogimachi tests passed. New coverage checks individual proportions, forecourt upward-facing triangles and edge joins, and actual construction of the complete massing scene with mixed roof geometry. Browser checks covered the corridor overview and both street cameras; an initial incompatible geometry-attribute merge was fixed before delivery and is now covered by the scene-load test.

Remaining: verify unreviewed central roof identities and the long B004 building's separate roof sections; calibrate the main-street ground profile against additional reference views; resume facade textures/props only after the overall composition is accepted. The main game/Steam package was not repackaged by this design step.
