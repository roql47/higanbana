"""
로쿠로쿠비 이동(활주) 프리뷰 (2026-08-22) — 몸이 움직일 때의 뱀 목.

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/anim-rokurokubi-glide.py -- --stills
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/anim-rokurokubi-glide.py
  ffmpeg -framerate 24 -i <out>/frames3/rk_%04d.png -c:v libx264 -pix_fmt yuv420p rokuro-glide.mp4

시퀀스(8 s): 어둠에서 활주 등장(얼굴은 내내 플레이어를 본다) → 호를 그리며 가속 접근 →
옆으로 코일 → 연속적인 뱀 파동 런지 → 반동 없이 유지.

## 이동의 규칙 (엔진 `RokuroKubi` 드라이버 계약에 추가)
1. **활주** — 다리가 없다. 베지어 경로 + 느린 부양 바운스(±2 cm). 발소리 대신 옷자락
2. **몸은 진행 방향으로 기울고**(up × dir 축, 속도 비례 ~7°) **얼굴은 목표를 놓지 않는다** —
   몸이 옆을 지나가도 머리만 고정. 이 어긋남이 이 요괴의 공포다
3. **목 파도 진폭·트레일은 속도에 비례** — 서 있으면 잔잔하고 달리면 물결친다.
   트레일 = 하단 1/3 이 진행 반대쪽으로 굽는 것(관성 읽기)
4. **목 길이·훅은 연속 보간한다** — 급수축·급신장·감쇠 오버슛을 쓰지 않는다. 공포는
   고무줄 반동이 아니라 위상차가 흐르는 뱀 움직임에서 만든다
5. **머리카락은 Hair_L/R 전용 본** — 목 파도를 복사하지 않고 느린 좌우 위상과 활주 관성만 받는다
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
scene.render.resolution_x = 720; scene.render.resolution_y = 720

world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.045, 0.055, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.55
key = bpy.data.objects.new("key", bpy.data.lights.new("key", 'POINT'))
key.data.energy = 110; key.data.color = (1.0, 0.66, 0.35)
key.location = (1.6, -1.5, 1.05)
scene.collection.objects.link(key)
rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", 'SUN'))
rim.data.energy = 1.3; rim.data.color = (0.5, 0.6, 0.9)
rim.rotation_euler = (math.radians(60), 0, math.radians(160))
scene.collection.objects.link(rim)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 28
scene.collection.objects.link(cam); scene.camera = cam
cam.location = (2.5, -1.95, 1.0)
look = mathutils.Vector((0.0, -0.05, 0.66)) - cam.location
cam.rotation_euler = look.to_track_quat('-Z','Y').to_euler()

floor = bpy.data.objects.new("floor", bpy.data.meshes.new("floor"))
import bmesh as _bm
bm = _bm.new(); _bm.ops.create_grid(bm, x_segments=1, y_segments=1, size=8)
bm.to_mesh(floor.data); bm.free()
fm = bpy.data.materials.new("fm"); fm.use_nodes = True
fm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.06, 0.055, 0.05, 1)
fm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
floor.data.materials.append(fm)
scene.collection.objects.link(floor)

# 플레이어(=응시·스트라이크 목표) — 카메라 옆 고정
PLAYER = mathutils.Vector((1.95, -1.55, 0.78))
tgt = bpy.data.objects.new("target", None)
tgt.location = PLAYER
scene.collection.objects.link(tgt)
head_pb = arm.pose.bones["Head"]
con = head_pb.constraints.new('DAMPED_TRACK')
con.target = tgt
con.track_axis = 'TRACK_Z'
con.influence = 0.92

NECK_N = 32
NECK = [arm.pose.bones[f"Neck_{i:02d}"] for i in range(NECK_N)]
for pb in NECK: pb.rotation_mode = 'QUATERNION'
for nm in ("Spine", "Chest", "Root"):
    arm.pose.bones[nm].rotation_mode = 'QUATERNION'
L_ARM = arm.pose.bones["L_Arm"]; R_ARM = arm.pose.bones["R_Arm"]
L_ARM.rotation_mode = 'QUATERNION'; R_ARM.rotation_mode = 'QUATERNION'
HAIR_L = arm.pose.bones.get("Hair_L"); HAIR_R = arm.pose.bones.get("Hair_R")
if HAIR_L: HAIR_L.rotation_mode = 'QUATERNION'
if HAIR_R: HAIR_R.rotation_mode = 'QUATERNION'

REST_INV = arm.data.bones['Neck_00'].matrix_local.to_3x3().inverted()
RI_ROOT = arm.data.bones['Root'].matrix_local.to_3x3().inverted()
RI_L = arm.data.bones['L_Arm'].matrix_local.to_3x3().inverted()
RI_R = arm.data.bones['R_Arm'].matrix_local.to_3x3().inverted()

BASE = mathutils.Vector((0, 0, 0.63))
L0 = 0.17 / NECK_N
HEAD_L = 0.18
BW = [0.25 + math.sin(math.pi * (i + 0.5) / NECK_N) for i in range(NECK_N)]
BWs = sum(BW)
HOOK_W = [max(0.0, math.sin(math.pi * (i - NECK_N*0.62) / (NECK_N*0.38))) for i in range(NECK_N)]
HOOK_Ws = sum(HOOK_W)
TRAIL_W = [max(0.0, math.sin(math.pi * (0.5 + i) / (NECK_N*0.66))) if i < NECK_N*0.33 else 0.0 for i in range(NECK_N)]
TRAIL_Ws = sum(TRAIL_W)
WENV = [0.4 + 1.8 * (i / (NECK_N - 1)) ** 1.5 for i in range(NECK_N)]
RAMP = [min(1.0, max(0.0, (i - 4) / 8.0)) for i in range(NECK_N)]
RAMPs = sum(RAMP)
SEG_MAX = L0 * 4.0

def ease(a, b, t):
    t = max(0.0, min(1.0, t)); t = t*t*(3-2*t)
    return a + (b-a)*t

# ---------- 활주 경로: 왼쪽 어둠 → 호 → 플레이어 앞 급정지 ----------
P0 = mathutils.Vector((-3.1, 1.4, 0)); P1 = mathutils.Vector((-1.0, 1.2, 0)); P2 = mathutils.Vector((0.95, -0.85, 0))   # 정지점 = 플레이어 1 m 앞
T_STOP = 5.2
def path_u(t):
    # 가속은 부드럽게, 정지는 **빠르게** — 관성이 목으로 넘어가야 한다
    k = max(0.0, min(1.0, t / T_STOP))
    return k*k*(3-2*k) if k < 0.55 else 0.55*0.55*(3-2*0.55) + (k-0.55) * 1.16
def bezier(u):
    u = min(1.0, u)
    return P0*(1-u)**2 + P1*2*u*(1-u) + P2*u**2

prev_pos = bezier(0)
prev_yaw = None
for f in range(1, END+1):
    t = f / FPS
    u = path_u(t)
    pos = bezier(u)
    vel = (pos - prev_pos) * FPS if f > 1 else mathutils.Vector((0,0,0))
    speed = vel.length
    prev_pos = pos.copy()
    moving = speed > 0.05
    dirn = vel.normalized() if moving else (PLAYER - pos).normalized()

    # 진행 방향으로 몸을 돌린다 (앞 = 로컬 −Y). 급회전은 느리게 따라온다
    yaw_want = math.atan2(dirn.x, -dirn.y)
    if prev_yaw is None: prev_yaw = yaw_want
    dy = (yaw_want - prev_yaw + math.pi) % (2*math.pi) - math.pi
    yaw = prev_yaw + dy * min(1.0, 4.0 / FPS)
    prev_yaw = yaw

    bob = 0.02 * math.sin(t * 2.1) + 0.012 * math.sin(t * 3.7 + 1.1)
    arm.location = (pos.x, pos.y, bob)
    arm.rotation_euler = (0, 0, yaw)
    arm.keyframe_insert('location', frame=f)
    arm.keyframe_insert('rotation_euler', frame=f)

    # 월드 → 아마추어 로컬 (타깃·축 변환용)
    M = mathutils.Matrix.Translation((pos.x, pos.y, bob)) @ mathutils.Matrix.Rotation(yaw, 4, 'Z')
    Minv = M.inverted()
    Minv3 = Minv.to_3x3()

    # ---- 단계: 활주 → 길이 유지 코일 → smoothstep 런지 → 반동 없는 유지 ----
    spd_k = min(1.0, speed / 0.9)
    if t < T_STOP:
        reach = 0.16 + 0.06 * spd_k
        A = math.radians(4 + 8 * spd_k); w = 1.8 + 1.6 * spd_k
        hook = math.radians(10)
        arm_dn, arm_fw = 32 - 4 * spd_k, 4 + 6 * spd_k
    elif t < T_STOP + 0.32:
        k = (t - T_STOP) / 0.32
        reach = ease(0.25, 0.55, k)
        A = math.radians(ease(9, 10, k)); w = 2.6
        hook = math.radians(ease(12, 22, k))
        arm_dn, arm_fw = ease(28, 22, k), ease(10, 6, k)
    elif t < T_STOP + 0.94:
        k = min(1.0, (t - T_STOP - 0.32) / 0.62)
        kk = k*k*(3-2*k)
        reach = 0.55 + (0.98 - 0.55) * kk
        A = math.radians(9); w = 3.0
        hook = math.radians(22 + 8 * kk)
        arm_dn, arm_fw = 22, 6 + 20 * kk
    else:
        reach = 0.90
        A = math.radians(8); w = 2.5
        hook = math.radians(28)
        arm_dn, arm_fw = 21, 26

    tp_l = Minv @ PLAYER
    D = tp_l - BASE
    dist = D.length
    Dn = D.normalized()
    theta = math.acos(max(-1, min(1, Dn.z)))
    w_axis = mathutils.Vector((0,0,1)).cross(Dn)
    if w_axis.length < 1e-4: w_axis = mathutils.Vector((1,0,0))
    l_axis = (REST_INV @ w_axis).normalized()
    l_wave_x = (REST_INV @ mathutils.Vector((1,0,0))).normalized()
    l_wave_z = (REST_INV @ mathutils.Vector((0,-1,0))).normalized()
    # 트레일 축 — 진행 방향(로컬) 기준. 하단이 진행 반대쪽으로 굽는다
    dir_l = (Minv3 @ dirn).normalized()
    t_axis_w = mathutils.Vector((0,0,1)).cross(dir_l)
    if t_axis_w.length < 1e-4: t_axis_w = mathutils.Vector((1,0,0))
    l_trail = (REST_INV @ t_axis_w).normalized()
    trail = -math.radians(14) * spd_k   # 음수 = 진행 반대쪽

    Lchain = max(0.0, reach * dist - HEAD_L)
    seg = max(0.0, min(SEG_MAX, (Lchain - 0.17) / RAMPs)) if reach > 0 else 0.0

    PHI = 6.6 / NECK_N
    for i, pb in enumerate(NECK):
        bend = theta * BW[i]/BWs + hook * (HOOK_W[i]/HOOK_Ws if HOOK_Ws else 0)
        q = mathutils.Quaternion(l_axis, bend)
        if TRAIL_Ws and TRAIL_W[i]:
            q @= mathutils.Quaternion(l_trail, trail * TRAIL_W[i]/TRAIL_Ws * NECK_N * 0.33)
        q @= mathutils.Quaternion(l_wave_x, A*WENV[i]*0.8*math.sin(t*w - i*PHI))
        q @= mathutils.Quaternion(l_wave_z, A*WENV[i]*math.sin(t*w*0.83 - i*PHI + 1.3))
        pb.rotation_quaternion = q
        pb.location = (0, seg * RAMP[i], 0)
        pb.keyframe_insert('rotation_quaternion', frame=f)
        pb.keyframe_insert('location', frame=f)

    # ---- 고개 갸웃 — 순간 경련은 목의 튕김처럼 읽혀 사용하지 않는다 ----
    # Damped Track 은 Z(시선)의 **방향**만 잡는다 — Z 축 주변 롤은 자유라서, 여기 롤을 넣으면
    # **얼굴은 나를 본 채로 고개가 기울어진다**. 그 갸웃이 이 요괴의 표정이다
    tilt = 0.24 * math.sin(t * 0.5) * math.sin(t * 0.23 + 1.0)
    hd_pb = arm.pose.bones["Head"]
    hd_pb.rotation_mode = 'QUATERNION'
    hd_pb.rotation_quaternion = mathutils.Quaternion(mathutils.Vector((0, 0, 1)), tilt)
    hd_pb.keyframe_insert('rotation_quaternion', frame=f)

    # 목에서 분리된 머리카락 — 좌우가 서로 다른 느린 위상, 오버슛 없는 사인만 쓴다.
    for hb, side, phase in ((HAIR_L, 1, 0.35), (HAIR_R, -1, 1.55)):
        if not hb: continue
        trail_h = 0.055*math.sin(t*1.35+phase) + 0.09*spd_k
        spread_h = side*0.045*math.sin(t*0.92+phase)
        hb.rotation_quaternion = mathutils.Quaternion((1,0,0), trail_h) @ mathutils.Quaternion((0,0,1), spread_h)
        hb.keyframe_insert('rotation_quaternion', frame=f)

    # 몸 기울기 — 진행 방향으로, 속도 비례 (규칙 2)
    lean_axis = (RI_ROOT @ t_axis_w).normalized()
    qr = mathutils.Quaternion(lean_axis, math.radians(7) * spd_k)
    arm.pose.bones["Root"].rotation_quaternion = qr
    arm.pose.bones["Root"].keyframe_insert('rotation_quaternion', frame=f)

    # ---- 팔: 물에 잠긴 천처럼 (사용자 요구 「팔도 조금은」) ----
    # ① 느린 부유 — 좌우 **위상을 다르게**. 같으면 새가 날갯짓하는 것이 된다
    # ② 활주 중 뒤로 쓸림(관성) ③ 본 축 롤 — 소매 천이 비틀리며 살랑인다 ④ 스트라이크 중 잔떨림
    trem = math.radians(1.2) * math.sin(t*14.0) if t > T_STOP + 0.5 else 0.0
    dnL = math.radians(arm_dn) + math.radians(3.5)*math.sin(t*0.9+0.7) + trem
    dnR = math.radians(arm_dn) + math.radians(3.5)*math.sin(t*0.8+2.4) + trem
    fwL = math.radians(arm_fw) + math.radians(4.0)*math.sin(t*0.7+0.2) - math.radians(9)*spd_k
    fwR = math.radians(arm_fw) + math.radians(4.0)*math.sin(t*0.63+1.9) - math.radians(9)*spd_k
    twL = math.radians(5.0)*math.sin(t*0.8+1.1)
    twR = math.radians(5.0)*math.sin(t*0.74+3.0)
    qL = mathutils.Quaternion((RI_L @ mathutils.Vector((0,1,0))).normalized(), dnL)
    qL @= mathutils.Quaternion((RI_L @ mathutils.Vector((0,0,1))).normalized(), -fwL)
    qL @= mathutils.Quaternion(mathutils.Vector((0,1,0)), twL)   # 본 자기 축 롤
    L_ARM.rotation_quaternion = qL
    qR = mathutils.Quaternion((RI_R @ mathutils.Vector((0,1,0))).normalized(), -dnR)
    qR @= mathutils.Quaternion((RI_R @ mathutils.Vector((0,0,1))).normalized(), fwR)
    qR @= mathutils.Quaternion(mathutils.Vector((0,1,0)), twR)
    R_ARM.rotation_quaternion = qR
    L_ARM.keyframe_insert('rotation_quaternion', frame=f)
    R_ARM.keyframe_insert('rotation_quaternion', frame=f)

    # ---- 카메라: 푸시인 + 핸드헬드 + 런지 셰이크 ----
    push = (t / 8.0) * 0.38                                          # 8 초 동안 38 cm 전진
    hh = mathutils.Vector((                                          # 핸드헬드 — 주기 셋의 합, 규칙이 안 읽히게
        0.010*math.sin(t*1.3+0.5) + 0.006*math.sin(t*3.1),
        0.008*math.sin(t*1.7+2.0),
        0.009*math.sin(t*1.1+1.1) + 0.005*math.sin(t*2.6+0.7)))
    shk = 0.0
    tau_l = t - (T_STOP + 0.5)
    if tau_l >= 0: shk = 0.05 * math.exp(-tau_l * 6) * math.sin(tau_l * 40)   # 런지 순간 — 플레이어가 움찔한다
    cam_base = mathutils.Vector((2.5, -1.95, 1.0))
    look_at = mathutils.Vector((0.0, -0.05, 0.66))
    fwd = (look_at - cam_base).normalized()
    cam.location = cam_base + fwd * push + hh + mathutils.Vector((0, 0, shk))
    d2 = look_at - cam.location
    cam.rotation_euler = d2.to_track_quat('-Z', 'Y').to_euler()
    cam.keyframe_insert('location', frame=f)
    cam.keyframe_insert('rotation_euler', frame=f)
    # 키라이트 = 초칭 — 게임 등불과 같은 이중 사인 깜빡임 (`light/chochin.ts`)
    key.data.energy = 110 * (0.84 + 0.16 * math.sin(t*5.3) * math.sin(t*2.7))
    key.data.keyframe_insert('energy', frame=f)

    sp = arm.pose.bones["Spine"]; ch = arm.pose.bones["Chest"]
    sp.rotation_quaternion = mathutils.Quaternion(l_wave_x, math.radians(1.2 + 2.0*spd_k) * math.sin(t*(0.9+2.0*spd_k)))
    ch.rotation_quaternion = mathutils.Quaternion(l_wave_x, math.radians(1.5 + 1.5*spd_k) * math.sin(t*(0.9+2.0*spd_k)+0.4))
    sp.keyframe_insert('rotation_quaternion', frame=f)
    ch.keyframe_insert('rotation_quaternion', frame=f)

scene.render.image_settings.file_format = 'PNG'
if STILLS_ONLY:
    for f in (40, 100, 132, 150):
        scene.frame_set(f)
        scene.render.filepath = os.path.join(SP, f"glide_{f:03d}.png")
        bpy.ops.render.render(write_still=True)
    print("STILLS DONE")
else:
    scene.render.filepath = os.path.join(SP, "frames3/rk_")
    bpy.ops.render.render(animation=True)
    print("ANIM DONE")
