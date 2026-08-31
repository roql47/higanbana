"""로쿠로쿠비 원본의 분리 조각·UV 색을 진단해 긴 머리카락 리깅 마스크를 튜닝한다."""
import bpy
import numpy as np

SRC = "/Users/jay/Claude/3D_motion/assets/tripo/yokai-rokurokubi/source.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.data.objects if o.type == 'MESH'][0]
me = mesh.data
n = len(me.vertices)

co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
x, y, z = co[:, 0], co[:, 1], co[:, 2]

# 연결 성분
parent = np.arange(n)
def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]; a = parent[a]
    return a
edges = np.empty(len(me.edges) * 2, dtype=np.int64)
me.edges.foreach_get('vertices', edges); edges = edges.reshape(-1, 2)
for a, b in edges:
    ra, rb = find(a), find(b)
    if ra != rb: parent[ra] = rb
roots = np.array([find(i) for i in range(n)])
uniq, counts = np.unique(roots, return_counts=True)
main = uniq[counts.argmax()]

# 루프 UV를 정점 UV로 평균낸 뒤 베이스컬러 휘도를 샘플한다.
loop_v = np.empty(len(me.loops), dtype=np.int64)
me.loops.foreach_get('vertex_index', loop_v)
loop_uv = np.empty(len(me.uv_layers.active.data) * 2)
me.uv_layers.active.data.foreach_get('uv', loop_uv); loop_uv = loop_uv.reshape(-1, 2)
uv_sum = np.zeros((n, 2)); uv_n = np.zeros(n)
np.add.at(uv_sum, loop_v, loop_uv); np.add.at(uv_n, loop_v, 1)
uv = uv_sum / np.maximum(1, uv_n)[:, None]

image = next(node.image for node in me.materials[0].node_tree.nodes if node.type == 'TEX_IMAGE' and node.image.colorspace_settings.name == 'sRGB')
iw, ih = image.size
pixels = np.empty(iw * ih * 4, dtype=np.float32); image.pixels.foreach_get(pixels); pixels = pixels.reshape(ih, iw, 4)
px = (np.mod(uv[:, 0], 1) * (iw - 1)).astype(int)
py = (np.mod(uv[:, 1], 1) * (ih - 1)).astype(int)
rgb = pixels[py, px, :3]
lum = rgb @ np.array([0.2126, 0.7152, 0.0722])

rows = []
for comp, count in zip(uniq, counts):
    if comp == main: continue
    m = roots == comp
    rows.append((
        float(lum[m].mean()), int(count),
        float(x[m].min()), float(x[m].max()), float(y[m].min()), float(y[m].max()),
        float(z[m].min()), float(z[m].max()), int(comp),
    ))

print('COMPONENTS', len(uniq), 'main', int(counts.max()), '/', n)
print('DARK UPPER COMPONENTS: lum count xmin xmax ymin ymax zmin zmax root')
upper = [r for r in rows if r[0] < 0.24 and r[7] > 0.62]
for r in sorted(upper, key=lambda q: (-q[1], q[0]))[:160]: print(' '.join(f'{v:.4f}' if isinstance(v, float) else str(v) for v in r))
for limit in [0.08, 0.12, 0.16, 0.20, 0.24, 0.30]:
    m = (lum < limit) & (z > 0.58)
    print('VERTS lum<', limit, 'z>.58', int(m.sum()), 'back(y>0)', int((m & (y > 0)).sum()), 'front', int((m & (y <= 0)).sum()))
