# Irori sliding entrance and interior — 2026-09-12

Blender-authored interior and separately movable entrance leaves are integrated into SurveyWorld. The walking preview (`ogimachi.html?play=1&spawn=irori`) supports E/button toggling and physical entry/exit. The comparison page remains the exterior still comparison. Story-act interactions and the Steam package have not been rebuilt for this feature.

## Authoring and materials

Editable source: `assets/authored/ogimachi/irori-interior-v1.blend`; pre-edit backup: `pre-irori-interior-v1.blend`. Authoring script: `scripts/blender/build-irori-interior-v1.py`. Existing entrance frame components were extracted rather than overlaying a second doorway. Interior contains wood flooring, ceiling beams, plaster walls, a raised tatami seating area, low tables and cushions, dining tables/chairs, reception counter and pendant fixtures.

Runtime: `public/models/ogimachi/irori-restaurant-interior-v1.glb`. Color, roughness and tangent-space normal maps are baked, with WebP textures up to 2048 pixels (doors/sign 1024). Glass remains a transmissive material. There are 21 textures, four moving leaf/glass nodes, 19 collision proxies and four non-shadow-casting interior light anchors. Export and optimization preserve custom node metadata; pruning empty nodes would remove colliders and lights.

## Interaction and terrain

Doors slide laterally with smooth interpolation. Closing is rejected when the player occupies the aperture and reverses if they move into it during closing. The door collider unlocks near full opening and does not reappear until fully closed. Floor, walls and furniture use the existing Rapier controller. A shared mesh/collider threshold ramp connects the surveyed ground to the interior floor. Interior terrain and overlapping ground overlays are clipped to avoid terrain penetrating the floor; external terrain remains intact.

## Reference limits

The official site https://www.shirakawagou.jp/ supplies exterior reference. Tourism descriptions report table/tatami seating, but no measured interior plan or verified interior photograph was obtained. This is a playable interpretation, not a claim of exact reproduction of the restaurant interior.

## Verification

Browser: four leaf nodes loaded; button opens and closes the actual entrance; interior and floor inspected after terrain correction. Automated production-controller test walks against the closed door, opens and enters, exercises closing guard, and exits without sinking. Rotated terrain-cut test checks exterior area preservation, hole exclusion and RGBA interpolation. Type checking and Ogimachi production build pass. Full regression suite results recorded in the task response.
