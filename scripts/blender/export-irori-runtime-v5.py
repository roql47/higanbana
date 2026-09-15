"""Bake a separate runtime copy; never replace the user's editable scene."""
import bpy,math,json,traceback
from pathlib import Path
from mathutils import Matrix
ROOT=Path('/Users/jay/Claude/3D_motion');OUT=ROOT/'artifacts/ogimachi-phases/runtime-irori-v5';OUT.mkdir(parents=True,exist_ok=True)
source=bpy.context.scene;building=next(o for o in source.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
scene=bpy.data.scenes.new('Irori Runtime V5 Bake');scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.device='GPU';scene.render.bake.margin=8;scene.render.bake.use_clear=True;scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
scene.world=source.world.copy();deps=bpy.context.evaluated_depsgraph_get();groups={};matcache={}
def visible(o):
 while o and o!=building:
  if o.hide_render:return False
  o=o.parent
 return True
def classify(o):
 if o.name.startswith(('V2 irregular burl sign','V2 shop brush letter','V2 shop crest')):return 'sign'
 if o.name.startswith(('V3 packed irregular cut reed tips','V3 overlapping sloped reed fibers','V3 loose edge fibers')):return 'fibers'
 if 'Bound kaya reeds' in o.name or o.name.startswith('V3 thick curved front'):return 'roof'
 if any(m and m.use_nodes and (p:=m.node_tree.nodes.get('Principled BSDF')) and p.inputs['Transmission Weight'].default_value>.5 for m in o.data.materials):return 'glass'
 if o.name.startswith(('IG ','V2 twisted','V2 crooked','V2 arching','Irori textured Tripo')):return 'garden'
 return 'body'
for o in building.children_recursive:
 if o.type not in ['MESH','FONT','CURVE'] or not visible(o) or o.name in ['V2 entrance earth apron']:continue
 group=classify(o);ev=o.evaluated_get(deps);me=bpy.data.meshes.new_from_object(ev,preserve_all_data_layers=True,depsgraph=deps);me.transform(building.matrix_world.inverted()@o.matrix_world);ob=bpy.data.objects.new(o.name+' runtime',me);scene.collection.objects.link(ob)
 # Bind source UV explicitly before introducing a non-overlapping bake atlas.
 active=me.uv_layers.active
 if active:active.name='SourceUV'
 else:active=me.uv_layers.new(name='SourceUV')
 active.active_render=True
 for i,m in enumerate(me.materials):
  if not m:continue
  if m.name not in matcache:
   cp=m.copy();cp.name='Runtime source '+m.name;matcache[m.name]=cp
   if cp.use_nodes:
    n=cp.node_tree.nodes;l=cp.node_tree.links;uv=n.new('ShaderNodeUVMap');uv.uv_map='SourceUV'
    for node in list(n):
     if node.type=='UVMAP':node.uv_map='SourceUV'
     if node.type=='TEX_COORD':
      for link in list(node.outputs['UV'].links):l.new(uv.outputs[0],link.to_socket)
     if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:l.new(uv.outputs[0],node.inputs['Vector'])
  me.materials[i]=matcache[m.name]
 groups.setdefault(group,[]).append(ob)
bpy.context.window.scene=scene
# Merge groups to reduce draw calls; skip bake on simple fibers and transparent glass.
merged={}
for name,objects in groups.items():
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]
 if len(objects)>1:bpy.ops.object.join()
 ob=objects[0];ob.name='irori-v5-'+name;merged[name]=ob
report={'status':'prepared','groups':{k:len(o.data.polygons) for k,o in merged.items()},'sourceScene':source.name}
(OUT/'status.json').write_text(json.dumps(report,indent=2))
bpy.context.window.scene=source
# Timer allows progress files to be inspected while Blender performs the bake.
def execute():
 try:
  bpy.context.window.scene=scene
  for name in ['sign','body','roof','garden']:
   if name not in merged:continue
   ob=merged[name];bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
   atlas=ob.data.uv_layers.new(name='RuntimeAtlas');ob.data.uv_layers.active=atlas
   bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012,area_weight=1.0,correct_aspect=True,scale_to_bounds=True);bpy.ops.object.mode_set(mode='OBJECT')
   size=1024 if name=='sign' else 2048;maps={}
   for kind,bake_type in [('color','DIFFUSE'),('roughness','ROUGHNESS'),('normal','NORMAL')]:
    report.update(status='baking',group=name,map=kind);(OUT/'status.json').write_text(json.dumps(report,indent=2))
    im=bpy.data.images.new('Irori v5 '+name+' '+kind,size,size,alpha=False);im.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color'
    for m in ob.data.materials:
     if not m or not m.use_nodes:continue
     node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=im;m.node_tree.nodes.active=node
    bpy.ops.object.bake(type=bake_type)
    im.filepath_raw=str(OUT/(name+'-'+kind+'.png'));im.file_format='PNG';im.save();im.pack();maps[kind]=im
   m=bpy.data.materials.new('Irori runtime '+name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Metallic'].default_value=0;m.use_backface_culling=False
   for kind,im in maps.items():
    tex=m.node_tree.nodes.new('ShaderNodeTexImage');tex.image=im
    if kind=='normal':nm=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(tex.outputs['Color'],nm.inputs['Color']);m.node_tree.links.new(nm.outputs[0],p.inputs['Normal'])
    else:m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color' if kind=='color' else 'Roughness'])
   ob.data.materials.clear();ob.data.materials.append(m)
   for poly in ob.data.polygons:poly.material_index=0
   ob.data.uv_layers.active=atlas;atlas.active_render=True
   for uv in list(ob.data.uv_layers):
    if uv.name!='RuntimeAtlas':ob.data.uv_layers.remove(uv)
  root=bpy.data.objects.new('irori-restaurant',None);root['archetype']='irori-restaurant';root['osm_id']=236248710;root['runtime_revision']='photoreal-v5';scene.collection.objects.link(root)
  for o in merged.values():o.parent=root
  bpy.ops.object.select_all(action='SELECT')
  report.update(status='exporting');(OUT/'status.json').write_text(json.dumps(report,indent=2))
  bpy.ops.export_scene.gltf(filepath=str(OUT/'irori-restaurant-v5.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
  bpy.data.libraries.write(str(OUT/'irori-runtime-v5.blend'),{scene},fake_user=True,compress=True)
  report.update(status='complete',bytes=(OUT/'irori-restaurant-v5.glb').stat().st_size);(OUT/'status.json').write_text(json.dumps(report,indent=2))
 except Exception:
  report.update(status='failed',error=traceback.format_exc());(OUT/'status.json').write_text(json.dumps(report,indent=2))
 finally:bpy.context.window.scene=source
 return None
bpy.app.timers.register(execute,first_interval=.5)
print(json.dumps(report))
