# ACT1 north continuation

Eight remaining generic buildings in x (-155,20), z [-230,-120] are replaced, excluding B004 onsen, which has its own authored model. Original survey positions, angles, footprint envelopes and ground heights remain. This adds a continuation/background to the ACT1 corridor, not an extension of the scripted act.

| OSM ID | Model treatment | Evidence |
| --- | --- | --- |
| 236248649 | Low rust-metal workshop, shutters, standing seams and snow rails | Nearby east-side workshop visible in September 2023 street view; dimensions estimated. |
| 236248692 | Compact two-storey wood house, upper window rails, lower eave | South end street reference; exact outline-to-facade association provisional. |
| 586010788 | Two-storey timber/tiled house | West-side sequence partly visible; hidden elevations estimated. |
| 236248687 | Dark boarded two-storey house | West-side sequence in August 2010; exact facade divisions estimated. |
| 236248660 | Two-storey lime/timber house | Nearest west-side building in south-facing August 2010 view. |
| 236248677 | Low plaster/timber tiled building | Partly visible east of the intersection; roof and height estimates. |
| 992212029 | Small tiled shed | Survey envelope only; architectural interpretation. |
| 1465227686 | Small metal-roof shed | Survey envelope only; architectural interpretation. |

References viewed directly in Google Maps:

- https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26115,136.9067&heading=0&pitch=5&fov=100 — resolved September 2023, pano Py0B2rUKgQnm9lpOWw6oDw.
- https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26155,136.90657&heading=0&pitch=5&fov=100 — August 2010, pano nuJAmEEGIzHghFeUWo57Pw.
- https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26145,136.9066&heading=180&pitch=6&fov=100 — August 2010, pano cBJ7las5vgItv7lLoZ0UEQ.

The sources mix dates and cannot establish a single historical snapshot. Rear elevations, window spacing, heights and minor fixtures are authored estimates. No photographic imagery is bundled. Each building has a distinct envelope and details, but this is not a measured replica. Metallic roofs use continuous sheets and standing seams rather than tile courses.

Editable scene: assets/authored/ogimachi/ACT1-north-buildings.blend. Export: public/models/ogimachi/act1-north.glb. Build with scripts/blender/build-ogimachi-act1-north.py through the local Blender addon, then `node scripts/optimize-act1-sides.mjs public/models/ogimachi/act1-north.glb`. Preview: ?view=detail → 북쪽 이어진 거리. Integration: act1Frontage.ts. Existing B004, terrain and ACT logic are outside this change.
