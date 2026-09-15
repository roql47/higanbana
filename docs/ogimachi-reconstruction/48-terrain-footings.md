# Terrain-fitted footing infill

The ideal pad height is level but the rendered terrain uses a 4 m grid in the village. Interpolated triangles can fall below wall corners. Added stone perimeter infill reaching 12 cm below rendered terrain, sampled at <=35 cm intervals. Tops remain 2.5 cm below building floor origin. Irori restaurant/shop use authored wall-size ratios rather than eave widths; other standard models use approximate wall ratios. Buildings already grounded omit the extra mesh. Individual perimeters are merged into one mesh.

Scope: SurveyWorld detail/walk buildings; custom onsen and Act1 frontage assets excluded, as their foundations are authored separately. Layout-study scene and Blender comparison render are not changed. This fills visible gaps without changing terrain or walking collision.

Verified restaurant corner visually in browser. Tests cover rotated sloping terrain and already grounded omission. Typecheck and Ogimachi production build passed. Not every building corner has received manual visual inspection; nonrectangular/custom footprints may need individually authored foundations.
