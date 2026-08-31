"""
로쿠로쿠비 목 모션 프리뷰 (2026-08-22, 2차) — 엔진 드라이버와 **같은 공식**으로 8초 시퀀스.

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/anim-rokurokubi-preview.py -- --stills
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/anim-rokurokubi-preview.py
  ffmpeg -framerate 24 -i <out>/frames2/rk_%04d.png -c:v libx264 -pix_fmt yuv420p rokuro-motion.mp4

시퀀스: 잠복(팔 내리고 미세 파도) → 목이 뻗어 나오며 좌우 추적 → 스트라이크(카메라 앞) → 복귀.

## 엔진 드라이버(`RokuroKubi`)에 가져갈 규칙 — 1·2차 실측 합본
1. **한 축으로 굽힌다.** 오일러 pitch+yaw 합성은 굽힘 평면이 돌아가 반대로 휜다(1차 실측).
   평면 법선 = up × D 사원수 하나 — 이 축은 체인이 굽는 동안 마디 로컬에서 불변이다
2. **분배는 완만한 전방 편중.** 1차의 [3, 2.2, 0.6, …]은 앞 두 마디만 꺾여 위쪽이 막대기가 됐다
   (사용자 리포트). 12마디 + 완만한 기울기면 방향 전환과 곡선이 다 산다
3. **늘이기는 마디당 3배를 넘기지 않는다.** 1차에서 rest 의 13배로 늘였더니 웨이트 전환부가
   실처럼 찢어졌다(사용자 리포트). 12마디 × 3배 ≈ 목 0.6 m — 더 길어야 하면 마디를 더 쪼갠다
4. 파도 = 위상차 사인 A·sin(t·ω − i·φ), φ≈0.55(12마디) · Head 는 Damped Track(lookAt)이 마무리
5. 팔: L_Arm/R_Arm — 잠복 38° 내림, 스트라이크에서 26° 앞으로 뻗는다(붙잡으려는 손)
"""
import bpy, math, mathutils, os, sys

SRC = "/Users/jay/Claude/3D_motion/assets/tripo/yokai-rokurokubi/rigged.glb"
SP = os.environ.get("ROKURO_OUT", "/private/tmp/claude-501/-Users-jay-Claude-3D-motion/d332dad1-557e-48b3-ac50-c0d574c58f38/scratchpad")
FPS = 24
END = 192
STILLS_ONLY = "--stills" in sys.argv

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]

scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start = 1; scene.frame_end = END
try: scene.render.engine = 'BLENDER_EEVEE_NEXT'
except Exception: scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 640; scene.render.resolution_y = 800

world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.045, 0.055, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.5
key = bpy.data.objects.new("key", bpy.data.lights.new("key", 'POINT'))
key.data.energy = 90; key.data.color = (1.0, 0.66, 0.35)
key.location = (0.5, -1.6, 0.95)
scene.collection.objects.link(key)
rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", 'SUN'))
rim.data.energy = 0.9; rim.data.color = (0.5, 0.6, 0.9)
rim.rotation_euler = (math.radians(60), 0, math.radians(160))
scene.collection.objects.link(rim)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 32
scene.collection.objects.link(cam); scene.camera = cam
# **옆 60°.** 정면에 두면 굽힘 평면이 시선과 나란해져 곡선이 원근 단축으로 막대기가 된다
# (3차까지의 「위쪽이 막대기」 리포트의 실체 — 본 좌표는 S자였다, 진단 실측)
cam.location = (1.85, -1.15, 0.86)
look = mathutils.Vector((0, -0.25, 0.72)) - cam.location
cam.rotation_euler = look.to_track_quat('-Z','Y').to_euler()

# 바닥 — 허공에 뜬 유령은 크기·거리가 안 읽힌다
floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor"))
import bmesh as _bm
bm = _bm.new(); _bm.ops.create_grid(bm, x_segments=1, y_segments=1, size=4)
bm.to_mesh(floor.data); bm.free()
fm = bpy.data.materials.new("fm"); fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.06,0.055,0.05,1)
fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
floor.data.materials.append(fm)
scene.collection.objects.link(floor)

tgt = bpy.data.objects.new("target", None)
scene.collection.objects.link(tgt)
head_pb = arm.pose.bones["Head"]
con = head_pb.constraints.new('DAMPED_TRACK')
con.target = tgt
con.track_axis = 'TRACK_Z'
con.influence = 0.9

NECK_N = 32
NECK = [arm.pose.bones[f"Neck_{i:02d}"] for i in range(NECK_N)]
for pb in NECK: pb.rotation_mode = 'QUATERNION'
for nm in ("Spine", "Chest"):
    arm.pose.bones[nm].rotation_mode = 'XYZ'
L_ARM = arm.pose.bones["L_Arm"]; R_ARM = arm.pose.bones["R_Arm"]
L_ARM.rotation_mode = 'QUATERNION'; R_ARM.rotation_mode = 'QUATERNION'

REST_INV = arm.data.bones['Neck_00'].matrix_local.to_3x3().inverted()
RI_L = arm.data.bones['L_Arm'].matrix_local.to_3x3().inverted()
RI_R = arm.data.bones['R_Arm'].matrix_local.to_3x3().inverted()

BASE = mathutils.Vector((0, 0, 0.63))
L0 = 0.17 / NECK_N
HEAD_L = 0.18
# 조준 굽힘 분배 — **가운데 볼록**. 전방 편중은 방향 전환이 뿌리에서 끝나 위 절반이
# 막대기가 됐다(사용자 리포트 2회). 목은 가운데가 굽고 양끝이 완만해야 생물이다
BW = [0.25 + math.sin(math.pi * (i + 0.5) / NECK_N) for i in range(NECK_N)]
BWs = sum(BW)
# 코브라 훅 — 위 1/3 이 조준 방향으로 **더** 감아 넘어가고 머리가 훅 끝에 걸린다.
# 얼굴은 Damped Track 이 되세우므로, 훅이 클수록 「목이 넘어와 머리가 나를 본다」가 된다
HOOK_W = [max(0.0, math.sin(math.pi * (i - NECK_N*0.62) / (NECK_N*0.38))) for i in range(NECK_N)]
HOOK_Ws = sum(HOOK_W)
# 파도 봉투 — 채찍: 진폭이 끝으로 갈수록 커진다. 균일 진폭은 위쪽에서 안 보였다
WENV = [0.4 + 1.8 * (i / (NECK_N - 1)) ** 1.5 for i in range(NECK_N)]
# 늘이기 램프: 뿌리 4마디 고정, 12마디째 만개 — 목이 옷깃 안에서 자라 나온다
RAMP = [min(1.0, max(0.0, (i - 4) / 8.0)) for i in range(NECK_N)]
RAMPs = sum(RAMP)
# 규칙 3 완화: 32마디는 관절이 촘촘해 마디당 5배까지 매끈하다 → 목 최대 ≈ 0.85 m
SEG_MAX = L0 * 4.0

def ease(a, b, t):
    t = max(0.0, min(1.0, t)); t = t*t*(3-2*t)
    return a + (b-a)*t

for f in range(1, END+1):
    t = f / FPS
    if t < 2.2:
        reach = 0.0; A = math.radians(5); w = 1.6; hook = math.radians(14)
        tp = mathutils.Vector((0.3, -1.3, 0.85))
        arm_dn, arm_fw = 32, 4
    elif t < 4.5:
        k = (t-2.2)/2.3
        reach = ease(0, 0.62, k); A = math.radians(ease(5, 10, k)); w = 2.2; hook = math.radians(ease(14, 38, k))
        tp = mathutils.Vector((0.9*math.sin((t-2.2)*1.4), -1.15, 0.72))   # 넓게 쓸며 — 곡선이 보이는 각
        arm_dn, arm_fw = ease(32, 27, k), ease(4, 12, k)
    elif t < 6.2:
        k = (t-4.5)/1.7
        reach = ease(0.62, 0.88, k); A = math.radians(ease(10, 7, k)); w = 3.0; hook = math.radians(ease(38, 30, k))
        tp = mathutils.Vector((1.15, -0.95, 0.70))   # 스트라이크 — 카메라 쪽 옆으로
        arm_dn, arm_fw = ease(30, 22, k), ease(12, 26, k)
    else:
        k = (t-6.2)/1.8
        reach = ease(0.88, 0.0, k); A = math.radians(ease(7, 5, k)); w = 1.6; hook = math.radians(ease(30, 14, k))
        tp = mathutils.Vector((0.3, -1.3, 0.85))
        arm_dn, arm_fw = ease(22, 32, k), ease(26, 4, k)

    D = tp - BASE
    dist = D.length
    Dn = D.normalized()
    theta = math.acos(max(-1, min(1, Dn.z)))
    w_axis = mathutils.Vector((0,0,1)).cross(Dn)
    if w_axis.length < 1e-4: w_axis = mathutils.Vector((1,0,0))
    l_axis = (REST_INV @ w_axis).normalized()
    l_wave_x = (REST_INV @ mathutils.Vector((1,0,0))).normalized()
    l_wave_z = (REST_INV @ mathutils.Vector((0,-1,0))).normalized()
    Lchain = max(0.0, reach * dist - HEAD_L)
    # 체인 길이 = 0.17 + seg·Σramp → seg 를 정확히 역산
    seg = max(0.0, min(SEG_MAX, (Lchain - 0.17) / RAMPs)) if reach > 0 else 0.0

    PHI = 6.6 / NECK_N   # 체인 전체에 파도 한 주기 남짓 (12마디 0.55 와 같은 총 위상)
    for i, pb in enumerate(NECK):
        bend = theta * BW[i]/BWs + hook * (HOOK_W[i]/HOOK_Ws if HOOK_Ws else 0)
        q = mathutils.Quaternion(l_axis, bend)
        q @= mathutils.Quaternion(l_wave_x, A*WENV[i]*0.8*math.sin(t*w - i*PHI))
        q @= mathutils.Quaternion(l_wave_z, A*WENV[i]*math.sin(t*w*0.83 - i*PHI + 1.3))
        pb.rotation_quaternion = q
        # 늘이기 램프(RAMP) — 첫 마디부터 늘이면 목이 옷깃에서 떠서 틈이 보인다(스틸 실측)
        pb.location = (0, seg * RAMP[i], 0)
        pb.keyframe_insert('rotation_quaternion', frame=f)
        pb.keyframe_insert('location', frame=f)

    # 팔 — 내림(월드 +Y 축) + 앞으로(월드 +Z 축, 좌우 부호 반대) + 숨쉬기
    br = math.radians(1.5) * math.sin(t*0.9+0.7)
    dn = math.radians(arm_dn); fw = math.radians(arm_fw)
    qL = mathutils.Quaternion((RI_L @ mathutils.Vector((0,1,0))).normalized(), dn + br)
    qL @= mathutils.Quaternion((RI_L @ mathutils.Vector((0,0,1))).normalized(), -fw)
    L_ARM.rotation_quaternion = qL
    qR = mathutils.Quaternion((RI_R @ mathutils.Vector((0,1,0))).normalized(), -(dn + br))
    qR @= mathutils.Quaternion((RI_R @ mathutils.Vector((0,0,1))).normalized(), fw)
    R_ARM.rotation_quaternion = qR
    L_ARM.keyframe_insert('rotation_quaternion', frame=f)
    R_ARM.keyframe_insert('rotation_quaternion', frame=f)

    arm.pose.bones["Spine"].rotation_euler = (math.radians(1.2)*math.sin(t*0.9), 0, math.radians(1.0)*math.sin(t*0.7+0.5))
    arm.pose.bones["Chest"].rotation_euler = (math.radians(1.5)*math.sin(t*0.9+0.4), 0, 0)
    arm.pose.bones["Spine"].keyframe_insert('rotation_euler', frame=f)
    arm.pose.bones["Chest"].keyframe_insert('rotation_euler', frame=f)
    tgt.location = tp
    tgt.keyframe_insert('location', frame=f)

scene.render.image_settings.file_format = 'PNG'
if STILLS_ONLY:
    for f in (30, 100, 140):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(SP, f"preview_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    print("STILLS DONE")
else:
    scene.render.filepath = os.path.join(SP, "frames2/rk_")
    bpy.ops.render.render(animation=True)
    print("ANIM DONE")
