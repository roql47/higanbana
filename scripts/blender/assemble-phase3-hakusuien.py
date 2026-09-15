import bpy,json,math
from pathlib import Path
from mathutils import Vector
R=Path('/Users/jay/Claude/3D_motion');data=json.loads((R/'public/data/ogimachi/survey.json').read_text());b=next(b for b in data['buildings'] if b['id']==236248693)
base=sorted([s for s in bpy.data.scenes if s.name.startswith('Ogimachi_Phase2_Foreground_Terraces')],key=lambda s:s.name)[-1]
modelscene=bpy.context.scene;root=next(o for o in modelscene.objects if o.get('osm_id')==236248693)
scene=bpy.data.scenes.new('Phase3_B001_Village_Context');bpy.context.window.scene=scene
for ob in base.objects:
 if ob.name.startswith('Footprint_236248693'):continue
 cp=ob.copy()
 if ob.type in ['CAMERA','LIGHT'] or ob.name.startswith('GSI_terrain'):cp.data=ob.data.copy()
 scene.collection.objects.link(cp)
 if ob==base.camera:scene.camera=cp
terrain=next(o for o in scene.objects if o.name.startswith('GSI_terrain'))
# Same footprint position; level the house pad and feather its edge into the DEM.
old=next(o for o in base.objects if o.name.startswith('Footprint_236248693'));level=min(v.co.z for v in old.data.vertices)
c,s=math.cos(b['angle']),math.sin(b['angle'])
for v in terrain.data.vertices:
 dx,dy=v.co.x-b['x'],v.co.y+b['z'];x,y=c*dx+s*dy,-s*dx+c*dy;edge=max(abs(x)-6.1,abs(y)-10.1)
 t=max(0,min(1,1-edge/2));t=t*t*(3-2*t);v.co.z=v.co.z*(1-t)+level*t
copyroot=root.copy();scene.collection.objects.link(copyroot);copyroot.location=(b['x'],-b['z'],level);copyroot.rotation_euler=(0,0,b['angle'])
for ob in root.children:
 cp=ob.copy();scene.collection.objects.link(cp);cp.parent=copyroot
# Plain ground strip is an inferred transition, not a copy of the reference paving.
me=bpy.data.meshes.new('B001 entrance apron');me.from_pydata([(-6.05,-9.2,.015),(-5.05,-9.2,.015),(-5.05,9.2,.015),(-6.05,9.2,.015)],[],[(0,1,2,3)]);me.update();ob=bpy.data.objects.new('B001 entrance apron',me);scene.collection.objects.link(ob);ob.parent=copyroot;me.materials.append(next(m for m in bpy.data.materials if m.name.startswith('Study packed earth road')))
scene.world=modelscene.world;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=1400;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
camera=scene.camera;camera.data.type='PERSP';camera.data.lens=43
local=Vector((-25,-21,10));camera.location=copyroot.matrix_world@local
# Update parent matrix before using it for the camera.
bpy.context.view_layer.update();camera.location=copyroot.matrix_world@local;target=copyroot.matrix_world@Vector((0,0,3.8));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
out=R/'artifacts/ogimachi-phases';scene.render.filepath=str(out/'phase3-house-in-village.png');bpy.ops.render.render(write_still=True)
camera.data.type='ORTHO';camera.data.ortho_scale=160;camera.location=(b['x']-85,-b['z']-100,90);target=Vector((b['x']+30,-b['z']+35,0));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/'phase3-village-overview.png');bpy.ops.render.render(write_still=True)
bpy.data.libraries.write(str(R/'assets/authored/ogimachi/phase3-village-context.blend'),{scene},fake_user=True)
print({'scene':scene.name,'house_position':list(copyroot.location),'angle':b['angle'],'model':'refined B001 replaces one footprint placeholder'})
