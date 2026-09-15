"""Dense facade detailing using existing bays; hidden elevations remain interpreted."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/jay/Claude/3D_motion');original=bpy.context.scene
assert not bpy.app.is_job_running('RENDER')
source=bpy.data.scenes['B003_Mori_Facade_V2'];scene=source.copy();scene.name='B003_Mori_Facade_V3'
# Independent objects preserve the previous editable version.
mapping={}
for old in list(scene.objects):
 ob=old.copy();scene.collection.objects.unlink(old);scene.collection.objects.link(ob);mapping[old]=ob
for old,ob in mapping.items():
 if old.parent in mapping:ob.parent=mapping[old.parent]
scene.camera=mapping[source.camera]
root=next(o for o in scene.objects if o.get('osm_id')==236248644);root['revision']='facade-v3'
def mat(needle):return next(m for o in root.children if o.type=='MESH' for m in o.data.materials if m and needle in m.name)
wood=mat('weathered grey brown');metal=mat('aged aluminium');dark=mat('Dark structural');leaf=mat('potted foliage')
groups={}
def poly(name,verts,faces,material):
 vs,fs=groups.setdefault(material,([],[]));offset=len(vs);vs.extend(verts);fs.extend(tuple(i+offset for i in f) for f in faces)
def box(name,loc,dim,material):
 x,y,z=loc;a,b,c=[d/2 for d in dim]
 vs=[(x+dx*a,y+dy*b,z+dz*c) for dx,dy,dz in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
 poly(name,vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material)
# Individually divided timber bands, with restrained joints around the established openings.
for z,h in [(3.48,.30),(5.95,.34),(.35,.12)]:
 for i in range(79):
  y=-6.24+i*.158;box('Facade board',(4.99,y,z),(.055,.151,h),wood)
for y in [-6.3,-3.8,-1.15,1.4,3.7,6.3]:
 for z in [3.18,3.72,6.12]:
  box('Beam joint plate',(5.025,y,z),(.026,.13,.19),dark)
  for dz in [-.055,.055]:box('Joint fastener',(5.042,y,z+dz),(.015,.022,.022),metal)
# Rails, meeting stiles, locks and recessed handles within existing window openings.
for y,width in [(-5.05,2.22),(-2.65,2.22),(2.62,1.90)]:
 for z in [.46,2.18]:
  for dx in [0,.05]:box('Sash double track',(5.06+dx,y,z),(.027,width+.06,.023),metal)
 box('Meeting stile',(5.065,y,1.32),(.065,.05,1.73),metal)
 box('Latch base',(5.105,y,1.31),(.018,.075,.10),dark)
 box('Window latch',(5.122,y,1.31),(.024,.025,.064),metal)
 for side in [-1,1]:box('Recessed window pull',(5.095,y+side*.10,1.15),(.014,.018,.18),dark)
for side in [-1,1]:
 y=side*1.48
 box('Entry iron pull shadow',(5.112,y,1.22),(.024,.060,.25),dark)
 box('Entry pull grip',(5.14,y,1.22),(.035,.018,.18),metal)
for z in [.34,.375]:box('Entry sliding track',(5.12,0,z),(.24,3.05,.018),metal)
# Visible soffit blocking and fascia fastening, keeping the original roof outline.
for i in range(22):
 y=-6.75+i*.63
 box('Under-eave blocking',(5.25,y,6.19),(.64,.055,.11),wood)
 box('Fascia fastening',(5.711,y,6.29),(.018,.025,.025),metal)
# Replace the coarse leaf balls with folded leaves rooted in the same pots.
for o in list(root.children):
 if o.name.startswith('Potted leaf clump'):bpy.data.objects.remove(o,do_unlink=True)
for k,y in enumerate([-1.90,-1.50,1.75,2.25,2.85,3.32]):
 x=5.40+(k%2)*.20
 for j in range(19):
  a=j*2.399;kz=.43+(j%5)*.055;length=.18+(j%4)*.025
  d=Vector((math.cos(a),math.sin(a),.45));side=Vector((-math.sin(a),math.cos(a),0))*.035
  start=Vector((x,y,kz));tip=start+d*length;mid=(start+tip)/2
  ridge=mid+Vector((0,0,.025))
  poly('Folded leaf',[start,mid+side,tip,mid-side,ridge],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],leaf)
for material,(verts,faces) in groups.items():
 me=bpy.data.meshes.new('V3 detail '+material.name);me.from_pydata(verts,[],faces);me.update();me.materials.append(material)
 uv=me.uv_layers.new(name='UVMap')
 for p in me.polygons:
  axis=max(range(3),key=lambda i:abs(p.normal[i]))
  for li in p.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=((co.y if axis==0 else co.x)/2,(co.y if axis==2 else co.z)/3)
 ob=bpy.data.objects.new('V3 facade details '+material.name,me);scene.collection.objects.link(ob);ob.parent=root
 if material!=leaf:
  bevel=ob.modifiers.new('Fine edge highlights','BEVEL');bevel.width=.0015;bevel.segments=2
bpy.context.window.scene=scene
out=ROOT/'artifacts/ogimachi-phases/mori-v3';out.mkdir(parents=True,exist_ok=True)
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/B003-mori-v3.blend'),{scene},fake_user=True,compress=True)
deps=bpy.context.evaluated_depsgraph_get();runtime=bpy.data.scenes.new('Mori V3 runtime');rt=bpy.data.objects.new('mori-workshop',None);runtime.collection.objects.link(rt)
for k,v in root.items():rt[k]=v
parts={}
for obj in root.children:
 if obj.type!='MESH':continue
 me=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps);me.transform(obj.matrix_local)
 ob=bpy.data.objects.new(obj.name+' runtime',me);runtime.collection.objects.link(ob);ob.parent=rt;parts.setdefault(me.materials[0].name,[]).append(ob)
bpy.context.window.scene=runtime
for objects in parts.values():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(out/'mori-workshop-v3.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_extras=True)
bpy.context.window.scene=original
def render():
 try:
  bpy.context.window.scene=scene;scene.render.filepath=str(out/'facade.png');bpy.ops.render.render(write_still=True)
  cam=scene.camera;pos=cam.location.copy();rot=cam.rotation_euler.copy()
  cam.location=(13,-8,4.2);cam.rotation_euler=(Vector((5,0,2.3))-cam.location).to_track_quat('-Z','Y').to_euler()
  scene.render.filepath=str(out/'detail.png');bpy.ops.render.render(write_still=True);cam.location=pos;cam.rotation_euler=rot
 finally:bpy.context.window.scene=original
 return None
bpy.app.timers.register(render,first_interval=.5)
print(json.dumps({'scene':scene.name,'groups':len(parts),'status':'exported; renders scheduled'}))
