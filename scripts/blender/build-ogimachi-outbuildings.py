"""Author three low outbuilding volumes in an isolated Blender scene via local MCP."""
from pathlib import Path
import math,json
import bpy
ROOT=Path(__file__).resolve().parents[2]
scene=bpy.data.scenes.new('Ogimachi_Low_Outbuildings');scene['codex_authored']='ogimachi-outbuildings-v1';bpy.context.window.scene=scene
def material(name,color):
    existing=[m for m in bpy.data.materials if m.name.startswith(name)]
    if existing:return existing[-1]
    m=bpy.data.materials.new(name);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
wood=material('Smoke-aged cedar',(.16,.12,.08));frame=material('Dark structural timber',(.065,.044,.03));tile=material('Weathered grey roof tile',(.12,.15,.15));stone=material('Foundation granite',(.28,.29,.25));glass=material('Outbuilding dark window',(.10,.14,.13));rope=material('Fresh split firewood',(.34,.25,.13))
root=None;roots=[]
def box(name,dimensions,position,mat,rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=position);o=bpy.context.object;o.name=name;o.dimensions=dimensions;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:
        axis=max(range(3),key=lambda a:abs(p.normal[a]))
        for li in p.loop_indices:
            co=o.data.vertices[o.data.loops[li].vertex_index].co;o.data.uv_layers.active.data[li].uv=((co.y if axis==0 else co.x)/2,(co.y if axis==2 else co.z)/3)
    o.parent=root;o.data.materials.append(mat)
    if rotation:o.rotation_euler=rotation
    return o
def roof(w,d,base,rise,shed=False):
    slopes=[(0,w,rise/2)] if shed else [(-1,w/2,rise/2),(1,w/2,rise/2)]
    for side,run,half in slopes:
        slope=math.atan2(rise,run);length=math.hypot(run,rise)
        box('Weathered standing seam roof',(length+.45,d+.7,.15),(side*w/4,0,base+half),tile,(0,slope if shed else side*slope,0))
        for j in range(round(d/.62)):
            yy=-d/2+j*.62
            box('Roof seam',(length+.45,.025,.05),(side*w/4,yy,base+half+.11),frame,(0,slope if shed else side*slope,0))
def build(kind,w,d):
    global root
    root=bpy.data.objects.new(kind,None);root['archetype']=kind;scene.collection.objects.link(root);roots.append(root)
    height=2.3 if kind=='workshop' else 1.9
    box('Low stone footing',(w,d,.18),(0,0,.09),stone)
    if kind!='woodshed':box('Weathered boarded walls',(w,d,height),(0,0,height/2+.18),wood)
    else:
        box('Shed back boarding',(w,.12,height),(0,d/2,height/2+.18),wood)
        for x in [-w/2,w/2]:box('Shed side boarding',(.12,d,height),(x,0,height/2+.18),wood)
        for row in range(5):
            for column in range(9):box('Stacked split wood',(.45,1.5,.26),(-2.3+column*.55,d*.13,.33+row*.29),rope)
    for x in [-w/2,w/2]:
        for y in [-d/2,d/2]:box('Timber corner post',(.16,.16,height+.15),(x,y,height/2+.18),frame)
    if kind!='woodshed':
        box('Sliding barn door',(1.7,.08,1.75),(-w*.18,-d/2-.055,1.05),frame)
        for x in [-w*.18-.65,-w*.18,-w*.18+.65]:box('Door batten',(.08,.045,1.7),(x,-d/2-.11,1.05),wood)
        for y in [-d*.2,d*.25]:
            box('Side window frame',(.08,1.5,.9),(w/2+.05,y,1.45),frame);box('Recessed dark glazing',(.035,1.34,.73),(w/2+.10,y,1.45),glass)
            box('Window central mullion',(.05,.06,.8),(w/2+.14,y,1.45),wood)
    roof(w,d,height+.18,.85 if kind!='workshop' else 1.6,kind!='workshop')
    for mat in [wood,frame,tile,stone,glass,rope]:
        objects=[o for o in root.children if o.type=='MESH' and o.data.materials[0]==mat]
        if len(objects)<2:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=kind+'_'+mat.name
for kind,w,d in [('lean-to',8,9),('workshop',8,10),('woodshed',6,5)]:build(kind,w,d)
bpy.ops.object.select_all(action='DESELECT')
for r in roots:
    r.select_set(True)
    for o in r.children:o.select_set(True)
out=ROOT/'public/models/ogimachi/outbuildings.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True,export_apply=True)
for i,r in enumerate(roots):r.location.x=i*15
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/outbuildings.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'glb':str(out),'bytes':out.stat().st_size,'archetypes':[r['archetype'] for r in roots]}))
