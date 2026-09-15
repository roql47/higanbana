# Sayo render-pose desynchronization

The new map's PlayRender updates shadows intermittently (20 Hz). Three r185's WebGLRenderer projects main-view objects before incrementing info.render.frame; the shadow pass updates objects after that increment. WebGLObjects caches skeleton updates using that frame. Immediately after a shadow refresh, the next main pass may skip a needed skeleton update, displaying the prior pose against current object transforms. Continuous shadow updates in the original game masked this path.

Evidence:
- Actual story playback, before: 222 of 781 frames had skeleton.boneMatrices disagreeing with current bone.matrixWorld × boneInverse (threshold .001).
- After explicit synchronization, a complete 72 m Act1 run: 0 of 2,223 frames disagreed; maximum rounded to four decimals was .0000.
- tests/syncSkinnedPose.test.mjs uses the installed Three WebGLObjects implementation. Intermittent shadows reproduce stale translations; continuous shadows and explicit pose sync do not.

Fix: syncSkinnedPose updates world matrices and skeleton buffers immediately before rendering, after presentation interpolation. Applied to Sayo and Mio in story mode and Mio in free walk. No change to animation clips or movement speed.

Recordings: artifacts/sayo-recording/playback.mp4 is the earlier problematic capture; fixed-playback.mp4 is the new 20-second capture. Temporary GPU pose inspection was removed after verification. Source canvas capture does not include DOM diagnostic labels.
