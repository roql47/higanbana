"""우물의 여자 리깅 + 게임용 애니메이션 생성.

사용:
  Blender --background --factory-startup --python scripts/blender/rig-well-woman.py
  node scripts/optimize-glb.ts \
    --in assets/tripo/yokai-well-woman/rigged.glb \
    --out public/models/yokai-well-woman.glb --tex 1536

입력 모델은 Tripo 단일 메시지만 있고 600개가 넘는 연결 조각으로 나뉘어 있다. Blender 자동
웨이트는 이런 머리카락·소매 섬에서 실패하므로 높이, 좌우 위치, 베이스컬러 휘도와 연결 성분을
함께 써서 결정적으로 웨이트한다. 본/클립 이름은 ``src/ai/wellWoman.ts``의 계약이다.
"""

from __future__ import annotations

import math
import os

import bpy
import numpy as np


ROOT = "/Users/jay/Claude/3D_motion"
SRC = os.path.join(ROOT, "assets/tripo/yokai-well-woman/source.glb")
OUT = os.path.join(ROOT, "assets/tripo/yokai-well-woman/rigged.glb")
FPS = 30


def smoothstep(a: float, b: float, value: np.ndarray) -> np.ndarray:
    t = np.clip((value - a) / max(1e-8, b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = max((obj for obj in bpy.data.objects if obj.type == "MESH"), key=lambda obj: len(obj.data.vertices))
mesh.name = "WellWoman"
data = mesh.data
n = len(data.vertices)

coords = np.empty(n * 3, dtype=np.float64)
data.vertices.foreach_get("co", coords)
coords = coords.reshape((-1, 3))
x, y, z = coords[:, 0], coords[:, 1], coords[:, 2]
print("BOUNDS", coords.min(axis=0), coords.max(axis=0), "verts", n, "polys", len(data.polygons))

# 연결 성분 — 머리카락 한 가닥 전체를 같은 체인으로 보내 소매 얼룩과 혼동하지 않는다.
parent = np.arange(n, dtype=np.int64)


def find(index: int) -> int:
    while parent[index] != index:
        parent[index] = parent[parent[index]]
        index = int(parent[index])
    return index


edge_vertices = np.empty(len(data.edges) * 2, dtype=np.int64)
data.edges.foreach_get("vertices", edge_vertices)
edge_vertices = edge_vertices.reshape((-1, 2))
for a, b in edge_vertices:
    ra, rb = find(int(a)), find(int(b))
    if ra != rb:
        parent[ra] = rb
roots = np.array([find(i) for i in range(n)], dtype=np.int64)
components = np.unique(roots)
print("COMPONENTS", len(components))

# 베이스컬러 휘도. 검은 머리는 흰 기모노/피부와 명확히 갈려 성분 분류에 안정적이다.
loop_vertex = np.empty(len(data.loops), dtype=np.int64)
data.loops.foreach_get("vertex_index", loop_vertex)
loop_uv = np.empty(len(data.uv_layers.active.data) * 2, dtype=np.float64)
data.uv_layers.active.data.foreach_get("uv", loop_uv)
loop_uv = loop_uv.reshape((-1, 2))
uv_sum = np.zeros((n, 2), dtype=np.float64)
uv_count = np.zeros(n, dtype=np.float64)
np.add.at(uv_sum, loop_vertex, loop_uv)
np.add.at(uv_count, loop_vertex, 1.0)
uv = uv_sum / np.maximum(1.0, uv_count)[:, None]

base_image = None
for material in data.materials:
    if not material or not material.use_nodes:
        continue
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image and node.image.colorspace_settings.name == "sRGB":
            base_image = node.image
            break
    if base_image:
        break
if base_image is None:
    raise RuntimeError("sRGB base-color texture not found")

iw, ih = base_image.size
pixels = np.empty(iw * ih * 4, dtype=np.float32)
base_image.pixels.foreach_get(pixels)
pixels = pixels.reshape((ih, iw, 4))
px = (np.mod(uv[:, 0], 1.0) * (iw - 1)).astype(np.int64)
py = (np.mod(uv[:, 1], 1.0) * (ih - 1)).astype(np.int64)
rgb = pixels[py, px, :3]
luminance = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# Z-up Blender 좌표. 정면은 -Y이고 glTF 내보내기 뒤에는 게임의 +Z 정면이 된다.
bones = [
    ("Root", (0, 0, 0.015), (0, 0, 0.14), None),
    ("Hips", (0, 0, 0.14), (0, 0, 0.45), "Root"),
    ("Spine", (0, 0, 0.45), (0, 0, 0.60), "Hips"),
    ("Chest", (0, 0, 0.60), (0, 0, 0.72), "Spine"),
    ("Neck", (0, 0, 0.72), (0, 0, 0.79), "Chest"),
    ("Head", (0, 0, 0.79), (0, 0, 0.96), "Neck"),
    ("UpperArm_L", (0.095, 0, 0.695), (0.205, 0, 0.615), "Chest"),
    ("ForeArm_L", (0.205, 0, 0.615), (0.255, -0.012, 0.515), "UpperArm_L"),
    ("Hand_L", (0.255, -0.012, 0.515), (0.272, -0.050, 0.430), "ForeArm_L"),
    ("UpperArm_R", (-0.095, 0, 0.695), (-0.205, 0, 0.615), "Chest"),
    ("ForeArm_R", (-0.205, 0, 0.615), (-0.255, -0.012, 0.515), "UpperArm_R"),
    ("Hand_R", (-0.255, -0.012, 0.515), (-0.272, -0.050, 0.430), "ForeArm_R"),
    # 뒤 머리와 앞의 두 가닥을 분리한다. 두 마디여야 끝이 뿌리와 같은 각도로 딱딱하게 돌지 않는다.
    ("HairBack_1", (0, 0.040, 0.90), (0, 0.055, 0.72), "Head"),
    ("HairBack_2", (0, 0.055, 0.72), (0, 0.060, 0.54), "HairBack_1"),
    ("HairFront_L1", (0.070, -0.045, 0.88), (0.085, -0.055, 0.71), "Head"),
    ("HairFront_L2", (0.085, -0.055, 0.71), (0.095, -0.055, 0.53), "HairFront_L1"),
    ("HairFront_R1", (-0.070, -0.045, 0.88), (-0.085, -0.055, 0.71), "Head"),
    ("HairFront_R2", (-0.085, -0.055, 0.71), (-0.095, -0.055, 0.53), "HairFront_R1"),
]
names = [bone[0] for bone in bones]
index_of = {name: index for index, name in enumerate(names)}

arm_data = bpy.data.armatures.new("WellWomanRig")
armature = bpy.data.objects.new("WellWomanRig", arm_data)
bpy.context.scene.collection.objects.link(armature)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.mode_set(mode="EDIT")
for name, head, tail, parent_name in bones:
    bone = arm_data.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if parent_name:
        bone.parent = arm_data.edit_bones[parent_name]
        bone.use_connect = name in {"Hips", "Spine", "Chest", "Neck", "Head", "HairBack_2", "HairFront_L2", "HairFront_R2"}
bpy.ops.object.mode_set(mode="OBJECT")

# 기본 몸통 웨이트 — 높이 중심 사이를 선형 보간해 인접 본 두 개만 사용한다.
weights = np.zeros((n, len(names)), dtype=np.float64)
chain = ["Root", "Hips", "Spine", "Chest", "Neck", "Head"]
centers = np.array([0.06, 0.31, 0.525, 0.66, 0.755, 0.885])
for vertex in range(n):
    height = z[vertex]
    if height <= centers[0]:
        weights[vertex, index_of["Root"]] = 1.0
    elif height >= centers[-1]:
        weights[vertex, index_of["Head"]] = 1.0
    else:
        upper = int(np.searchsorted(centers, height))
        lower = upper - 1
        t = (height - centers[lower]) / (centers[upper] - centers[lower])
        weights[vertex, index_of[chain[lower]]] = 1.0 - t
        weights[vertex, index_of[chain[upper]]] = t

# 소매/팔 — 몸통 접점은 Chest와 섞고, 바깥으로 갈수록 팔 체인 비중을 올린다.
abs_x = np.abs(x)
arm_amount = smoothstep(0.085, 0.18, abs_x) * smoothstep(0.27, 0.42, z) * (1.0 - smoothstep(0.72, 0.79, z))
for side, suffix in ((1, "L"), (-1, "R")):
    side_mask = ((x * side) > 0) & (arm_amount > 1e-5)
    ids = np.flatnonzero(side_mask)
    for vertex in ids:
        amount = float(arm_amount[vertex])
        weights[vertex] *= 1.0 - amount
        # 손·소매 끝으로 갈수록 아래 체인. 긴 소매는 완전 Hand 바인딩하지 않아 천 무게를 남긴다.
        reach = float(np.clip((abs_x[vertex] - 0.10) / 0.17, 0.0, 1.0))
        lower = float(np.clip((0.64 - z[vertex]) / 0.24, 0.0, 1.0))
        hand = smoothstep(0.225, 0.265, np.array([abs_x[vertex]]))[0] * smoothstep(0.39, 0.48, np.array([z[vertex]]))[0]
        fore = np.clip(0.25 + 0.55 * reach + 0.25 * lower - 0.65 * hand, 0.0, 0.9)
        upper = max(0.0, 1.0 - fore - hand)
        weights[vertex, index_of[f"UpperArm_{suffix}"]] += amount * upper
        weights[vertex, index_of[f"ForeArm_{suffix}"]] += amount * fore
        weights[vertex, index_of[f"Hand_{suffix}"]] += amount * hand

# 검은색이며 머리 꼭대기와 연결되고 허리 쪽까지 내려온 성분만 머리카락으로 인정한다.
hair_components: list[tuple[int, np.ndarray]] = []
for component in components:
    mask = roots == component
    if not np.any(mask):
        continue
    lo = coords[mask].min(axis=0)
    hi = coords[mask].max(axis=0)
    if (
        float(luminance[mask].mean()) < 0.31
        and hi[2] > 0.82
        and lo[2] < 0.80
        and hi[0] - lo[0] < 0.44
    ):
        hair_components.append((int(component), mask))

hair_vertices = 0
for _, mask in hair_components:
    ids = np.flatnonzero(mask)
    for vertex in ids:
        # 원본 머리는 서로 닿아 보이는 17개 메시 섬이다. 섬별 헤어 본을 흔들면 1~2°에서도
        # 가는 틈이 생겼다. 물에서 막 나온 **젖은 머리**는 실제로도 무겁게 얼굴에 붙으므로
        # Head에 통째로 묶는 편이 외형과 품질 모두 맞다. 보조 본은 후속 물리 실험을 위해 남긴다.
        weights[vertex] = 0.0
        weights[vertex, index_of["Head"]] = 1.0
    hair_vertices += len(ids)
print("HAIR", hair_vertices, "verts in", len(hair_components), "components")

# glTF 스킨은 정점당 상위 4본. 미세한 잔여값은 잘라 양자화 후에도 합이 안정적으로 1이 되게 한다.
order = np.argsort(-weights, axis=1)
keep = np.zeros_like(weights)
rows = np.arange(n)
for rank in range(4):
    keep[rows, order[:, rank]] = 1.0
weights *= keep
sums = weights.sum(axis=1)
sums[sums <= 1e-8] = 1.0
weights /= sums[:, None]

for name in names:
    mesh.vertex_groups.new(name=name)
for vertex in range(n):
    for bone_index in np.flatnonzero(weights[vertex] > 1e-5):
        mesh.vertex_groups[names[int(bone_index)]].add([vertex], float(weights[vertex, bone_index]), "REPLACE")

modifier = mesh.modifiers.new("WellWomanArmature", "ARMATURE")
modifier.object = armature
mesh.parent = armature


def clear_pose() -> None:
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def key_pose(frame: int, rotations: dict[str, tuple[float, float, float]], locations: dict[str, tuple[float, float, float]] | None = None) -> None:
    clear_pose()
    for name, degrees in rotations.items():
        armature.pose.bones[name].rotation_euler = tuple(math.radians(value) for value in degrees)
    for name, location in (locations or {}).items():
        armature.pose.bones[name].location = location
    for pose_bone in armature.pose.bones:
        pose_bone.keyframe_insert("rotation_euler", frame=frame, group=pose_bone.name)
        pose_bone.keyframe_insert("location", frame=frame, group=pose_bone.name)


def make_action(name: str, end: int, poses: list[tuple[int, dict[str, tuple[float, float, float]], dict[str, tuple[float, float, float]]]]) -> None:
    clear_pose()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    animation = armature.animation_data_create()
    animation.action = action
    for frame, rotations, locations in poses:
        key_pose(frame, rotations, locations)
    # Blender 5의 layered Action은 fcurves를 Action 바로 아래에 노출하지 않는다. 기본 보간이
    # Bezier라 별도 접근 없이도 부드럽고, 시작/끝 범위는 실제 키프레임에서 내보내기가 읽는다.
    animation.action = None


idle_a = {
    "Spine": (3, 0, -1.3), "Chest": (5, 0, 1.5), "Head": (-6, 0, -2),
    "UpperArm_L": (3, 0, 1), "UpperArm_R": (-3, 0, -1),
    "HairBack_1": (0.5, 0, 0.4), "HairBack_2": (1.2, 0, 0.8),
    "HairFront_L1": (0.4, 0, 0.6), "HairFront_L2": (1.0, 0, 1.2),
    "HairFront_R1": (0.5, 0, -0.4), "HairFront_R2": (1.2, 0, -0.8),
}
idle_b = {
    "Spine": (4, 0, 1.3), "Chest": (6, 0, -1.5), "Head": (-8, 0, 2),
    "UpperArm_L": (-2, 0, -1), "UpperArm_R": (2, 0, 1),
    "HairBack_1": (-0.5, 0, -0.4), "HairBack_2": (-1.2, 0, -0.8),
    "HairFront_L1": (-0.5, 0, -0.4), "HairFront_L2": (-1.0, 0, -0.8),
    "HairFront_R1": (-0.4, 0, 0.6), "HairFront_R2": (-1.0, 0, 1.2),
}
make_action("idle", 120, [(1, idle_a, {}), (31, idle_b, {"Root": (0, 0, 0.008)}), (61, idle_a, {}), (91, idle_b, {"Root": (0, 0, -0.006)}), (120, idle_a, {})])

rise_start = {
    "Hips": (18, 0, 0), "Spine": (28, 0, 0), "Chest": (34, 0, 0), "Neck": (-12, 0, 0), "Head": (-24, 0, 0),
    "UpperArm_L": (3, 0, 1), "ForeArm_L": (2, 0, 0), "UpperArm_R": (-3, 0, -1), "ForeArm_R": (-2, 0, 0),
    "HairBack_1": (-2, 0, 0), "HairBack_2": (-4, 0, 0),
    "HairFront_L1": (-1.5, 0, 0.5), "HairFront_L2": (-3, 0, 1),
    "HairFront_R1": (-1.5, 0, -0.5), "HairFront_R2": (-3, 0, -1),
}
rise_mid = {
    "Hips": (10, 0, 0), "Spine": (16, 0, 0), "Chest": (20, 0, 0), "Head": (-15, 0, 0),
    "UpperArm_L": (10, 0, 3), "UpperArm_R": (-10, 0, -3),
    "HairBack_1": (-1, 0, 0), "HairBack_2": (-2.5, 0, 0),
}
rise_end = dict(idle_a)
make_action("rise", 46, [
    (1, rise_start, {"Root": (0, 0, -0.12)}),
    (24, rise_mid, {"Root": (0, 0, -0.035)}),
    (46, rise_end, {}),
])

wade_a = {
    "Hips": (5, 0, -1), "Spine": (9, 0, -2), "Chest": (12, 0, 2), "Head": (-10, 0, -2),
    "UpperArm_L": (10, 0, 5), "ForeArm_L": (7, 0, -5), "UpperArm_R": (-4, 0, -4), "ForeArm_R": (-3, 0, 4),
    "HairBack_1": (-1.2, 0, 0.8), "HairBack_2": (-2.5, 0, 1.5),
    "HairFront_L1": (-0.8, 0, 0.8), "HairFront_L2": (-1.5, 0, 1.5),
    "HairFront_R1": (-1.0, 0, -0.4), "HairFront_R2": (-2.0, 0, -1.0),
}
wade_b = {
    "Hips": (5, 0, 1), "Spine": (9, 0, 2), "Chest": (12, 0, -2), "Head": (-10, 0, 2),
    "UpperArm_L": (4, 0, -4), "ForeArm_L": (3, 0, 4), "UpperArm_R": (-10, 0, 5), "ForeArm_R": (-7, 0, -5),
    "HairBack_1": (0.8, 0, -0.8), "HairBack_2": (1.8, 0, -1.5),
    "HairFront_L1": (0.8, 0, -0.4), "HairFront_L2": (1.5, 0, -1.0),
    "HairFront_R1": (0.6, 0, 0.8), "HairFront_R2": (1.5, 0, 1.5),
}
make_action("wade", 60, [(1, wade_a, {}), (16, wade_b, {"Root": (0, 0, 0.012)}), (31, wade_a, {}), (46, wade_b, {"Root": (0, 0, -0.008)}), (60, wade_a, {})])

sub_a = {"Spine": (2, 0, -1), "Head": (-10, 0, -2), "HairBack_1": (-1, 0, 0.5), "HairBack_2": (-2.5, 0, 1.2)}
sub_b = {"Spine": (3, 0, 1), "Head": (-12, 0, 2), "HairBack_1": (0.5, 0, -0.5), "HairBack_2": (1.3, 0, -1.2)}
make_action("submerged", 90, [(1, sub_a, {}), (46, sub_b, {"Root": (0, 0, -0.01)}), (90, sub_a, {})])

# 스토리보드 ACT 10 전용 연기. 이동 클립을 재생 속도로 억지 변형하지 않고, 여자가 반복하는
# 행동(보이지 않는 아이를 안기·얼굴 확인·붙잡기·밧줄·목마 인식)을 각각 의미 있는 실루엣으로 둔다.
cradle_a = {
    "Spine": (5, 0, 0), "Chest": (9, 0, 0), "Head": (-10, 0, 0),
    "UpperArm_L": (24, -8, 18), "ForeArm_L": (48, 8, 14), "Hand_L": (18, 0, 8),
    "UpperArm_R": (-24, 8, -18), "ForeArm_R": (-48, -8, -14), "Hand_R": (-18, 0, -8),
}
cradle_b = dict(cradle_a)
cradle_b.update({"Chest": (11, 0, 1.5), "Head": (-13, 0, -2), "ForeArm_L": (52, 8, 16), "ForeArm_R": (-52, -8, -16)})
make_action("cradle", 90, [(1, cradle_a, {}), (46, cradle_b, {"Root": (0, 0, 0.005)}), (90, cradle_a, {})])

face_start = dict(cradle_a)
face_reach = {
    "Hips": (5, 0, 0), "Spine": (16, 0, 0), "Chest": (22, 0, -4), "Neck": (-8, 0, 0), "Head": (-18, 0, 4),
    "UpperArm_L": (58, -12, 22), "ForeArm_L": (18, -6, 5), "Hand_L": (-12, 0, 0),
    "UpperArm_R": (-16, 5, -10), "ForeArm_R": (-34, -5, -8),
}
make_action("face_check", 60, [(1, face_start, {}), (28, face_reach, {"Root": (0, -0.018, 0.006)}), (44, face_reach, {"Root": (0, -0.024, 0.006)}), (60, cradle_a, {})])

grab_open = {
    "Spine": (12, 0, 0), "Chest": (20, 0, 0), "Head": (-16, 0, 0),
    "UpperArm_L": (45, -5, 12), "ForeArm_L": (20, 0, 2),
    "UpperArm_R": (-45, 5, -12), "ForeArm_R": (-20, 0, -2),
}
grab_close = {
    "Spine": (23, 0, 0), "Chest": (30, 0, 0), "Head": (-22, 0, 0),
    "UpperArm_L": (68, -14, 27), "ForeArm_L": (54, 8, 18), "Hand_L": (20, 0, 10),
    "UpperArm_R": (-68, 14, -27), "ForeArm_R": (-54, -8, -18), "Hand_R": (-20, 0, -10),
}
make_action("grab", 42, [(1, grab_open, {}), (18, grab_close, {"Root": (0, -0.035, 0.012)}), (31, grab_close, {"Root": (0, -0.05, 0.015)}), (42, grab_open, {})])

rope_hold = {
    "Spine": (15, 0, 0), "Chest": (18, 0, 0), "Head": (-14, 0, 0),
    "UpperArm_L": (76, -10, 18), "ForeArm_L": (42, 0, 12), "Hand_L": (22, 0, 5),
    "UpperArm_R": (-76, 10, -18), "ForeArm_R": (-42, 0, -12), "Hand_R": (-22, 0, -5),
}
rope_pull = dict(rope_hold)
rope_pull.update({"Hips": (-7, 0, 0), "Spine": (-12, 0, 0), "Chest": (-8, 0, 0), "ForeArm_L": (62, 0, 16), "ForeArm_R": (-62, 0, -16)})
make_action("rope_tug", 60, [(1, rope_hold, {}), (23, rope_pull, {"Root": (0, 0.025, -0.015)}), (42, rope_hold, {}), (60, rope_pull, {"Root": (0, 0.018, -0.01)})])

recognize_start = dict(grab_close)
recognize_mid = dict(cradle_a)
recognize_end = {
    "Spine": (5, 0, 0), "Chest": (7, 0, 0), "Head": (-4, 0, 0),
    "UpperArm_L": (3, 0, 2), "ForeArm_L": (4, 0, 0), "Hand_L": (0, 0, 0),
    "UpperArm_R": (-3, 0, -2), "ForeArm_R": (-4, 0, 0), "Hand_R": (0, 0, 0),
}
make_action("recognize", 78, [(1, recognize_start, {}), (24, recognize_mid, {}), (54, recognize_end, {"Root": (0, 0, -0.008)}), (78, recognize_end, {})])

clear_pose()
armature.animation_data_create().action = None
bpy.context.scene.render.fps = FPS
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_anim_slide_to_zero=True,
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_yup=True,
)
print("EXPORTED", OUT, "actions", [action.name for action in bpy.data.actions])
