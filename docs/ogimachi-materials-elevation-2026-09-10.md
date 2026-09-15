# Ogimachi buildings, materials and relative elevation

Reference: https://whc-shirakawa-goandgokayama.jp/en/three_villages/ogimachi/

This pass develops the existing independent Ogimachi preview. The 162 main-house and 139 annex positions remain unchanged. It does not migrate the story, collision, navigation or Steam package to this map.

## Buildings and surfaces

- Local Blender MCP produced a new closed, curved thatch roof with a thick reed pack, irregular eaves and aligned UVs. Tile roofs now have raised channels and overlapping courses.
- Existing cedar, mud-plaster and stone albedo/normal assets replace the previous synthetic wood stripes and flat plaster/foundation colors. Glazing is more muted.
- Five main archetypes: farmhouse, farmhouse-shutters, merchant, merchant-boarded and storehouse. The extra farmhouse has paired attic windows and open shutters; the extra merchant house has more timber infill and storm shutters. These are authored variations, not individually identified real buildings.
- Three low outbuilding archetypes were re-exported using the same updated materials. Material-level instancing and shared embedded textures remain in use.
- Main GLB: `public/models/ogimachi/village-library.glb` (9,808,416 bytes). Annex GLB: `public/models/ogimachi/outbuildings.glb` (1,311,228 bytes). Editable scenes are in `assets/authored/ogimachi/`.
- Ground has a grass normal map. Generated gravel is used for small lanes, yards and exposed lower riverbanks; the main road keeps a finer surface. Parcel soil variation, less reflective water, earth bunds and exposed stone yard edges separate surface types.

## Relative elevation

`src/world/ogimachi/elevation.ts` is the shared height authority. The village terrace gently tilts north–south and rises toward the eastern foothills. House footprints are level; annexes share their parent house elevation. Each irrigation parcel has a single level, including fragments created by clipping buildings and lanes out of it.

Roads are sampled and graded with limits of 6.5% for wide roads and 10% for smaller paths. These are reconstruction constraints, not measured real-world slopes. Road shoulders blend into the ground. Water height follows the channel, and bridge decks do not fill in the channel beneath them. The fine central terrain uses four-metre grid cells; outer mountain tiles use twenty-metre cells. Fine boundary vertices interpolate the adjacent coarse edge, and gravel overlays sample the rendered terrain triangles.

## Generated texture provenance

Both assets were generated using the built-in image generation tool, not the CLI or a remote photo download. Their normals/bump are approximations, not scanned displacement. Original generated files remain in the Codex generated-images directory. Gravel was converted to WebP using Sharp for delivery, without creative edits.

### Aligned kaya thatch

Project asset: `public/textures/ogimachi/kaya-aligned-v2.png`.

Prompt:

> Use case: photorealistic-natural. Asset type: square seamless tileable diffuse albedo texture for a real-time 3D Japanese gassho-zukuri farmhouse roof. Make a close perpendicular orthographic surface scan of densely packed aged kaya reed thatch, NOT a picture of a building. Entire frame is the same material. Hundreds of thin short weathered reed stems lie tightly aligned vertically, with subtly uneven overlapping ends, dark brown-grey exposed aged fibres and occasional dull straw tan ends. A compact compressed roof surface, not loose hay, not forest debris. Fine irregular layering and natural granular fibre detail; no large bands or obvious repeating bundle stripes. Flat diffuse overcast illumination suitable for albedo, no baked directional shadows, no perspective, no roof silhouette, no border, no labels, no moss patches. Uniform overall mid brown-grey value across the image, high tactile microdetail. Edges should tile seamlessly in both directions. 1024x1024 square texture.

### Packed earth and gravel

Project source: `assets/authored/ogimachi/packed-gravel-source.png`. Runtime asset: `public/textures/ogimachi/packed-gravel.webp`.

Prompt:

> Use case: photorealistic-natural. Create a single square seamless tileable PBR diffuse albedo texture, perpendicular orthographic material scan, of a compact weathered rural Japanese village path: densely compacted grey-brown earth and fine irregular gravel, small rounded grey river pebbles 3–20 mm, scattered sparse tan grit, no grass, no foliage, no bricks, no footprints, no buildings, no directional shadows, no gradients, no labels. Muted neutral grey-taupe, natural variation in pebble sizes but no large stones, no coarse repeated bands. Flat overcast diffuse light, even exposure across the full tile. Every pixel is ground material, realistic fine surface detail for real-time 3D close viewing, approximately 1 metre square patch. Edges should tile seamlessly. 1024x1024.

## Validation and limits

All 117 repository tests pass, including footprint/road separation, river beds below water, level house pads, parcel levels, road grade limits, GLB root isolation and exported albedo/normal maps. TypeScript checks and the standalone production build pass. The build reports the existing large JavaScript chunk advisory; this is not a shipped-game performance benchmark.

Browser inspection covered the farmhouse close view, street, foothill and river crossing. It revealed an over-bright water reflection and lower-bank overlay intersections, which were corrected. `ogimachi.html` now includes a foothill view button. The result still has simplified river outlines, instanced forest billboards and repeated archetypes. Surveyed elevations, bespoke identification of every house and reference-level photogrammetric fidelity are not claimed.
