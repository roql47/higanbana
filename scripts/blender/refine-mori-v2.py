"""Refine the existing B003 facade study in a separate, editable scene."""
from pathlib import Path
import bpy,math,json
ROOT=Path('/Users/jay/Claude/3D_motion')
original=bpy.context.scene
assert not bpy.app.is_job_running('RENDER')
ns={'__file__':str(ROOT/'scripts/blender/build-ogimachi-mori.py')}
source=(ROOT/'scripts/blender/build-ogimachi-mori.py').read_text().split('# Merge per material')[0]
exec(compile(source,ns['__file__'],'exec'),ns)
scene=ns['scene'];root=ns['current'];scene.name='B003_Mori_Facade_V2'
root['revision']='facade-v2';root['unverified']='Rear, roof pitch, exact dimensions; interpreted from prior 2010 facade study'
box=ns['box'];cedar=ns['cedar'];metal=ns['aluminium'];frame=ns['frame']
# Window sills, reveals and drip edges give existing openings depth without moving bays.
for y,width in [(-5.05,2.28),(-2.52,2.38),(.10,2.35),(2.53,2.08)]:
 box('V2 upper sill',(.24,width+.14,.065),(5.04,y,4.055),cedar)
 box('V2 upper drip edge',(.22,width+.18,.04),(5.06,y,5.68),metal)
 for side in [-1,1]:box('V2 upper jamb reveal',(.20,.055,1.55),(4.97,y+side*(width/2+.025),4.86),cedar)
for y in [-5.05,-2.65,2.62]:
 width=1.90 if y==2.62 else 2.22
 box('V2 lower sill',(.22,width+.12,.07),(5.035,y,.435 if y==2.62 else .415),cedar)
# Eave fascia and proper gutter brackets along the existing roof edges.
for side in [-1,1]:
 box('V2 eave fascia',(.10,14.12,.22),(side*5.65,0,6.29),cedar)
 for y in [-6,-4,-2,0,2,4,6]:box('V2 gutter bracket',(.20,.028,.06),(side*5.64,y,6.225),metal)
for obj in list(root.children):
 if obj.type!='MESH':continue
 if any(t in obj.name for t in ['post','rail','sash','sill','board','shelf','sign','fascia','threshold','reveal']):
  bevel=obj.modifiers.new('V2 softened edges','BEVEL');bevel.width=.0035;bevel.segments=2
 elif 'Folded fabric curtain' in obj.name:
  solid=obj.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.002
  for p in obj.data.polygons:p.use_smooth=True
 elif 'Flower pot' in obj.name:
  bevel=obj.modifiers.new('Pot rim rounding','BEVEL');bevel.width=.012;bevel.segments=3
# Keep the editable scene separate; runtime meshes are evaluated copies grouped by material.
scene.unit_settings.system='METRIC';scene.render.engine='CYCLES';scene.cycles.samples=24
scene.world=bpy.data.worlds.new('Mori daylight');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.6,.68,.8,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
sun=bpy.data.objects.new('Mori sunlight',bpy.data.lights.new('Mori sun','SUN'));scene.collection.objects.link(sun);sun.data.energy=2.3;sun.data.angle=.10;sun.rotation_euler=(.55,-.5,-.65)
from mathutils import Vector
camera=bpy.data.objects.new('Mori facade camera',bpy.data.cameras.new('Mori lens'));scene.collection.objects.link(camera);camera.location=(23,-20,12);camera.rotation_euler=(Vector((0,0,3.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=48;scene.camera=camera
scene.render.resolution_x=1000;scene.render.resolution_y=800;scene.render.resolution_percentage=100
out=ROOT/'artifacts/ogimachi-phases/mori-v2';out.mkdir(parents=True,exist_ok=True)
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/B003-mori-v2.blend'),{scene},fake_user=True,compress=True)
deps=bpy.context.evaluated_depsgraph_get();runtime=bpy.data.scenes.new('Mori V2 runtime');rt=bpy.data.objects.new('mori-workshop',None);runtime.collection.objects.link(rt)
for k,v in root.items():rt[k]=v
groups={}
for obj in root.children:
 if obj.type!='MESH':continue
 me=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps);me.transform(obj.matrix_local)
 ob=bpy.data.objects.new(obj.name+' runtime',me);runtime.collection.objects.link(ob);ob.parent=rt
 groups.setdefault(me.materials[0].name,[]).append(ob)
bpy.context.window.scene=runtime
for objects in groups.values():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(out/'mori-workshop-v2.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True)
bpy.context.window.scene=original
def render():
 try:
  bpy.context.window.scene=scene;scene.render.filepath=str(out/'facade.png');bpy.ops.render.render(write_still=True)
 finally:bpy.context.window.scene=original
 return None
bpy.app.timers.register(render,first_interval=.5)
print(json.dumps({'scene':scene.name,'editableObjects':len(scene.objects),'runtimeGroups':len(groups),'render':'scheduled'}))
