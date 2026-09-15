# Rural village realism pass — 2026-09-10

## Basis and scope

Fictional Showa-style mountain settlement with older timber houses, consistent with the existing bus and television. This is not a reconstruction of a particular region or period.

Primary reference: [World Heritage Center: Ogimachi](https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/). Its description of small cultivated plots, waterways as boundaries, and separate agricultural outbuildings informed the open domestic yards. Region-specific gassho architecture is not treated as universal Japanese architecture.

## Implemented

- Open domestic lot boundaries; short raised edges retained only at commercial lots.
- Rear kitchen gardens, soil rows, and low crop clusters sampled against terrain height.
- Farm drying racks with tied multi-stem sheaves.
- Exterior timber rain shutters and rails at authored frontages.
- Grain shop signage and a separate tool-repair frontage instead of repeated generic shops.
- Hollow stave buckets, hoops and a dipper; legacy bucket geometry also opened.
- Shallow U-shaped roadside channels conforming to terrain. These are visual geometry, not simulated flowing water or excavated terrain.
- Retained material batching and shared textures; no additional lights.

## Verification

- TypeScript checks passed.
- All 107 tests passed, including house spacing, route clearance and terrain checks.
- Desktop build passed: main-BtS_DRav.js; 358 content files, 87.95 MiB.
- Daylit isolated scene reviewed for main street and farm rear yard. This review does not establish complete night-time gameplay or Windows runtime verification.
- Existing large JavaScript chunk warning remains.

## Remaining visual scope

House silhouettes and base wall textures still reuse the existing modular architecture. A full architectural art pass, region-specific roof construction and individual weathering remain separate work. This pass improves settlement use and details; it is not a claim of museum-grade historical accuracy.
