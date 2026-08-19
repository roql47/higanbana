"""
Mixamo FBX → GLB 변환 (Blender 헤드리스)
  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/mixamo/convert.py -- <입력폴더> <출력폴더>

입력폴더 규칙:
  - 스킨 포함 FBX 하나 (파일명에 'skin' 또는 첫 번째 파일): 리깅된 캐릭터 → <출력>/character_mixamo.glb
  - 나머지 FBX(Without Skin): 애니메이션 → <출력>/anim/<파일명>.glb  (클립 이름 = 파일명)
Mixamo 다운로드 설정: Format FBX Binary, Skin: With/Without, FPS 30, Keyframe Reduction none
"""
import bpy, sys, os, glob, re

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
src_dir = argv[0] if argv else "assets/mixamo/in"
out_dir = argv[1] if len(argv) > 1 else "assets/mixamo/out"
os.makedirs(os.path.join(out_dir, "anim"), exist_ok=True)

files = sorted(glob.glob(os.path.join(src_dir, "*.fbx")))
if not files:
    print("NO_FBX_IN", src_dir); sys.exit(1)
skin = next((f for f in files if "skin" in os.path.basename(f).lower() and "without" not in os.path.basename(f).lower()), files[0])

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_fbx(path):
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False, ignore_leaf_bones=True)

def clean_name(path):
    n = os.path.splitext(os.path.basename(path))[0]
    n = re.sub(r"[^A-Za-z0-9_\- ]", "", n).strip().replace(" ", "_").lower()
    return n

# 1) 리깅 캐릭터
reset(); import_fbx(skin)
for a in bpy.data.actions:  # 스킨 파일에 들어온 애니(보통 T-pose 또는 첫 애니)는 제거
    bpy.data.actions.remove(a)
bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "character_mixamo.glb"), export_format='GLB', export_animations=False, export_skins=True, export_apply=True, export_yup=True)
print("CHAR_OK", skin)

# 2) 애니메이션 클립
for f in files:
    if f == skin: continue
    reset(); import_fbx(f)
    name = clean_name(f)
    for a in bpy.data.actions:
        a.name = name
    # 메시가 있으면 지오메트리 제외(용량) — 애니 채널만 필요
    for o in list(bpy.data.objects):
        if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, "anim", name + ".glb"), export_format='GLB', export_animations=True, export_skins=True, export_apply=True, export_yup=True, export_force_sampling=True)
    print("ANIM_OK", name)
print("DONE")
