# Ogimachi story integration — first playable segment

Entry: `http://127.0.0.1:5188/ogimachi.html?story=1`.
The design overview and `?play=1` free walk remain separate. The story button opens a fresh story run.

## Connected

- Original Act1, including Sayo, hand/towing behaviour, 72 m distance beats, pursuers, rain, lightning, the hand release, bell and final warnings.
- Original prologue orchestration and Act2: title, bus/photo/phone/driver sequence, terminus camera sequence and afternoon-to-evening transition.
- Original Act3: approach the stone tablet, hold E for two seconds, reveal the inscriptions, hear the name calls, answer and witness the spreading stain.
- Runtime family photo is captured from the new route using Mio and Sayo.
- Original dialogue and timing are reused. Shared module changes only narrow their terrain dependency types.

The route follows the existing R001 survey centreline, beginning at its (-59.440, -3.117) waypoint. Old `sAtZ` story markers map to route distances through a compatibility adapter; the survey terrain is never moved or flattened. The run is 72 m, with a torii farther down the route. Flowers, the tablet and terminus marker belong to story dressing.

## Scope and remaining work

This segment ends after Act3. Act4 onward, full inventory UI, continuation from save, main title integration and map-specific staging of later locations are not connected. A separate session-storage record holds act, received items and the name-answer flag for inspection; it is not a resumable game save and never overwrites the original game save.

The terminus uses a simple story marker. The new street scenery has not yet been re-authored to match every visual description of the old terminus. No changes were made here to SurveyWorld terrain, DEM, architecture, forest or the other task's massing/design preview.

Validation: application and scripts typecheck, standalone build, 137 passing tests including route-distance round trips, surveyed building-clearance checks and original Act3 completion/one-time violation on the new route. Browser confirmed Act1's 72 m run, final warnings, Act2 progression through the terminus cinematic, and arrival in Act3 with player controls restored, without console warnings/errors. The complete Act3 interaction is covered by the scripted test, not a full browser playthrough.
