"""Build a tiny reusable low-poly retaining-stone kit for Higasato.

The runtime instances these three modules around selected terrain shelves.  The
asset deliberately has one material, no textures and no collision mesh.

Blender --background --python scripts/blender/build-terrain-retaining-stones.py
"""
from pathlib import Path
import random

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
AUTHORED = ROOT / "assets" / "authored" / "terrain-retaining-stones"
PUBLIC = ROOT / "public" / "models" / "terrain"
AUTHORED.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)


def stone_material():
    material = bpy.data.materials.new("Weathered mountain stone")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (0.205, 0.184, 0.157, 1.0)
    shader.inputs["Roughness"].default_value = 0.94
    shader.inputs["Metallic"].default_value = 0.0
    return material


def make_stone(name, dimensions, seed, bevel):
    """Make a low-poly block whose long axis is Blender X / runtime X."""
    rng = random.Random(seed)
    length, depth, height = dimensions
    hx, hy, hz = length * 0.5, depth * 0.5, height * 0.5

    # An octagonal rectangular footprint reads as chipped fieldstone instead of
    # a modern brick. Three independently perturbed rings add broad low-poly
    # facets while preserving a flat enough underside for stacked courses.
    corner = min(length, depth) * 0.20
    outline = [
        (-hx + corner, -hy), (hx - corner, -hy),
        (hx, -hy + corner), (hx, hy - corner),
        (hx - corner, hy), (-hx + corner, hy),
        (-hx, hy - corner), (-hx, -hy + corner),
    ]
    vertices = []
    for ring, (z, spread, jitter) in enumerate([
        (-hz, 0.91, 0.012), (0.0, 1.03, 0.035), (hz, 0.88, 0.028),
    ]):
        for i, (x, y) in enumerate(outline):
            # Opposing corners do not mirror exactly; each module keeps a
            # different hand-broken silhouette from every viewing angle.
            jx = rng.uniform(-jitter, jitter)
            jy = rng.uniform(-jitter, jitter)
            jz = 0.0 if ring == 0 else rng.uniform(-height * 0.045, height * 0.045)
            vertices.append((x * spread + jx, y * spread + jy, z + jz))

    faces = []
    for ring in range(2):
        a = ring * 8
        b = (ring + 1) * 8
        for i in range(8):
            j = (i + 1) % 8
            faces.append((a + i, a + j, b + j, b + i))
    faces.append(tuple(reversed(range(8))))
    faces.append(tuple(range(16, 24)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    modifier = obj.modifiers.new("Hand-chipped edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 1
    modifier.affect = "EDGES"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    # Flat faces are intentional: they catch lantern light without requiring a
    # normal map, while the single bevel prevents a primitive-box appearance.
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    obj.data.materials.append(STONE_MATERIAL)
    return obj


STONE_MATERIAL = stone_material()
STONES = [
    make_stone("Retaining stone A 100cm", (1.00, 0.48, 0.36), 1701, 0.055),
    make_stone("Retaining stone B 82cm", (0.82, 0.54, 0.42), 1702, 0.060),
    make_stone("Retaining stone C 116cm", (1.16, 0.44, 0.31), 1703, 0.050),
]

# All exported module origins remain at (0, 0, 0).  Three.js supplies the final
# translation, rotation and scale per instance after sampling the live terrain.
bpy.ops.object.select_all(action="DESELECT")
for stone in STONES:
    stone.select_set(True)
bpy.context.view_layer.objects.active = STONES[0]
bpy.ops.export_scene.gltf(
    filepath=str(PUBLIC / "retaining-stones.glb"),
    export_format="GLB",
    export_yup=True,
    use_selection=True,
    export_apply=True,
)

# Keep an editable source arranged like a mason's sample board, then render a
# small studio proof that can be checked without launching the game browser.
for stone, x in zip(STONES, (-1.25, 0.0, 1.25)):
    stone.location.x = x
    stone.location.z = stone.dimensions.z * 0.5

bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -0.015))
floor = bpy.context.object
floor.name = "Preview floor only (not exported)"
floor.data.materials.append(STONE_MATERIAL)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 520
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world = bpy.data.worlds.new("Night studio")
scene.world.color = (0.018, 0.022, 0.028)

for location, energy, size, color in [
    ((-2.2, -2.8, 3.6), 620, 3.0, (1.0, 0.67, 0.38)),
    ((2.6, -0.5, 2.3), 380, 2.5, (0.38, 0.52, 0.78)),
    ((0.0, 2.7, 3.5), 480, 2.0, (0.66, 0.73, 0.82)),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    light.rotation_euler = (Vector((0, 0, 0.28)) - light.location).to_track_quat("-Z", "Y").to_euler()

bpy.ops.object.camera_add(location=(3.7, -5.4, 2.75))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0.25)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 4.5
scene.camera = camera

scene.render.filepath = str(AUTHORED / "preview.png")
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(AUTHORED / "retaining-stones.blend"))

print("RETAINING_STONES_GLB", PUBLIC / "retaining-stones.glb")
print("RETAINING_STONES_PREVIEW", AUTHORED / "preview.png")
