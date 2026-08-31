"""우물의 여자 리깅 결과를 대표 프레임으로 렌더하는 시각 회귀 도구."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy
from mathutils import Vector


argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
source = Path(argv[0] if argv else "assets/tripo/yokai-well-woman/rigged.glb").resolve()
output = Path(argv[1] if len(argv) > 1 else "/private/tmp/well-woman-clips").resolve()
output.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
mesh = max((obj for obj in bpy.context.scene.objects if obj.type == "MESH"), key=lambda obj: len(obj.data.vertices))


def look_at(obj: bpy.types.Object, point: Vector) -> None:
    obj.rotation_euler = (point - obj.location).to_track_quat("-Z", "Y").to_euler()


points = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
low = Vector(min(point[axis] for point in points) for axis in range(3))
high = Vector(max(point[axis] for point in points) for axis in range(3))
height = high.y - low.y  # glTF Y-up 모델을 Blender로 다시 읽으면 높이는 Z지만 아래에서 다시 계산한다.
height = max(high.z - low.z, height)
center = (low + high) * 0.5

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 512
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("WellPreviewWorld")
scene.world.color = (0.012, 0.018, 0.026)

camera_data = bpy.data.cameras.new("WellPreviewCamera")
camera = bpy.data.objects.new("WellPreviewCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = height * 1.18

for name, energy, location, size in (
    ("ColdKey", 700, (height * 1.6, -height * 1.8, high.z * 1.2), height * 1.2),
    ("WaterFill", 430, (-height * 1.4, -height * 0.7, high.z * 0.8), height * 1.5),
    ("Rim", 850, (0, height * 1.8, high.z * 1.35), height * 0.9),
):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = location
    look_at(light, center)

floor_mat = bpy.data.materials.new("WaterFloor")
floor_mat.diffuse_color = (0.02, 0.035, 0.05, 1)
bpy.ops.mesh.primitive_plane_add(size=height * 5, location=(0, 0, low.z - 0.004))
bpy.context.object.data.materials.append(floor_mat)

samples = [
    ("rise-start", "rise", 1),
    ("rise-mid", "rise", 24),
    ("rise-end", "rise", 46),
    ("idle", "idle", 31),
    ("wade-a", "wade", 1),
    ("wade-b", "wade", 16),
]
actions = {action.name: action for action in bpy.data.actions}
animation = armature.animation_data_create()
animation.use_nla = False
for label, clip, frame in samples:
    animation.action = actions[clip]
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    camera.location = (0, -height * 3.0, center.z)
    look_at(camera, center)
    scene.render.filepath = str(output / f"{label}.png")
    bpy.ops.render.render(write_still=True)

print("OUTPUT", output)
