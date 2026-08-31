"""
로쿠로쿠비 리깅 — 목 본 체인 + 팔 (2026-08-22, 2차)

  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender/rig-rokurokubi.py
  node scripts/optimize-glb.ts --in assets/tripo/yokai-rokurokubi/rigged.glb --out public/models/yokai-rokurokubi.glb --tex 1024

입력: assets/tripo/yokai-rokurokubi/source.glb (Tripo 정적 · 목이 이미 길다 · 29k tris)
출력: rigged.glb — Root/Spine/Chest + Neck_00..31(**32마디**) + Head + Hair_L/R + L_Arm/R_Arm, 39본

## 1차(6마디 · 선형 밴드)에서 배운 것 — 사용자 리포트 반영
- **마디 6개는 부족하다.** 늘어난 목에서 마디당 굽힘이 커져 관절이 각지고, 웨이트 전환 구간
  (인접 2본 선형)이 마디 이동만큼 찢어져 **가느다란 실**이 됐다 → 32마디 + **텐트 웨이트**
  (한 정점이 이웃 3마디에 걸친다. 전환이 세 구간에 분산돼 늘여도 매끈하다)
- **팔 본이 없어서 T포즈 그대로였다** → L_Arm/R_Arm 추가. 어깨(±0.10)에서 손끝(±0.37)까지
  한 본씩 — 제단 뒤 실루엣이라 팔꿈치는 안 나눈다. 소매 천은 |x|·z 이중 페더로 팔에 얹는다

## 왜 본 히트가 아니라 절차적 웨이트인가 (1차와 동일)
`ARMATURE_AUTO` 가 조용히 실패한다 — 이 메시는 **연결 성분 2,365 개**(머리카락·장신구 전부
별도 섬)라 본 히트가 해를 못 찾는다. 목이 축 위의 깨끗한 기둥이라 절차 쪽이 결정적이다.
머리카락은 UV 베이스컬러와 연결 성분 위치로 골라 **Hair_L/R 전용 본**에 묶는다. 목 체인에
걸면 머리카락과 목살이 한 덩어리로 굽는 문제가 실제 플레이에서 드러났다.

## 엔진 구동 계약 (사용자 요구: 이동할 때 목·얼굴이 뱀처럼)
  · 굽힘은 **한 축**(굽힘 평면 법선 = up × 타깃방향) 사원수로 — 오일러 합성은 평면이 돈다(실측)
  · 분배는 앞으로 완만히(마디 12개면 극단적으로 몰 필요가 없다) — anim-rokurokubi-preview.py 참고
  · 파도 = 위상차 사인 A·sin(t·ω − i·φ) · 늘이기 = 마디 +Y translate · Head 는 lookAt 마무리
  · 본 이름: Root · Spine · Chest · Neck_00..Neck_31 · Head · Hair_L/R · L_Arm · R_Arm (y-up · 정면 +Z)
"""
import bpy, math, mathutils, os
import numpy as np

SRC = "/Users/jay/Claude/3D_motion/assets/tripo/yokai-rokurokubi/source.glb"
OUT = "/Users/jay/Claude/3D_motion/assets/tripo/yokai-rokurokubi/rigged.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
mesh.name = "Rokurokubi"
me = mesh.data
n = len(me.vertices)
co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
x, y, z = co[:, 0], co[:, 1], co[:, 2]
rad = np.sqrt(x**2 + y**2)

def smoothstep(a, b, v):
    t = np.clip((v - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)

# ---------- 연결 성분 (머리카락 섬 → Head) ----------
parent = np.arange(n)
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
ek = np.empty(len(me.edges) * 2, dtype=np.int64)
me.edges.foreach_get('vertices', ek); ek = ek.reshape(-1, 2)
for a, b in ek:
    ra, rb = find(a), find(b)
    if ra != rb: parent[ra] = rb
roots = np.array([find(i) for i in range(n)])
uniq, counts = np.unique(roots, return_counts=True)
main = uniq[counts.argmax()]
print("COMPONENTS", len(uniq), "main", counts.max(), "/", n)

# UV 베이스컬러의 휘도 — 단일 재질 모델이라 검은 머리와 살/옷을 색으로 한 번 더 구분해야 한다.
loop_v = np.empty(len(me.loops), dtype=np.int64)
me.loops.foreach_get('vertex_index', loop_v)
loop_uv = np.empty(len(me.uv_layers.active.data) * 2)
me.uv_layers.active.data.foreach_get('uv', loop_uv); loop_uv = loop_uv.reshape(-1, 2)
uv_sum = np.zeros((n, 2)); uv_n = np.zeros(n)
np.add.at(uv_sum, loop_v, loop_uv); np.add.at(uv_n, loop_v, 1)
uv = uv_sum / np.maximum(1, uv_n)[:, None]
image = next(node.image for node in me.materials[0].node_tree.nodes
             if node.type == 'TEX_IMAGE' and node.image.colorspace_settings.name == 'sRGB')
iw, ih = image.size
pixels = np.empty(iw * ih * 4, dtype=np.float32)
image.pixels.foreach_get(pixels); pixels = pixels.reshape(ih, iw, 4)
px = (np.mod(uv[:, 0], 1) * (iw - 1)).astype(int)
py = (np.mod(uv[:, 1], 1) * (ih - 1)).astype(int)
rgb = pixels[py, px, :3]
lum = rgb @ np.array([0.2126, 0.7152, 0.0722])

# ---------- 본 배치 ----------
NECK_N = 32
z0, z1 = 0.63, 0.80
BONES = [("Root", (0,0,0.00), (0,0,0.30), None),
         ("Spine", (0,0,0.30), (0,0,0.58), "Root"),
         ("Chest", (0,0,0.58), (0,0,z0), "Spine")]
for i in range(NECK_N):
    a = z0 + (z1-z0)*i/NECK_N; b = z0 + (z1-z0)*(i+1)/NECK_N
    BONES.append((f"Neck_{i:02d}", (0,0,a), (0,0,b), f"Neck_{i-1:02d}" if i else "Chest"))
BONES.append(("Head", (0,0,z1), (0,0,0.98), f"Neck_{NECK_N-1:02d}"))
# 머리카락은 Head 를 부모로 따라가되 목 체인에는 웨이트하지 않는다. 아래를 향한 두 본을
# 좌우 가닥에 나눠 엔진에서 서로 다른 위상·관성으로 흔든다.
BONES.append(("Hair_L", (0.035,0.008,0.91), (0.035,0.018,0.71), "Head"))
BONES.append(("Hair_R", (-0.035,0.008,0.91), (-0.035,0.018,0.71), "Head"))
# 팔 — 어깨에서 손끝. 어깨 피벗이 몸에 너무 붙으면 소매 뿌리가 접힌다
BONES.append(("L_Arm", (0.10,0,0.60), (0.37,0,0.585), "Chest"))
BONES.append(("R_Arm", (-0.10,0,0.60), (-0.37,0,0.585), "Chest"))
names = [b[0] for b in BONES]
IDX = {nm: i for i, nm in enumerate(names)}

arm_data = bpy.data.armatures.new("RokuroRig")
arm = bpy.data.objects.new("RokuroRig", arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
for nm, h, t, par in BONES:
    b = arm_data.edit_bones.new(nm)
    b.head = h; b.tail = t
    if par: b.parent = arm_data.edit_bones[par]; b.use_connect = (nm.startswith("Neck") or nm == "Head" or nm in ("Spine","Chest"))
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 절차적 웨이트 ----------
w = np.zeros((n, len(names)))

# 축 체인(Root→Head)의 텐트 웨이트 — 중심 z 들에 대해 폭 1.6밴드의 텐트, 이웃 3본에 걸친다
chain = ["Root", "Spine", "Chest"] + [f"Neck_{i:02d}" for i in range(NECK_N)] + ["Head"]
centers = np.array([ (BONES[IDX[nm]][1][2] + BONES[IDX[nm]][2][2]) / 2 for nm in chain ])
band = (z1 - z0) / NECK_N
for ci, nm in enumerate(chain):
    lo = centers[ci-1] if ci > 0 else -1.0
    hi = centers[ci+1] if ci < len(chain)-1 else 2.0
    # 이웃 중심까지 선형으로 죽는 텐트 (끝은 클램프)
    t_up = np.clip((z - lo) / max(1e-6, centers[ci] - lo), 0, 1)
    t_dn = np.clip((hi - z) / max(1e-6, hi - centers[ci]), 0, 1)
    w[:, IDX[nm]] = np.minimum(t_up, t_dn)
w[z <= centers[0], IDX["Root"]] = 1
w[z >= centers[-1], IDX["Head"]] = 1

# 반경 페더 — 목 밴드 웨이트인데 기둥 밖(어깨·옷깃)이면 Chest 로 (하드 컷은 옷깃을 찢었다).
# **머리 영역(z>0.78)에는 안 건다** — 얼굴 주변 머리카락(rad 0.05~0.12)까지 Chest 로 끌려가
# 헤어라인이 찢어진다
g = smoothstep(0.075, 0.125, rad) * (1 - smoothstep(0.76, 0.80, z))
neck_cols = [IDX[f"Neck_{i:02d}"] for i in range(NECK_N)] + [IDX["Head"]]
neck_sum = w[:, neck_cols].sum(axis=1)
for c in neck_cols: w[:, c] *= (1 - g)
w[:, IDX["Chest"]] += neck_sum * g

# 팔 — |x| 와 z 의 이중 페더. 소매 천(아래로 처진 큰 천)도 팔을 따른다
ax = smoothstep(0.11, 0.20, np.abs(x)) * smoothstep(0.26, 0.55, z)   # 안쪽 소매: 길게 페더 — 짧으면 소매가 각지게 접힌다(스틸 실측)
ax = np.maximum(ax, smoothstep(0.23, 0.29, np.abs(x)))               # 바깥 소매·손: z 무관하게 팔
ax = np.clip(ax, 0, 1)
for side, col in ((1, IDX["L_Arm"]), (-1, IDX["R_Arm"])):
    m = (np.sign(x) == side) & (ax > 0)
    take = ax[m]
    w[m] *= (1 - take)[:, None]
    w[m, col] = take

# 긴 머리카락 → Hair_L/R. 모델 정면은 -Y라 뒤통수/등 쪽은 +Y다. 검은색·머리 높이까지
# 이어지는 조각·목 축 근처·뒤쪽이라는 네 조건을 모두 만족해야 옷깃/눈/소매를 오인하지 않는다.
hair_roots = set()
hair = 0
for comp in uniq:
    if comp == main: continue
    m = roots == comp
    if (lum[m].mean() < 0.27 and z[m].max() > 0.78
            and np.abs(x[m]).max() < 0.09 and y[m].max() > 0.0):
        col = IDX["Hair_L"] if x[m].mean() >= 0 else IDX["Hair_R"]
        w[m] = 0; w[m, col] = 1
        hair_roots.add(int(comp)); hair += int(m.sum())
print("HAIR→Hair_L/R", hair, "components", len(hair_roots))

# 나머지 완전한 머리 영역 조각은 Head 통짜 바인딩 — 얼굴·비녀·장식은 보조 헤어 흔들림을 타지 않는다.
ornaments = 0
for comp in uniq:
    if comp == main or int(comp) in hair_roots: continue
    m = roots == comp
    if z[m].min() > 0.78:
        w[m] = 0; w[m, IDX["Head"]] = 1; ornaments += int(m.sum())
print("ORNAMENT→Head", ornaments)

# 정규화 + 상위 4개 컷(glTF 한계)
order = np.argsort(-w, axis=1)
mask = np.zeros_like(w)
for k in range(4):
    mask[np.arange(n), order[:, k]] = 1
w *= mask
s = w.sum(axis=1); s[s == 0] = 1
w /= s[:, None]

for nm in names: mesh.vertex_groups.new(name=nm)
for vi in range(n):
    for j in np.nonzero(w[vi])[0]:
        mesh.vertex_groups[names[j]].add([vi], float(w[vi, j]), 'REPLACE')

mod = mesh.modifiers.new("Armature", 'ARMATURE')
mod.object = arm
mesh.parent = arm

# ---------- 내보내기 (rest 그대로 — 포즈는 엔진/프리뷰가 건다) ----------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True,
                          export_skins=True, export_animations=False, export_yup=True)
print("EXPORTED", OUT)
