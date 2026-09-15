# B002 — Irori restaurant and adjoining shop

Two separately authored Blender roots replace only OSM ways 236248710 and 236248704. Their original roof envelopes, centres and ridge axes are retained. A 180-degree axis normalization turns the long street facades southwest; it does not move either footprint.

## Reference observations

- Restaurant official site: https://www.shirakawagou.jp/ — lattice sliding entry, wooden sign, two paper lanterns, umbrella rack, tanuki pottery, stone lantern and planted pots.
- https://www.shirakawagou.jp/menu explicitly describes the adjoining souvenir shop.
- Shop exterior photograph viewed from https://www.trip.com/restaurant/japan/shirakawa-village/detail/shirakawago-restaurant-irori-20333624/ — three lower white lattice attic windows, two upper panels, steep thatch, wrapping metal canopy, counter curtains, wagon wheels, refrigerator and benches.

The larger southern footprint is assigned to the restaurant and the smaller northern footprint to the shop by inference. This identity-to-footprint mapping is not independently surveyed. Exact heights, rear facades, shared floor level and the connection between the buildings remain unverified. No claim of a one-to-one measured replica is made. Roof textures use existing project assets; reference photographs were not baked into the models.

## Implementation

- Authoring: `scripts/blender/build-ogimachi-irori.py`; editable scene: `assets/authored/ogimachi/B002-irori.blend`.
- Runtime asset: `public/models/ogimachi/irori.glb`, two roots with OSM identity extras and material grouping.
- Restaurant and shop have different dimensions, windows, entrances and props. Japanese lettering is added at runtime.
- Estimated paved forecourts follow existing terrain and connect the west facades to the surveyed main road edge. Main road and nearby junction centreline coordinates remain unchanged. The forecourt boundaries are interpreted, not surveyed.
- Preview offers B001/B002 selection and a registered aerial road/orientation overlay. This update is confined to the Ogimachi preview; it is not a new Steam package.

## Verification and next building

Run typecheck, the Ogimachi road/survey/world tests and `npm run build:ogimachi`. Browser review checks both models, lettering, frontage and the aerial overlay. B003 森の伝承塾 is the next queued building; its identity and visible facades must be established before modeling.
