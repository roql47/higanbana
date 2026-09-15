# Photo landmark alignment — Irori entrance

## Reference and interpretation
The same 612 × 500 official Irori exterior crop is embedded remotely in photoreal-align.html. The photo was inspected at full panel width; no external photo was downloaded or modified. Four door corners were manually estimated in the displayed source crop: (136,212), (294,225), (289,472), (132,490). These points have selection uncertainty. The existing 2.028 × 2.145 m door was retained as an assumed scale, not a surveyed measurement.

## Camera and geometry
- Numerical camera fit to these four corners, with level roll, gives local location (-12.7651,9.9556,1.5045), target (-4.57,-1.2282,2.2362), 91.8775 mm with a 36 mm horizontal sensor. The reference has a digital crop; this does not establish the original photographic lens.
- Existing camera is retained; a copy named Entrance pre-alignment camera preserves its prior view.
- The image-coordinate RMS is about 1.42 px for these four chosen points only. This is not a whole-image likeness score or a claim of physical accuracy.
- Once camera was fitted, front eave remained high. Its edge was lowered by 0.3435 m, eased into the front slope, retaining the ridge, rear roof and GIS root.
- Eave target guide is approximately y = 25 + .188x in source pixels. Remaining signed residuals at sampled points are approximately -6, -1, +3, +6 px; the photo edge is irregular and the line is only a guide.
- Sign moved +.32 m in local Y. Lamp positions/proportions adjusted and complete rounded cages rebuilt so oblique view does not expose bare paper sides.
- Side windows raised .25 m with lower boards extended and the upper wall/header adjusted. Door datum unchanged; exposed gap over the door filled with timber.
- Earlier simple orange interior screen/counter and visible placeholder reveal hidden.

## Files
- Before checkpoint: assets/authored/ogimachi/before-photo-alignment-v4.blend
- Editable scene: assets/authored/ogimachi/photoreal-photo-aligned-v4.blend
- Camera fit and image points: artifacts/ogimachi-phases/alignment-v4-landmarks.json
- Geometry pass: scripts/blender/align-irori-photo-v4.py
- Window/lantern pass: scripts/blender/finish-irori-alignment-v4.py
- Fixed-camera tests: alignment-v4-camera-test.png, alignment-v4-geometry-test.png
- Final: artifacts/ogimachi-phases/alignment-v4-final.png (1530 × 1250, 96 samples)
- Comparison: photoreal-compare.html; overlay with opacity/grid and before/after selector: photoreal-align.html

## Remaining work
Sign outline/calligraphy, organic root sculpture, ceramic shape, garden density, reflection environment and exact material weathering are still different from the original. This is a Blender entrance study, not a complete village reconstruction. No runtime game GLB or Steam package was updated. Saved library metadata and packed image status may be checked in the current process; no full separate-process reopen is claimed.
