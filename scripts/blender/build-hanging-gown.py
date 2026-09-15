"""Author the open, hanging child gown. Deterministic mesh/UVs; no external assets.

Blender --background --python scripts/blender/build-hanging-gown.py
Outputs an editable .blend, raw GLB and a studio preview under assets/authored.
"""
import math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/authored/hanging-gown'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def texture(name, rough=False):
    size = 512
    yy, xx = np.mgrid[0:size, 0:size]
    rng = np.random.default_rng(920)
    noise = rng.random((size, size))
    wet = np.clip((0.23 - yy / size) / 0.23, 0, 1)
    wet *= 0.65 + 0.25 * np.sin(xx * 0.027) + 0.1 * np.sin(xx * 0.11)
    weave = ((xx % 3 == 0) * 0.023 - (yy % 4 == 0) * 0.027)
    cross = (((abs(xx % 30 - 15) < 1) & (abs(yy % 30 - 15) < 4)) |
             ((abs(yy % 30 - 15) < 1) & (abs(xx % 30 - 15) < 4)))
    base = np.array([0.69, 0.76, 0.73])
    rgb = np.broadcast_to(base, (size, size, 3)).copy()
    rgb += (weave + (noise - .5) * .045 - cross * .15 - wet * .29)[:, :, None]
    if rough:
        rgb[:] = (0.94 - wet * .34)[:, :, None]
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, :3] = np.clip(rgb, 0, 1)
    image = bpy.data.images.new(name, size, size)
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(OUT / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    return image

def material(name, color, roughness=0.9, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metal
    return mat

cloth = material('Woven cotton — faded hospital cross, waterline', (.7,.75,.72))
nodes, links = cloth.node_tree.nodes, cloth.node_tree.links
color = nodes.new('ShaderNodeTexImage'); color.image = texture('gown-cotton-basecolor')
rough = nodes.new('ShaderNodeTexImage'); rough.image = texture('gown-cotton-roughness', True)
rough.image.colorspace_settings.name = 'Non-Color'
links.new(color.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])
links.new(rough.outputs['Color'], nodes.get('Principled BSDF').inputs['Roughness'])
seam = material('Cotton binding and seams', (.36,.46,.45))
metal = material('Oxidized wire hanger', (.12,.16,.16), .48, .65)
ivory = material('Bone buttons', (.63,.66,.59), .58)
tagmat = material('Sewn name label', (.77,.75,.65))
# A placeholder texture keeps this primitive's UVs through glTF optimization.
# Runtime replaces it with the selected language's name/date canvas.
tagimage=bpy.data.images.new('Name patch UV placeholder',64,32)
tagpixels=np.ones((32,64,4),dtype=np.float32)
tagpixels[[2,29],:,:3]=.5;tagpixels[:,[2,61],:3]=.5
tagimage.pixels.foreach_set(tagpixels.ravel())
tagimage.pack()
tagtex=tagmat.node_tree.nodes.new('ShaderNodeTexImage');tagtex.image=tagimage
tagmat.node_tree.links.new(tagtex.outputs['Color'],tagmat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def mesh(name, verts, faces, uv, mat, thickness=0):
    data = bpy.data.meshes.new(name); data.from_pydata(verts, [], faces); data.update()
    ob = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(ob)
    data.materials.append(mat)
    layer = data.uv_layers.new(name='GarmentUV')
    for poly in data.polygons:
        poly.use_smooth = True
        for li in poly.loop_indices: layer.data[li].uv = uv[data.loops[li].vertex_index]
    if thickness:
        mod = ob.modifiers.new('Actual cloth thickness, open hem/cuffs', 'SOLIDIFY')
        mod.thickness = thickness
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob

def cord(name, points, radius, mat):
    data = bpy.data.curves.new(name, 'CURVE'); data.dimensions = '3D'
    data.resolution_u = 2; data.bevel_depth = radius; data.bevel_resolution = 2
    spl = data.splines.new('POLY'); spl.points.add(len(points)-1)
    for p, co in zip(spl.points, points): p.co = (*co, 1)
    ob = bpy.data.objects.new(name, data); bpy.context.collection.objects.link(ob)
    data.materials.append(mat)
    return ob

def body_point(a, t):
    # A flared hem, gathered waist, shoulders and a genuinely open neck.
    width = np.interp(t, [0,.5,.76,.88,1], [.30,.235,.235,.275,.095])
    depth = np.interp(t, [0,.6,.85,1], [.105,.073,.082,.048])
    fold = (.010 + .012 * (1-t)) * math.sin(a*9 + t*1.5)
    fold += .007 * math.sin(a*15-t*2)
    x = math.cos(a) * (width + fold)
    y = math.sin(a) * (depth + fold*.6)
    z = .055 + t*.84 + .012*math.sin(a*5+.6)*(1-t)
    z -= max(0,-math.sin(a)) * .033 * t**10
    return (float(x),float(y),float(z))

verts, uv, faces = [], [], []
N, R = 72, 36
for j in range(R+1):
    for i in range(N+1):
        verts.append(body_point(i/N*math.tau,j/R)); uv.append((i/N,j/R))
for j in range(R):
    for i in range(N):
        a=j*(N+1)+i; faces.append((a,a+1,a+N+2,a+N+1))
mesh('Draped open cotton gown',verts,faces,uv,cloth,.0022)
for t, name in [(0.012,'Folded hem binding'),(.988,'Neck binding')]:
    cord(name,[body_point(i/N*math.tau,t) for i in range(N+1)],.0035,seam)

for side in [-1,1]:
    vs, us, fs = [], [], []
    for j in range(17):
        t=j/16
        for i in range(41):
            a=i/40*math.tau
            r=.098 + .008*math.sin(a*5+t*3)
            vs.append((side*(.215+t*.26+math.cos(a)*r*.35), math.sin(a)*r*.75,
                       .767-t*.125+math.cos(a)*r*.87))
            us.append((i/40,.60+t*.35))
    for j in range(16):
        for i in range(40):
            a=j*41+i; fs.append((a,a+1,a+42,a+41))
    mesh('Open short sleeve '+str(side),vs,fs,us,cloth,.0022)
    cord('Turned sleeve cuff '+str(side),vs[-41:],.004,seam)
    cord('Side seam '+str(side),[body_point(0 if side>0 else math.pi,j/32) for j in range(27)],.002,seam)

# A sewn placket follows the cloth instead of floating in front of it.
vs, us = [], []
for j in range(25):
    t=.22+j/24*.74
    for a in [-math.pi/2-.055,-math.pi/2+.055]:
        x,y,z=body_point(a,t); vs.append((x,y-.004,z)); us.append((0 if a< -math.pi/2 else 1,t))
mesh('Sewn front placket',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(24)],us,cloth,.001)
for t in [.38,.50,.62,.74,.85]:
    x,y,z=body_point(-math.pi/2,t)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=1, location=(x,y-.012,z))
    button=bpy.context.object; button.name='Sewn button'; button.scale=(.009,.003,.009); button.data.materials.append(ivory)

mesh('Sewn name-label backing',[(.075,-.108,.58),(.19,-.091,.58),(.19,-.088,.637),(.075,-.105,.637)],
     [(0,1,2,3)],[(0,0),(1,0),(1,1),(0,1)],tagmat,.001)
cord('Wire hanger shoulders',[(-.255,0,.797),(0,0,.935),(.255,0,.797),(-.255,0,.797)],.005,metal)
cord('Hanger hook',[(0,0,.935),(0,0,1.005),(.022,0,1.028),(.053,0,1.025),(.069,0,1.002),(.061,0,.986)],.005,metal)
for side in [-1,1]:
    cord('Back cotton tie '+str(side),[(side*.018,.083,.70),(side*.10,.112,.66),(side*.08,.11,.53),(side*.12,.105,.48)],.006,seam)

# Export mesh objects only, joining by material keeps the runtime draw count bounded.
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.ops.object.convert(target='MESH')
bpy.ops.object.join()
bpy.context.object.name='Haru hanging hospital gown'
bpy.ops.export_scene.gltf(filepath=str(OUT/'hanging-gown.glb'),export_format='GLB',export_yup=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'hanging-gown.blend'))

scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=700; scene.render.resolution_y=800; scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio'); scene.world.color=(.08,.08,.08)
for loc,energy,size in [((1,-2,2),160,2),((-1,-.5,1),75,1),((0,1,1.5),120,1)]:
    bpy.ops.object.light_add(type='AREA',location=loc); light=bpy.context.object
    light.data.energy=energy; light.data.shape='DISK'; light.data.size=size
    light.rotation_euler=(Vector((0,0,.5))-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(1.05,-2.5,1.05)); camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.53))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=1.25; scene.camera=camera
scene.render.filepath=str(OUT/'preview.png'); bpy.ops.render.render(write_still=True)
print('GOWN_ASSET',OUT)
