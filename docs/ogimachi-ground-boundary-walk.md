# Four-sided earth boundary checks

Expanded `legacyGroundWalk.test.mjs` from one east-edge route to east, west, north and south crossings, each out and back with the production CharacterController and Rapier collision mesh. Assertions require actual crossing, no missing ground hit, no sinking beyond tolerance and return without jumping. All four routes pass; the existing two mapped side-lane checks and three boundary/yard checks also pass (nine total).

These tests use the production earth mesh builder and collision/controller code on a synthetic gentle slope. They do not include all live building obstacles, the complete DEM terrain or a manual walking session. No new runtime change was necessary for the tested boundary cases. No FPS estimate or full-map completion is claimed.
