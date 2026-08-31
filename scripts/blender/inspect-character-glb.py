"""Print rig, mesh, material, and bounds diagnostics for a character GLB.

Usage:
  blender --background --python scripts/blender/inspect-character-glb.py -- file.glb
"""

import sys
from pathlib import Path

import bpy
from mathutils import Vector


argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: inspect-character-glb.py -- file.glb")

source = Path(argv[0]).expanduser().resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]

world_points = []
for obj in meshes:
    world_points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)

if world_points:
    mins = Vector((min(p.x for p in world_points), min(p.y for p in world_points), min(p.z for p in world_points)))
    maxs = Vector((max(p.x for p in world_points), max(p.y for p in world_points), max(p.z for p in world_points)))
    size = maxs - mins
    print("BOUNDS_MIN", *(round(v, 5) for v in mins))
    print("BOUNDS_MAX", *(round(v, 5) for v in maxs))
    print("BOUNDS_SIZE", *(round(v, 5) for v in size))

print("SOURCE", source)
print("OBJECTS", len(bpy.context.scene.objects))
print("MESHES", len(meshes))
print("VERTICES", sum(len(o.data.vertices) for o in meshes))
print("POLYGONS", sum(len(o.data.polygons) for o in meshes))
for obj in meshes:
    modifiers = [m.type for m in obj.modifiers]
    groups = [g.name for g in obj.vertex_groups]
    mats = [m.name for m in obj.data.materials if m]
    print("MESH", obj.name, "verts", len(obj.data.vertices), "polys", len(obj.data.polygons), "mods", modifiers)
    print("  GROUPS", ",".join(groups[:60]))
    print("  MATERIALS", ",".join(mats))

print("ARMATURES", len(armatures))
for arm in armatures:
    bones = [b.name for b in arm.data.bones]
    print("ARMATURE", arm.name, "bones", len(bones))
    print("  BONES", ",".join(bones))

actions = list(bpy.data.actions)
print("ACTIONS", len(actions))
for action in actions:
    print("ACTION", action.name, "frames", tuple(round(v, 3) for v in action.frame_range))

images = list(bpy.data.images)
print("IMAGES", len(images))
for image in images:
    print("IMAGE", image.name, image.size[0], image.size[1], image.file_format)
