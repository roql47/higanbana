# Camera clearance follow-up — 2026-09-12

The normal third-person camera previously damped inward after detecting a wall, leaving it beyond the safe cast distance for several frames. Its minimum collision distance could also override a closer obstruction. Clamp the spring arm immediately to the shape-cast clearance (including the existing 5 cm margin); preserve damped outward recovery.

Six real Rapier regression cases cover walls 0.5 m and 1.4 m behind the target at 30/60/120 FPS. They assert the camera sphere remains on the player side of the wall on the first frame and recovers gradually after wall removal. All passed, together with eight existing main-street, side-lane and earth-boundary checks (14 total). Type checking and the Ogimachi production build passed.

This is a normal spring-arm correction. It does not certify cinematic overrides, pivots already inside geometry, every building's visual/collision alignment, or all village alleys. The existing side-lane tests use surveyed road paths on a synthetic slope; the main-street test uses the actual DEM. No Steam package was rebuilt.
