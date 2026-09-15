"""Normalize accepted Tripo prop into the current facade, retaining source GLB."""
import bpy,math,bmesh,json
from pathlib import Path
from mathutils import Vector
R=Path('/Users/jay/Claude/3D_motion');s=bpy.context.scene;root=next(o for o in s.objects if o.get('osm_id')==236248710)
for o in list(s.objects):
 if o.get('irori_tripo_tanuki'):bpy.data.objects.remove(o,do_unlink=True)
for o in root.children:
 if 'Tanuki' in o.name and not o.get('irori_tripo_tanuki'):o.hide_render=True;o.hide_set(True)
wood=next(o for o in root.children if 'Smoke-aged cedar' in o.name)
if not wood.get('old_tanuki_hat_removed'):
 wood['pre_tripo_mesh']=wood.data.name;wood.data=wood.data.copy();bm=bmesh.new();bm.from_mesh(wood.data)
 faces=[]
 for f in bm.faces:
  points=[wood.matrix_local@v.co for v in f.verts]
  if all(-5.6<p.x<-4.7 and -1.6<p.y<-.7 and 1.16<p.z<1.5 for p in points):faces.append(f)
 bmesh.ops.delete(bm,geom=faces,context='FACES');bm.to_mesh(wood.data);bm.free();wood['old_tanuki_hat_removed']=True
before=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(R/'assets/tripo/irori-weathered-tanuki-v1/model_url.glb'));added=set(s.objects)-before
meshes=[o for o in added if o.type=='MESH'];pts=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
lo=Vector([min(p[k] for p in pts) for k in range(3)]);hi=Vector([max(p[k] for p in pts) for k in range(3)]);center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));scale=1.18/(hi.z-lo.z)
anchor=bpy.data.objects.new('Irori Tripo tanuki',None);s.collection.objects.link(anchor);anchor.parent=root;anchor.location=(-5.24,-.98,.185);anchor.rotation_euler.z=math.pi/2;anchor['irori_tripo_tanuki']=True;anchor['task_id']='a22bf892-8fd7-45f9-a957-d21c31ca413d'
for i,o in enumerate(meshes):
 world=o.matrix_world.copy();o.parent=None;o.matrix_world.identity()
 for v in o.data.vertices:v.co=(world@v.co-center)*scale
 o.parent=anchor;o.name='Irori textured Tripo tanuki '+str(i);o['irori_tripo_tanuki']=True
 for m in o.data.materials:
  if m and m.use_nodes:
   for n in m.node_tree.nodes:
    if n.type=='TEX_IMAGE' and n.image:n.image.pack()
for o in added:
 if o.type!='MESH' and o.name in bpy.data.objects:bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.update();pts=[o.matrix_world@Vector(c) for o in meshes for c in o.bound_box]
print({'source_height':hi.z-lo.z,'scale':scale,'world_bottom':min(p.z for p in pts),'root_floor':root.matrix_world.translation.z,'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)})
s.render.resolution_percentage=50;s.cycles.samples=32;s.render.filepath=str(R/'artifacts/ogimachi-phases/tripo-dressing-test.png');bpy.ops.render.render(write_still=True)
