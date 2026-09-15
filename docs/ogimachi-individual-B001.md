# B001 — Hakusuien and the northern street junction

The user requested individual reconstruction of roads, directions and every distinct building. This is the first individually tracked street-side building, following the earlier approximate Wada precinct. The work is not a claim that every house or street now matches the reference.

## Model and placement

- Building: 白水園 (Hakusuien), OSM way 236248693, centre (-44.773, -62.951) metres relative to Wada.
- Preserve the mapped roof envelope: 11.894 × 19.555 m. The model is designed to this envelope rather than scaling a generic two-storey merchant house.
- Street-facing long side points west, resolving the 180-degree ambiguity of the minimum footprint rectangle. Roof direction follows the existing footprint.
- New Blender scene and `.blend`: `assets/authored/ogimachi/B001-hakusuien.blend`.
- Individual game model: `public/models/ogimachi/hakusuien.glb`.
- Authoring script: `scripts/blender/build-ogimachi-hakusuien.py`. It preserves earlier Blender scenes.
- Observed facade details: deep thatch, aged wood/lattice glazing, purple three-panel noren, exposed stone footing, low benches, standing timber sign and roof pegs. Lettering is authored text, not a copied photo/sign texture.
- Corrections after visual inspection: raised the bottom of the roof pack so the noren is visible, moved the sign to the right of the street-facing entrance, aged the overly bright wood, and framed the whole building for narrow browser windows.

### What is still unverified

The north/south gable window layout, rear facade, interior, exact roof height and doorway offset are not established by the available front photographs. The gables remain neutral boarding, not falsely completed replicas. Wall dimensions, roof height and small props are photo-based estimates. Additional facade references must be checked before this building is marked fully reconstructed.

## Roads

The registered aerial image was overlaid with the source road lines and building polygons. The review crop is `assets/reference/ogimachi-gis/north-road-audit.png`. Source centrelines were retained rather than moved for appearance.

- R001 / way 1268046903: village main road, reviewed width estimate 6.2 m.
- R002 / way 34320767: branch beside Hakusuien toward Wada north, width estimate 3.4 m.
- R003 / way 540155249: northern field-edge path, width estimate 1.65 m.
- R004 / way 236248800: Wada west access path, provisional pedestrian width 1.5 m.

No measured width tags exist for these four ways. These are expressly estimates, not exact measurements. OSM surface tags and any explicit width values now survive data preparation.

Found and fixed a rendering defect: the original ribbon triangles faced downward, so front-face culling hid road surfaces from above. The replacement strips face upward and share cross-sections at bends. Small bridge ways previously skipped by the renderer are included; bridge decks interpolate their endpoint elevations instead of following a ditch. Long ways are clipped at the preview boundary instead of being discarded wholesale. Gravel, asphalt, wood and stone surfaces are separated according to source tags.

## Review UI

- **B001 백수원** frames the individually authored street facade.
- **길·방향 대조** opens a north-up aerial overlay with the real road lines, bridge segments, building outlines, scale and Hakusuien facade arrow.
- The arrow describes the building facade direction, not traffic direction.
- Existing source-video comparison remains available in the village view.

## Record and next units

`assets/authored/ogimachi/individual-review.json` is the editable registry; its generated public copy accompanies the survey. It separates observed details, unknown details, sources, model assignment and review state. Other buildings retain an explicit placeholder/queued status.

Next mapped units: B002 お食事処いろり (check its relation to the adjacent way 236248704 before modeling); B003 森の伝承塾 (confirm current identity and facade); B004 白川郷の湯 (separate long wings and river/street elevations). Source photos must be inspected before authoring each unit. Previous material and primitive helpers may be reused, but the building shape and layout require an individual model.

## Validation

15 targeted survey/road/legacy-world tests passed. Road regressions check upward normals, shared bend geometry, clipping of through-roads, three Wada bridge endpoints/materials and unique placement/orientation of B001. Typecheck and standalone production build passed. Web review covered B001 front and the registered road overlay. These checks do not establish photogrammetric accuracy or full visual equality with the reference.

## References inspected

- https://shirakawa-go.gr.jp/shop/23/ — official identity and location.
- https://www.vill.shirakawa.lg.jp/1575.htm — official thatched-building description.
- https://japantravel.navitime.com/zh-tw/area/jp/spot/02301-4100048/ — street-facade photograph.
- https://www.cocolocala.jp/spots/44194 — entrance photograph.
- Existing GSI and OSM source manifests apply to the aerial image and geometry.

The referenced external photographs were viewed, not downloaded into the game textures. Steam/game-map integration was not changed by this preview work.
