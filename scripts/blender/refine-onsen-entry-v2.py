"""B004 entrance pass from the village office facade photograph. Dimensions estimated.
Run in a separate Blender background process; retains source and door hierarchy.
"""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/authored/ogimachi/B004-onsen.blend'))
scene=next(s for s in bpy.data.scenes if any(o.get('archetype')=='onsen' for o in s.objects))
bpy.context.window.scene=scene
root=next(o for o in scene.objects if o.get('archetype')=='onsen')
scene.name='B004_Onsen_Entry_v2'
root['reference']='https://www.vill.shirakawa.lg.jp/secure/1171/kiji_shirakawagonoyu01.jpg'
root['scope']='entry frame and fixed screens; centre noren shortened; unmeasured rear retained'
# The photograph has two long side curtains and a short centre valance.
for ob in root.children:
 if ob.type=='MESH' and any('indigo entrance linen' in m.name for m in ob.data.materials):
  for v in ob.data.vertices:
   p=ob.matrix_world@v.co
   if abs(p.y+14)<.43 and p.z<2.5:
    p.z+=.52;v.co=ob.matrix_world.inverted()@p
cedar=next(m for m in bpy.data.materials if 'Onsen horizontal cedar' in m.name)
warm=cedar.copy();warm.name='B004 warm entrance wood'
p=warm.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.8
for link in list(warm.node_tree.links):
 if link.to_socket==p.inputs['Base Color']:warm.node_tree.links.remove(link)
p.inputs['Base Color'].default_value=(.36,.21,.10,1)
created=[]
def box(name,loc,size):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.parent=root;o.data.materials.append(warm)
 # World-scaled wood UV along the pillar / rail.
 for face in o.data.polygons:
  for li in face.loop_indices:
   v=o.data.vertices[o.data.loops[li].vertex_index].co
   o.data.uv_layers.active.data[li].uv=(v.y*.55,v.z*.55)
 created.append(o);return o
for side in [-1,1]:
 y=-14+side*2.48
 box('B004 entry jamb',(-6.88,y,1.55),(.24,.20,2.78))
 # Fixed screen outside the existing animated doorway.
 y=-14+side*2.86
 for k in range(7):box('B004 fixed screen slat',(-6.79,y-.25+k/12,1.64),(.09,.027,2.35))
 for zz in [.46,1.24,2.82]:box('B004 screen rail',(-6.83,y,zz),(.12,.59,.065))
box('B004 entry lintel',(-6.88,-14,2.97),(.25,5.15,.18))
bpy.ops.object.select_all(action='DESELECT')
for o in created:o.select_set(True)
bpy.context.view_layer.objects.active=created[0];bpy.ops.object.join();created[0].name='B004_entry_fixed_timber'
# Correct broad wall UVs: reference siding runs horizontally, not vertically.
for ob in root.children:
 if ob.type!='MESH' or not any('horizontal cedar' in m.name for m in ob.data.materials):continue
 for face in ob.data.polygons:
  if abs(face.normal.x)<.9 or face.area<2:continue
  for li in face.loop_indices:
   v=ob.matrix_world@ob.data.vertices[ob.data.loops[li].vertex_index].co
   ob.data.uv_layers.active.data[li].uv=(v.z*.48,v.y*.22)
# Save/export model before staging review lighting.
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/onsen-v2.glb'),export_format='GLB',use_selection=True,export_extras=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'assets/authored/ogimachi/B004-onsen-v2.blend'))
# Independent 900px review; source active desktop scene is untouched.
world=bpy.data.worlds.new('B004 review daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.69,.78,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
bpy.ops.object.light_add(type='AREA',location=(-15,-19,13));bpy.context.object.data.energy=1800;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=10
bpy.context.object.rotation_euler=(Vector((-6,-14,2))-bpy.context.object.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(-19,-23,6));cam=bpy.context.object;cam.rotation_euler=(Vector((-6.6,-14,2.5))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=42;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.resolution_x=900;scene.render.resolution_y=600;scene.render.resolution_percentage=100
out=ROOT/'artifacts/ogimachi-phases/onsen-v2';out.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(out/'entry.png');bpy.ops.render.render(write_still=True)
