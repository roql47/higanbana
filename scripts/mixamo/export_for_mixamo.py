"""
Tripo GLB → Mixamo 업로드용 FBX/OBJ (Blender 헤드리스)
  Blender -b --python scripts/mixamo/export_for_mixamo.py

리깅된 GLB 의 본 위치로 캐릭터의 실제 정면/좌우 축을 계산해 자동 정렬한다.
Mixamo 요구: FBX 에서 정면 +Z, 위 +Y, 사람 크기(cm), 단일 메시, 아마추어 없음.
"""
import bpy, os, math
from mathutils import Vector, Matrix

RIGGED = "/Users/jay/Claude/3D_motion/assets/tripo/final/rig/model_url.glb"  # mixamorig 본 이름
OUT_DIR = "/Users/jay/Claude/3D_motion/assets/mixamo"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=RIGGED)

arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
def bone_world(name):
    for b in arm.data.bones:
        if b.name.endswith(name):
            return arm.matrix_world @ b.head_local
    return None

hips = bone_world("Hips"); lfoot = bone_world("LeftFoot"); rfoot = bone_world("RightFoot")
ltoe = bone_world("LeftToeBase") or bone_world("LeftToe_End"); head = bone_world("Head")
print("BONES", [b.name for b in arm.data.bones][:6])
# 좌우축 = 오른발 → 왼발, 정면 = 발목 → 발가락 (수평 성분)
left = (lfoot - rfoot); left.z = 0; left.normalize()
fwd = (ltoe - lfoot); fwd.z = 0
if fwd.length < 1e-4:  # 발가락 본이 없으면 좌우축의 수직 벡터 사용
    fwd = Vector((-left.y, left.x, 0))
fwd.normalize()
print("AXES left=%s fwd=%s" % ([round(v,2) for v in left], [round(v,2) for v in fwd]))

# 메시만 남기고 정렬: 정면 → +Y (FBX 변환 후 +Z), 좌우 → 왼쪽이 +X
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in bpy.context.scene.objects: o.select_set(False)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
obj.name = "Traveler"
obj.parent = None
for m in list(obj.modifiers): obj.modifiers.remove(m)   # 아마추어 모디파이어 제거
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
# 정점 그룹(스킨 웨이트) 제거 — Mixamo 가 새로 리깅
obj.vertex_groups.clear()

# 회전 행렬: (left, fwd, up) → (+X, +Y, +Z)
up = Vector((0, 0, 1))
R = Matrix((left, fwd, up)).transposed().inverted()
obj.matrix_world = R.to_4x4() @ obj.matrix_world
bpy.ops.object.transform_apply(rotation=True)

# 메시 정리
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.quads_convert_to_tris(quad_method='BEAUTY', ngon_method='BEAUTY')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
obj.data.materials.clear()

# 크기·위치: 키 170(cm), 발바닥 원점
vs = [v.co for v in obj.data.vertices]
h = max(v.z for v in vs) - min(v.z for v in vs)
obj.scale = (170.0 / h,) * 3
bpy.ops.object.transform_apply(scale=True)
vs = [v.co for v in obj.data.vertices]
obj.location = (-(max(v.x for v in vs) + min(v.x for v in vs)) / 2,
                -(max(v.y for v in vs) + min(v.y for v in vs)) / 2,
                -min(v.z for v in vs))
bpy.ops.object.transform_apply(location=True)
vs = [v.co for v in obj.data.vertices]
print("SIZE armspan(X)=%.1f depth(Y)=%.1f height(Z)=%.1f verts=%d tris=%d" % (
    max(v.x for v in vs)-min(v.x for v in vs), max(v.y for v in vs)-min(v.y for v in vs),
    max(v.z for v in vs)-min(v.z for v in vs), len(obj.data.vertices), len(obj.data.polygons)))

fbx = os.path.join(OUT_DIR, "traveler_mixamo.fbx")
bpy.ops.export_scene.fbx(filepath=fbx, use_selection=False, apply_unit_scale=True,
                         global_scale=1.0, apply_scale_options='FBX_SCALE_NONE',
                         axis_forward='-Z', axis_up='Y', object_types={'MESH'},
                         use_mesh_modifiers=True, mesh_smooth_type='FACE',
                         path_mode='STRIP', embed_textures=False, bake_anim=False)
objp = os.path.join(OUT_DIR, "traveler_mixamo.obj")
bpy.ops.wm.obj_export(filepath=objp, export_selected_objects=False, export_materials=False,
                      forward_axis='NEGATIVE_Z', up_axis='Y', apply_modifiers=True)
print("EXPORTED", fbx, objp)
