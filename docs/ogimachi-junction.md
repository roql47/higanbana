# North junction — four building study

Replaces IDs 660927473, 660927475, 660927476 and 671938230 in the story/detail SurveyWorld. Keeps original positions, rotations and survey building envelopes. This is scenery beyond the scripted ACT1 run, not additional story content.

Reference inspected: https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=36.26212,136.90637&heading=55&pitch=4&fov=100 — September 2023, pano TbleDhHAMTjFxIl23GIwdQ, resolved at 36.2621429,136.9063893. The view shows a tall pale corrugated warehouse end, a plaster/timber house and a long low commercial roof around the forecourt. No reference imagery is bundled.

- 660927473: broad blank ribbed wall, framed service entrance, continuous sheet roof. Association to the photographed warehouse is provisional; dimensions and unseen sides estimated.
- 660927475: two-storey plaster/timber house, separate lower eave and framed glazing. Photo supports the house style; exact association and window spacing provisional.
- 660927476: secondary two-storey house. Footprint-based interpretation; its facade is not independently verified.
- 671938230: one-storey long hall, repeated glazed bays and supported porch eaves. Form informed by the low commercial frontage; exact elevations estimated.

This is an architectural study, not a measured or current-date replica. The nine smaller western/rear buildings in x (-160,30), z (-330,-230) were subsequently modeled in the separate junction-rear update; see ogimachi-junction-rear.md for coverage and remaining reference uncertainty.

Generator: scripts/blender/build-ogimachi-junction.py. Editable: assets/authored/ogimachi/north-junction.blend. Runtime: public/models/ogimachi/junction.glb. After Blender export run `node scripts/optimize-act1-sides.mjs public/models/ogimachi/junction.glb`. Preview: ?view=detail → 북쪽 교차로 건물.
