"""
Mixamo 애니메이션(FBX) → 우리 캐릭터 리그(GLB)로 리타게팅 (Blender 헤드리스)

  Blender -b --python scripts/mixamo/retarget.py -- <입력FBX폴더> <출력GLB>

동작:
  1) 타깃 = Tripo 가 mixamo 스펙으로 리깅한 캐릭터 GLB (본 이름 mixamorig:*)
  2) 소스 = Mixamo 에서 받은 FBX (같은 본 이름). 두 리그의 정면을 발/발가락 본으로 자동 정렬
  3) 본마다 "월드 회전의 rest 대비 델타"를 타깃 rest 에 적용 → A-포즈/T-포즈 차이를 흡수
  4) 파일명 = 클립 이름. 모든 클립을 한 GLB 에 액션으로 담아 출력

주의: Mixamo 다운로드는 Without Skin / In Place / 30fps / Keyframe Reduction none 권장
"""
import bpy, os, sys, glob, re, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC_DIR = argv[0] if argv else "assets/mixamo/in"
OUT = argv[1] if len(argv) > 1 else "assets/mixamo/out/character_mixamo.glb"
TARGET = argv[2] if len(argv) > 2 else "assets/tripo/final/rig/model_url.glb"
ROOT = "/Users/jay/Claude/3D_motion"
SRC_DIR = SRC_DIR if os.path.isabs(SRC_DIR) else os.path.join(ROOT, SRC_DIR)
OUT = OUT if os.path.isabs(OUT) else os.path.join(ROOT, OUT)
TARGET = TARGET if os.path.isabs(TARGET) else os.path.join(ROOT, TARGET)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# 파일명 → 클립 이름 매핑(부분 문자열, 소문자). 없으면 파일명 슬러그 사용
NAME_MAP = [
    ("t-pose", None), ("tpose", None),           # 기준 자세는 클립으로 쓰지 않음
    ("idle", "idle"), ("walk", "walk"), ("run", "run"), ("jog", "run"),
    ("falling", "fall"), ("fall", "fall"), ("jump", "jump"),
    ("sword combo", "sword_combo"), ("horizontal", "slash1"), ("backhand", "slash2"), ("downward", "slash3"),
    ("slash", "slash1"), ("combo", "slash2"), ("great sword", "slash3"),
]


# Mixamo 본 이름 → 우리 리그(Tripo 스펙) 본 이름. 소문자 비교.
BONE_MAP = {
    "hips": "hip", "spine": "waist", "spine1": "spine01", "spine2": "spine02",
    "neck": "necktwist01", "head": "head",
    "leftshoulder": "l_clavicle", "leftarm": "l_upperarm", "leftforearm": "l_forearm", "lefthand": "l_hand",
    "rightshoulder": "r_clavicle", "rightarm": "r_upperarm", "rightforearm": "r_forearm", "righthand": "r_hand",
    "leftupleg": "l_thigh", "leftleg": "l_calf", "leftfoot": "l_foot", "lefttoebase": "l_toebase",
    "rightupleg": "r_thigh", "rightleg": "r_calf", "rightfoot": "r_foot", "righttoebase": "r_toebase",
}


def slug(path):
    n = os.path.splitext(os.path.basename(path))[0].lower()
    for key, val in NAME_MAP:
        if key in n:
            return val
    return re.sub(r"[^a-z0-9]+", "_", n).strip("_")


def armature_of(objs):
    return next((o for o in objs if o.type == 'ARMATURE'), None)


def source_action(arm):
    """액션/NLA/씬 어디에 있든 소스 애니메이션의 프레임 범위를 찾는다"""
    ad = arm.animation_data
    if ad:
        if ad.action:
            return ad.action
        for t in ad.nla_tracks:
            for st in t.strips:
                if st.action:
                    return st.action
    return bpy.data.actions[0] if len(bpy.data.actions) == 1 else None


def bone_head_world(arm, *names):
    """여러 후보 이름 중 먼저 찾히는 본의 머리 위치(월드)"""
    wanted = [n.lower() for n in names]
    for b in arm.data.bones:
        if b.name.split(":")[-1].lower() in wanted:
            return arm.matrix_world @ b.head_local
    return None


def facing_yaw(arm):
    """발/발가락 본으로 캐릭터가 바라보는 수평 방향(라디안, +X 기준 반시계)"""
    lf = bone_head_world(arm, "LeftFoot", "L_Foot"); rf = bone_head_world(arm, "RightFoot", "R_Foot")
    lt = bone_head_world(arm, "LeftToeBase", "LeftToe_End", "L_ToeBase")
    if lf is None or rf is None:
        return 0.0
    fwd = None
    if lt is not None:
        fwd = (lt - lf); fwd.z = 0
    if fwd is None or fwd.length < 1e-4:
        left = (lf - rf); left.z = 0; left.normalize()
        fwd = Vector((-left.y, left.x, 0))
    fwd.normalize()
    return math.atan2(fwd.y, fwd.x)


# ---------- 타깃 로드 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=TARGET)
tgt_objs = list(bpy.context.scene.objects)
tgt_arm = armature_of(tgt_objs)
if tgt_arm is None:
    print("NO_TARGET_ARMATURE"); sys.exit(1)
tgt_yaw = facing_yaw(tgt_arm)
tgt_bones = {b.name.split(":")[-1].lower(): b.name for b in tgt_arm.data.bones}
print("TARGET bones=%d yaw=%.2f" % (len(tgt_arm.data.bones), math.degrees(tgt_yaw)))

# 타깃 rest (armature space) 캐시
tgt_rest = {n: tgt_arm.data.bones[n].matrix_local.copy() for n in tgt_bones.values()}
tgt_parent = {n: (tgt_arm.data.bones[n].parent.name if tgt_arm.data.bones[n].parent else None) for n in tgt_bones.values()}
# 계층 순서 (부모 먼저)
order = []
def walk(b):
    order.append(b.name)
    for c in b.children:
        walk(c)
for b in tgt_arm.data.bones:
    if b.parent is None:
        walk(b)

tgt_hips = tgt_bones.get("hips")
tgt_hips_h = (tgt_arm.matrix_world @ tgt_arm.data.bones[tgt_hips].head_local).z if tgt_hips else 1.0

files = sorted(glob.glob(os.path.join(SRC_DIR, "*.fbx")) + glob.glob(os.path.join(SRC_DIR, "*.FBX")))
print("SOURCES", len(files))
made = []

for path in files:
    name = slug(path)
    if name is None:
        print("SKIP(reference)", os.path.basename(path)); continue
    # 소스 임포트 (임포트 전 오브젝트 목록 기억)
    before = set(bpy.context.scene.objects)
    try:
        bpy.ops.import_scene.fbx(filepath=path, ignore_leaf_bones=True, automatic_bone_orientation=False)
    except Exception as e:
        print("IMPORT_FAIL", os.path.basename(path), e); continue
    new_objs = [o for o in bpy.context.scene.objects if o not in before]
    src_arm = armature_of(new_objs)
    if src_arm is None:
        print("NO_SRC_ARMATURE", os.path.basename(path))
        for o in new_objs: bpy.data.objects.remove(o, do_unlink=True)
        continue
    # 정면 정렬: 소스를 타깃과 같은 방향으로 회전
    src_arm.rotation_mode = 'XYZ'
    src_yaw = facing_yaw(src_arm)
    src_arm.rotation_euler.z += (tgt_yaw - src_yaw)
    bpy.context.view_layer.update()

    src_bones = {b.name.split(":")[-1].lower(): b.name for b in src_arm.data.bones}
    # 타깃 본 → 소스 본 (같은 이름이거나 BONE_MAP 으로 연결)
    pairs = {}
    for skey, sname in src_bones.items():
        tkey = skey if skey in tgt_bones else BONE_MAP.get(skey)
        if tkey and tkey in tgt_bones:
            pairs[tgt_bones[tkey]] = sname
    if len(pairs) < 10:
        print("TOO_FEW_MATCHES", len(pairs), os.path.basename(path))
        for o in new_objs: bpy.data.objects.remove(o, do_unlink=True)
        continue
    action = source_action(src_arm)
    if action is not None:
        f0, f1 = int(action.frame_range[0]), int(action.frame_range[1])
    else:  # 액션을 못 찾으면 씬 프레임 범위로 샘플링 (FBX 임포터가 설정해 둠)
        f0, f1 = int(bpy.context.scene.frame_start), int(bpy.context.scene.frame_end)
    if f1 <= f0:
        print("NO_ANIM", os.path.basename(path))
        for o in new_objs: bpy.data.objects.remove(o, do_unlink=True)
        continue
    src_mw = src_arm.matrix_world.copy()
    tgt_mw = tgt_arm.matrix_world.copy()
    tgt_mw_q_inv = tgt_mw.to_3x3().to_quaternion().normalized().inverted()
    src_rest_rot_q = {t: (src_mw @ src_arm.data.bones[s_].matrix_local).to_3x3().to_quaternion().normalized() for t, s_ in pairs.items()}
    tgt_rest_rot_q = {t: (tgt_mw @ tgt_rest[t]).to_3x3().to_quaternion().normalized() for t in pairs}

    # 타깃 액션 준비: Blender 4.4+ 는 액션 슬롯이 필요해서, 첫 키프레임으로 자동 생성시킨 뒤 이름을 바꾼다
    if tgt_arm.animation_data is None:
        tgt_arm.animation_data_create()
    tgt_arm.animation_data.action = None
    for pb in tgt_arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'

    # 회전만(쿼터니언) 다룬다 — 행렬을 그대로 쓰면 rest 스케일이 basis 에 섞여 캐릭터가 터진다
    q_rest = {n: tgt_rest[n].to_quaternion().normalized() for n in tgt_rest}
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        q_pose = {}  # 타깃 본의 armature-space 포즈 회전
        for bname in order:
            key = bname.split(":")[-1].lower()
            parent = tgt_parent[bname]
            qP = q_pose.get(parent, None)
            qPrest = q_rest[parent] if parent else None
            if bname in pairs:
                sb = src_arm.pose.bones[pairs[bname]]
                src_pose_rot = (src_mw @ sb.matrix).to_3x3().to_quaternion().normalized()
                delta = src_pose_rot @ src_rest_rot_q[bname].inverted()
                want_world = delta @ tgt_rest_rot_q[bname]
                q_want = (tgt_mw_q_inv @ want_world).normalized()
            else:
                # 대응 본이 없으면 rest 유지 (부모의 포즈를 따라감)
                q_local_rest = (qPrest.inverted() @ q_rest[bname]) if qPrest else q_rest[bname]
                q_want = ((qP @ q_local_rest) if qP else q_local_rest).normalized()
            q_pose[bname] = q_want
            q_local = (qP.inverted() @ q_want) if qP else q_want
            q_local_rest = (qPrest.inverted() @ q_rest[bname]) if qPrest else q_rest[bname]
            pb = tgt_arm.pose.bones[bname]
            pb.rotation_quaternion = (q_local_rest.inverted() @ q_local).normalized()
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
            pb.keyframe_insert("rotation_quaternion", frame=f, group=bname)

    act = tgt_arm.animation_data.action
    if act is None:
        print("NO_KEYS", name)
        for o in new_objs: bpy.data.objects.remove(o, do_unlink=True)
        continue
    act.name = name
    act.use_fake_user = True
    print("CLIP_OK %-12s frames=%d-%d bones=%d" % (name, f0, f1, len(pairs)))
    made.append(name)
    # 소스 정리
    tgt_arm.animation_data.action = None
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        if a.name not in made and a.name != name:
            a.use_fake_user = False
            bpy.data.actions.remove(a)

print("CLIPS", ",".join(made))
bpy.context.scene.frame_set(0)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True,
                          export_animation_mode='ACTIONS', export_skins=True,
                          export_apply=False, export_yup=True, export_force_sampling=True)
print("EXPORTED", OUT)
