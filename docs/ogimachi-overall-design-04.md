# Overall design 04 — B004 Shirakawa-go no Yu

Continues the separate massing/design preview. Targets only mapped building **236248626**, retaining its centre, angle and 15.135 × 54.613 m roof envelope. The generic merchant body is replaced in the design view with a long two-storey timber elevation. The detailed/Steam asset assignment remains unchanged.

## References inspected

- [Official hotel exterior](https://www.shirakawagou-onsen.jp/common/img/main01.jpg).
- [Official facility page](https://www.shirakawagou-onsen.jp/facility.html) and its exterior banner `common/img/facility/facility_main.jpg`.
- [Tourism association listing](https://www.shirakawa-go.gr.jp/stay/13/) for identity/location context; its displayed room photographs do not establish roof geometry.
- Existing registered north-road aerial audit and survey footprints.

The exterior photographs show a long timber facade, upper glazed bays, projecting rails, lower dark screens and a small entrance canopy with blue fabric. They do **not** establish separate transverse roof wings, so those have not been invented. No reference image pixels were downloaded or used as game textures.

## Interpretation and changes

- Uses a low continuous ridge, timber wall treatment, foundation band, separated upper bays and balcony masses. Dimensions, bay count and spacing are schematic estimates; the observed photographs are not measured elevations.
- Entrance canopy, posts and a broad blue fabric block provide a recognizable entry mass. Its offset and placement on the east long side are provisional. The river side and unseen ends remain plain.
- A small 3.2 × 7.8 m entry landing follows the rendered terrain. It does not extend through the neighbouring house plots to the main road. The exact access route needs further reference confirmation.
- Added **온천 전경** and **온천 입구** cameras. The overview preserves the intervening buildings so the remaining visibility/access questions are apparent.
- Source `survey.json` and main-road geometry were not changed. No new paid asset or full interior was created.

## Validation

TypeScript, the preview build and 26 targeted Ogimachi tests passed. New checks cover unique B004 targeting, preservation of source data and roof envelope, absence of a generated road-crossing forecourt, valid dimensions, and full-scene geometry construction including the local landing. Browser inspection covered the overview and entrance; a partly buried flat landing was replaced with a terrain-following surface.

This remains an overall-design study, not a finished textured B004 asset or an exact replica. Next useful work is confirming the northern street's access gaps and unreviewed roof identities, then reviewing the entire corridor at walking height before committing to fine facade details.
