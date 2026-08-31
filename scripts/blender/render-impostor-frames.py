"""Render one static GLB into transparent, orthographic impostor views.

The first frame looks at the source model from +X. The game rotates Tripo's
+X forward axis to +Z, so frame zero then matches an instance whose local +Z
points at the camera. Remaining frames advance counter-clockwise around Z.

Usage:
  Blender --background --factory-startup \
    --python scripts/blender/render-impostor-frames.py -- model.glb output-dir \
      [--frames N] [--res WxH] [--face-widest]

`--frames 1` bakes a single card instead of a rotation atlas — right for foliage
sprays and bark strips, where the game crosses static cards rather than turning
one toward the camera. `--face-widest` starts the orbit on the model's *thin*
horizontal axis so a flat object (a leaf spray) is photographed face-on rather
than edge-on; radially symmetric models (the cedars) must leave it off, because
their frame order is pinned to Tripo's +X convention.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []

# 값을 받는 플래그는 그 다음 인자를 함께 먹어야 한다 — 안 그러면 "1" 이나 "256x1024" 가
# 위치 인자로 새어 들어가 사용법 오류가 난다
VALUE_FLAGS = {"--frames", "--res"}
options: dict[str, str] = {}
positional: list[str] = []
index = 0
while index < len(argv):
    token = argv[index]
    if token in VALUE_FLAGS:
        if index + 1 >= len(argv):
            raise SystemExit(f"{token} needs a value")
        options[token] = argv[index + 1]
        index += 2
        continue
    if token.startswith("--"):
        options[token] = "true"
        index += 1
        continue
    positional.append(token)
    index += 1

if len(positional) != 2:
    raise SystemExit(
        "usage: render-impostor-frames.py -- model.glb output-dir "
        "[--frames N] [--res WxH] [--face-widest]"
    )

frame_count = max(1, int(options.get("--frames", "8")))
res_x, res_y = (int(v) for v in options.get("--res", "512x1024").lower().split("x"))
face_widest = "--face-widest" in options

source = Path(positional[0]).expanduser().resolve()
output = Path(positional[1]).expanduser().resolve()
output.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise SystemExit(f"no mesh found in {source}")


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def look_at(obj: bpy.types.Object, point: Vector) -> None:
    obj.rotation_euler = (point - obj.location).to_track_quat("-Z", "Y").to_euler()


low, high = world_bounds(meshes)
size = high - low
height = size.z
if height <= 1e-5:
    raise SystemExit(f"invalid model height for {source}: {height}")

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = res_x
scene.render.resolution_y = res_y
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
scene.render.image_settings.compression = 18
scene.render.film_transparent = True
scene.render.use_file_extension = True
scene.render.image_settings.color_mode = "RGBA"
scene.display.shading.light = "STUDIO"
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass

# Four broad, balanced lights retain the model's texture and branch volume
# without baking a strong world-space highlight into the rotating impostor.
center_xy = Vector(((low.x + high.x) * 0.5, (low.y + high.y) * 0.5, 0))
target = Vector((center_xy.x, center_xy.y, low.z + height * 0.52))
for index, (direction, energy) in enumerate((
    ((1.0, 0.0, 1.15), 520.0),
    ((-1.0, 0.0, 1.10), 420.0),
    ((0.0, 1.0, 1.05), 460.0),
    ((0.0, -1.0, 1.20), 460.0),
)):
    data = bpy.data.lights.new(f"ImpostorSoftbox{index}", "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = height * 1.8
    lamp = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(lamp)
    lamp.location = target + Vector(direction) * height * 2.1
    look_at(lamp, target)

world = bpy.data.worlds.new("ImpostorWorld")
world.use_nodes = True
background = world.node_tree.nodes.get("Background")
if background:
    background.inputs["Color"].default_value = (0.025, 0.035, 0.03, 1.0)
    background.inputs["Strength"].default_value = 0.12
scene.world = world

camera_data = bpy.data.cameras.new("ImpostorCamera")
camera = bpy.data.objects.new("ImpostorCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"

# Keep the model exactly on the bottom edge and reserve four percent above it
# for mip-safe alpha. The horizontal room is whatever the output aspect gives,
# so a 1:2 card behaves as before and a square card no longer over-crops.
aspect = res_x / res_y
capture_height = height * 1.04
radial_diameter = max(size.x, size.y)
if radial_diameter > capture_height * aspect * 0.98:
    capture_height = radial_diameter / (aspect * 0.98)
camera.data.ortho_scale = capture_height
camera.data.lens = 50
camera.data.clip_start = max(0.001, height * 0.01)
camera.data.clip_end = height * 10.0
look_target = Vector((center_xy.x, center_xy.y, low.z + capture_height * 0.5))
radius = height * 3.2

# A flat spray photographed from +X would come out edge-on. Start the orbit a
# quarter turn over when the model is widest along X, so the camera looks at the
# broad face. Symmetric models keep start_angle 0 and their frame order intact.
start_angle = math.pi / 2 if face_widest and size.x > size.y else 0.0

for frame in range(frame_count):
    angle = start_angle + frame * math.tau / frame_count
    camera.location = Vector((
        center_xy.x + math.cos(angle) * radius,
        center_xy.y + math.sin(angle) * radius,
        look_target.z,
    ))
    look_at(camera, look_target)
    scene.render.filepath = str(output / f"frame-{frame:02d}.png")
    bpy.ops.render.render(write_still=True)

print(
    "IMPOSTOR",
    source.name,
    f"bounds={size.x:.4f}x{size.y:.4f}x{size.z:.4f}",
    f"capture_height={capture_height:.4f}",
    f"frames={frame_count}",
    f"res={res_x}x{res_y}",
    f"start_angle={math.degrees(start_angle):.1f}",
    f"output={output}",
)
