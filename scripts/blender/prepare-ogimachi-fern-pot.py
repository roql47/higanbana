"""Normalize a Tripo prop in a separate Blender scene; preserve source and user scenes."""
from pathlib import Path
import bpy,json
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'assets/tripo/ogimachi-fern-pot'
files=list(source.glob('*.glb'))
if not files:raise RuntimeError('Tripo GLB has not been downloaded')
path=next((p for p in files if p.name=='model_url.glb'),files[0])
scene=bpy.data.scenes.new('Ogimachi_Tripo_Fern_Pot');bpy.context.window.scene=scene
bpy.ops.import_scene.gltf(filepath=str(path))
meshes=[o for o in scene.objects if o.type=='MESH']
points=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector(tuple(min(p[k] for p in points) for k in range(3)));hi=Vector(tuple(max(p[k] for p in points) for k in range(3)))
scale=min(.82/(hi.z-lo.z),.70/max(hi.x-lo.x,hi.y-lo.y));center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
root=bpy.data.objects.new('fern-pot',None);scene.collection.objects.link(root)
root['source']='Tripo 4486ed20-a7a4-4092-b8f0-f8a74cfb83c6';root['archetype']='fern-pot'
for o in meshes:
    world=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
    for v in o.data.vertices:v.co=(world@v.co-center)*scale
    o.parent=root
    o.data.calc_loop_triangles()
    if len(o.data.loop_triangles)>5000:
        bpy.context.view_layer.objects.active=o
        mod=o.modifiers.new('Game polygon budget','DECIMATE');mod.ratio=5000/len(o.data.loop_triangles)
        bpy.ops.object.modifier_apply(modifier=mod.name)
for image in {n.image for o in meshes for m in o.data.materials if m and m.use_nodes for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image}:
    w,h=image.size
    if max(w,h)>512:image.scale(round(w*512/max(w,h)),round(h*512/max(w,h)))
    image.pack()
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in meshes:o.select_set(True)
output=ROOT/'public/models/ogimachi/fern-pot.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/fern-pot.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'source':str(path),'bytes':output.stat().st_size,'scale':scale,'meshes':len(meshes)}))
