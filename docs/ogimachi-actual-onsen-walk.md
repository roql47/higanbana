# Actual-site onsen entry check

Added `tests/actualOnsenWalk.test.mjs`. Uses real survey/story selection, DEM, production SurveyWorld height sampling and 4m terrain triangulation at the onsen location, current building collision proxies, production foyer/ramp generation, door state machine and CharacterController/Rapier.

The player approaches from local (-11,14), stops at the closed entrance within interaction range, opens the doors, walks into the foyer, and returns outside through the same doorway without jumping. Ground hit and sinking checks run every simulation step. No runtime fix was needed for this route.

The automated test stubs browser canvas and GLB loading while retaining the production floor/ramp geometry. Visual shell and authored leaf geometry are covered separately by existing GLB/door tests. This is not a new manual browser walkthrough or verification of every approach angle, room or adjacent yard overlay.

## Browser follow-up (2026-09-12)

Manually controlled Mio in the in-app browser using a fixed build snapshot on port 5190. Used the onsen shortcut, opened the sliding doors, walked across the threshold to the back of the foyer, and returned outside. The observed route did not snag at the threshold or have its camera obscured by a wall. Also sampled forward walking from the village start; this does not certify every narrow alley or the full village.

The first production-preview load failed because the build asset allowlist omitted five frontage/junction GLBs and the act1 streetscape textures. Added these explicit dependencies to vite.ogimachi.config.ts. After supplying these assets the browser walkthrough completed. Type checking, production build and seven onsen collision/door/walk tests passed. Verified all fifteen added build files match their public sources byte for byte. No Steam package was rebuilt.
