"""Render selected clips from an uncompressed production character GLB.

This is a visual regression helper for checking skinning after swapping the
character mesh while retaining the game's animation set.

Usage:
  Blender --background --factory-startup \
    --python scripts/blender/render-character-clips.py -- \
    /tmp/mio-preview.glb /tmp/mio-clip-preview
"""

from __future__ import annotations

import sys
from pathlib import Path

import bpy
from mathutils import Vector


argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(argv) != 2:
    raise SystemExit("usage: render-character-clips.py -- character.glb output-dir")

source = Path(argv[0]).expanduser().resolve()
output = Path(argv[1]).expanduser().resolve()
output.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))

armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
mesh = max(
    (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
    key=lambda obj: len(obj.data.vertices),
)
for obj in tuple(bpy.context.scene.objects):
    if obj.type == "MESH" and obj != mesh:
        bpy.data.objects.remove(obj, do_unlink=True)


def bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    low = Vector(min(point[axis] for point in points) for axis in range(3))
    high = Vector(max(point[axis] for point in points) for axis in range(3))
    return low, high


def look_at(obj: bpy.types.Object, point: Vector) -> None:
    obj.rotation_euler = (point - obj.location).to_track_quat("-Z", "Y").to_euler()


scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 640
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("PreviewWorld")
scene.world.color = (0.018, 0.023, 0.035)

low, high = bounds(mesh)
height = high.z - low.z
center = Vector((0, 0, (low.z + high.z) * 0.5))

camera_data = bpy.data.cameras.new("PreviewCamera")
camera = bpy.data.objects.new("PreviewCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = height * 1.32

for name, energy, location, size in (
    ("Key", 900, (height * 2.0, -height * 1.4, high.z * 1.35), height * 1.2),
    ("Fill", 550, (height * 0.5, height * 1.8, high.z * 0.9), height * 1.4),
    ("Rim", 700, (-height * 1.7, -height * 0.4, high.z * 1.45), height * 0.9),
):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    lamp = bpy.data.objects.new(name, data)
    scene.collection.objects.link(lamp)
    lamp.location = location
    look_at(lamp, center)

floor_mat = bpy.data.materials.new("PreviewFloor")
floor_mat.diffuse_color = (0.035, 0.045, 0.065, 1)
bpy.ops.mesh.primitive_plane_add(size=height * 6, location=(0, 0, low.z - 0.004))
floor = bpy.context.object
floor.data.materials.append(floor_mat)

actions = {action.name: action for action in bpy.data.actions}
samples = {
    "idle": 0.22,
    "walk": 0.24,
    "run": 0.26,
    "jump": 0.52,
    "sword_combo": 0.36,
}

animation = armature.animation_data_create()
animation.use_nla = False
for clip, phase in samples.items():
    action = actions[clip]
    animation.action = action
    start, end = action.frame_range
    scene.frame_set(round(start + (end - start) * phase))
    bpy.context.view_layer.update()

    for view, x in (("front", height * 3.0), ("back", -height * 3.0)):
        camera.location = (x, 0, center.z)
        look_at(camera, center)
        scene.render.filepath = str(output / f"{clip}-{view}.png")
        bpy.ops.render.render(write_still=True)

print(f"OUTPUT {output}")
