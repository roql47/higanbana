"""B001 close-range refinement and terrain-study assembly. No production overwrite."""
from pathlib import Path
import bpy,math,json,random
from mathutils import Vector
ROOT=Path('/Users/jay/Claude/3D_motion')
source=ROOT/'scripts/blender/build-ogimachi-hakusuien.py'
# Reuse the authored facade, retaining all unverified-face labels.
ns={'__file__':str(source)}
exec(compile(source.read_text().split('# Merge by material for the game')[0],str(source),'exec'),ns)
scene=ns['scene'];house=ns['current'];box=ns['box'];mesh=ns['mesh'];beam=ns['beam'];mat=ns['material'];wood=ns['wood'];stone=ns['stone'];frame=ns['frame']
scene.name='Phase3_B001_Exterior_Refinement';rng=random.Random(693)
for ob in list(house.children):
 if ob.name.startswith('Cut reed eave bundle'):bpy.data.objects.remove(ob,do_unlink=True)
shell=next(o for o in house.children if o.name.startswith('Timber shell'))
cutter=box('Temporary entrance recess cutter',(1.8,2.04,2.5),(-5,0,1.45),frame)
bpy.context.view_layer.objects.active=shell
cut=shell.modifiers.new('Recess behind entrance','BOOLEAN');cut.operation='DIFFERENCE';cut.object=cutter
bpy.ops.object.modifier_apply(modifier=cut.name);bpy.data.objects.remove(cutter,do_unlink=True)
opening=next(o for o in house.children if o.name.startswith('Entrance dark opening'))
opening.location.x=-4.16;opening.data.materials[0]=mat('Unlit entrance recess',(.006,.005,.004),1)
# Under-eave structure fills the formerly empty shell/roof junction.
for y in [(-8.5+i*.55) for i in range(32)]:
 for side in [-1,1]:
  beam('Visible eave rafter',(side*4.35,y,3.04),(side*5.82,y,3.02),.105,frame)
# Break perfectly rectangular reed ends with small low-poly tapered fibre clumps.
reeds=[mat('Reed end tone '+str(i),c) for i,c in enumerate([(.20,.17,.12),(.29,.25,.18),(.34,.29,.21),(.24,.22,.16)])]
for ob in house.children:
 if ob.type=='MESH' and ob.name.startswith('Curved deep kaya roof'):
  ob.data.materials.append(reeds[0])
  for poly in ob.data.polygons:
   if abs(poly.normal.z)<.15:poly.material_index=1;poly.use_smooth=False
 if ob.type=='MESH' and ob.name.startswith('Ridge cap'):
  ob.data.materials[0]=reeds[0]
for side in [-1,1]:
 for i in range(600):
  y=-9.7+i*19.4/599;z=3.73-.78+rng.uniform(-.025,.025);x=side*5.95
  box('Fine cut reed tuft',(.055,.026,rng.uniform(.035,.07)),(x,y,z),reeds[i%4])
# Mortar-free apron and individual irregular foundation stones seen at street edge.
for i in range(44):
 y=-8.8+i*.41
 if abs(y)<1.5:continue
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=(-5.38,y,.06));ob=bpy.context.object;ob.name='Exposed foundation course';ob.scale=(rng.uniform(.22,.38),rng.uniform(.19,.27),rng.uniform(.09,.16));ob.parent=house;ob.data.materials.append(stone)
# Timber bevels only on structural/door parts, preserving fine lattice dimensions.
for ob in list(house.children):
 if ob.type=='MESH' and any(k in ob.name for k in ['post','jamb','header','Bench seat','threshold']):
  mod=ob.modifiers.new('Worn edge highlight','BEVEL');mod.width=.012;mod.segments=2
# Consolidate by material after applying modifiers for a practical GLB.
for ob in list(house.children):
 if ob.type=='MESH':
  bpy.context.view_layer.objects.active=ob
  for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
materials=set(o.data.materials[0] for o in house.children if o.type=='MESH')
for material in materials:
 objects=[o for o in house.children if o.type=='MESH' and o.data.materials[0]==material]
 bpy.ops.object.select_all(action='DESELECT')
 for ob in objects:ob.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 objects[0].name='B001_refined_'+material.name
out=ROOT/'artifacts/ogimachi-phases';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='DESELECT');house.select_set(True)
for ob in house.children:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out/'phase3-hakusuien.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
world=bpy.data.worlds.new('B001 soft daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.7,.8,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
sun=bpy.data.lights.new('B001 sunlight','SUN');sun.energy=2;sun.angle=.2;ob=bpy.data.objects.new('B001 sunlight',sun);scene.collection.objects.link(ob);ob.rotation_euler=(.6,-.5,-.5)
cam=bpy.data.cameras.new('B001 review');ob=bpy.data.objects.new('B001 review',cam);scene.collection.objects.link(ob);scene.camera=ob;ob.location=(-23,-19,10);target=Vector((0,0,4));ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler();cam.lens=43
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.render.filepath=str(out/'phase3-house-close.png')
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/phase3-hakusuien.blend'),{scene},fake_user=True)
print({'scene':scene.name,'meshes':len([o for o in house.children if o.type=='MESH']),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in house.children if o.type=='MESH'),'glb_bytes':(out/'phase3-hakusuien.glb').stat().st_size})
