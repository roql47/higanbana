"""Authored sheltered cedar noticeboard; not a measured reference replica."""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-bench.py')
exec(compile(SOURCE.read_text().split('for x in [-.225')[0],str(SOURCE),'exec'))
scene.name='Ogimachi_Noticeboard';current.name='noticeboard'
current['archetype']='noticeboard';current['scope']='authored village noticeboard'
for y in [-.36,.36]:
    rounded('Cedar post',(.09,.09,1.48),(0,y,.74),wood,.007)
    rounded('Post shoe',(.105,.105,.12),(0,y,.06),metal,.003)
rounded('Board backing',(.04,.91,.60),(0,0,1.13),wood,.004)
for y in [-.47,.47]:rounded('Upright frame',(.075,.06,.68),(-.01,y,1.13),wood,.004)
for z in [.80,1.46]:rounded('Horizontal frame',(.075,1,.06),(-.01,0,z),wood,.004)
rounded('Lower ledge',(.17,1.04,.045),(-.015,0,.785),wood,.004)
# A small pitched cap shelters the board; roof ridge runs along the board width.
for x in [-.085,.085]:
    o=rounded('Roof cap',(.185,1.06,.035),(x,0,1.535),wood,.004)
    o.rotation_euler.y=.28 if x>0 else -.28
rounded('Ridge cover',(.045,1.07,.035),(0,0,1.568),metal,.003)
for mat in [wood,metal]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    objects[0].name='noticeboard_'+mat.name
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for o in current.children:o.select_set(True)
output=ROOT/'public/models/ogimachi/noticeboard.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'noticeboard.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'bytes':output.stat().st_size,'material_groups':len(current.children)}))
