"""버스 기사 백미러용 **정면** 렌더 (`world/bus.ts` 의 eyeMat 텍스처).

  blender --background --python scripts/blender/render-driver-reflection.py -- \
      --in public/models/props/bus-driver-v2.glb \
      --out public/textures/bus/driver-reflection.png \
      --yaw 0 --w 1024 --h 320

  이어서 가장자리 페더링 + webp:
      node scripts/blender/feather-reflection.mjs \
          public/textures/bus/driver-reflection.png \
          public/textures/bus/driver-reflection.webp

왜 이 스크립트가 있나 — 처음 텍스처는 기사를 **옆에서** 렌더한 것이라 어떤 UV 로 잘라도
옆얼굴만 나왔다(2026-08-26 사용자 리포트). 이 컷의 한 줄은 「기사가 백미러로 나를 본다」이므로
거울 안에는 **정면 눈**이 있어야 한다.

계약
  · 정면 = glTF +Z. `village/landmarks.normalize()` 가 geometry 에 rotateY(-90°) 를 걸고
    `bus.ts` 가 DRIVER_YAW(+90°) 로 되돌리므로, 인게임 기사 방향 = **원본 GLB 그대로**다.
    Blender glTF 임포터는 glTF +Z 를 -Y 로 보내므로 카메라는 **-Y 쪽**에 선다.
  · 직교 카메라 — 거울 속 크롭은 원근이 붙으면 얼굴이 렌즈처럼 부푼다
  · 배경 투명 — eyeMat 이 transparent 라 알파가 그대로 쓰인다
  · 눈 높이 기준 가로 띠로 자른다. 인게임 평면이 0.46 × 0.135(≈3.4:1)이라 렌더도 같은 비율
"""

import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default):
    return argv[argv.index(name) + 1] if name in argv else default


IN = Path(arg("--in", "public/models/props/bus-driver-v2.glb")).resolve()
OUT = Path(arg("--out", "public/textures/bus/driver-reflection.png")).resolve()
YAW = float(arg("--yaw", "0"))          # 도(°). 정면이 안 맞으면 90 씩 돌려 본다
W, H = int(arg("--w", "1024")), int(arg("--h", "320"))
# 머리 어디를 담을까 — 바운딩 높이 기준 비율. 모자챙~광대까지가 거울 안의 전부다
EYE_LO, EYE_HI = float(arg("--lo", "0.845")), float(arg("--hi", "0.945"))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(IN))

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if not meshes:
    raise SystemExit(f"메시가 없다: {IN}")

# 원하는 만큼 돌린다 (정면 보정용)
if YAW:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.transform.rotate(value=YAW * 3.14159265358979 / 180.0, orient_axis="Z")
    bpy.context.view_layer.update()

lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo[i], w[i]) for i in range(3)))
        hi = Vector((max(hi[i], w[i]) for i in range(3)))
size = hi - lo
mid = (hi + lo) / 2
print(f"[render] bounds {size.x:.3f} x {size.y:.3f} x {size.z:.3f} (Blender Z-up)")

# 눈 높이 띠 — 세로는 비율로 자르고, 가로는 렌더 비율에 맞춰 넓힌다
band_lo = lo.z + size.z * EYE_LO
band_hi = lo.z + size.z * EYE_HI
cz = (band_lo + band_hi) / 2
band_h = max(1e-4, band_hi - band_lo)
band_w = band_h * (W / H)

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = band_w
cam = bpy.data.objects.new("cam", cam_data)
bpy.context.collection.objects.link(cam)
# 정면 = glTF +Z = Blender -Y. 카메라를 -Y 에 두고 +Y 를 본다
# 가로 중심은 **머리**로 잡는다 — 전체 바운딩의 중심은 팔·핸들에 끌려가 얼굴이 한쪽으로 밀린다
head_xs = []
depsgraph = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    ev = o.evaluated_get(depsgraph)
    mesh = ev.to_mesh()
    for v in mesh.vertices:
        w = o.matrix_world @ v.co
        if band_lo <= w.z <= band_hi:
            head_xs.append(w.x)
    ev.to_mesh_clear()
cx = (min(head_xs) + max(head_xs)) / 2 if head_xs else mid.x
print(f"[render] head band x-center {cx:.4f} (verts {len(head_xs)})")

cam.location = (cx, lo.y - max(size.y, size.x) * 3.0, cz)
cam.rotation_euler = (1.5707963, 0, 0)
bpy.context.scene.camera = cam

scn = bpy.context.scene
scn.render.engine = "BLENDER_WORKBENCH"
scn.render.resolution_x, scn.render.resolution_y = W, H
scn.render.resolution_percentage = 100
scn.render.film_transparent = True
scn.render.image_settings.file_format = "PNG"
scn.render.image_settings.color_mode = "RGBA"
sh = scn.display.shading
sh.light = "STUDIO"
sh.color_type = "TEXTURE"
sh.show_shadows = False
sh.show_cavity = False
sh.show_specular_highlight = True
scn.display.render_aa = "16"

OUT.parent.mkdir(parents=True, exist_ok=True)
scn.render.filepath = str(OUT)
bpy.ops.render.render(write_still=True)
print(f"[render] ✓ {OUT}  ({W}x{H}, yaw {YAW}°, band {EYE_LO}~{EYE_HI})")
