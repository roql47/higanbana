"""Compact cedar-lidded street bin; authored furnishing, not a measured replica."""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-bench.py')
exec(compile(SOURCE.read_text().split('for x in [-.225')[0],str(SOURCE),'exec'))
scene.name='Ogimachi_Street_Bin';current.name='street-bin'
current['archetype']='street-bin';current['scope']='authored cedar-lidded refuse bin'
metal.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.65
rounded('Metal body',(.46,.46,.70),(0,0,.41),metal,.012)
for z in [.09,.70]:
    rounded('Reinforcing band',(.475,.475,.032),(0,0,z),metal,.004)
for x in [-.17,.17]:
    for y in [-.17,.17]:rounded('Foot',(.065,.065,.07),(x,y,.035),metal,.004)
for y in [-.174,0,.174]:
    rounded('Cedar lid board',(.53,.165,.055),(0,y,.7925),wood,.008)
for x in [-.16,.16]:rounded('Lid strap',(.035,.46,.009),(x,0,.825),metal,.002)
for y in [-.09,.09]:rounded('Handle mount',(.045,.025,.025),(0,y,.842),metal,.003)
rounded('Lid handle',(.035,.205,.022),(0,0,.863),metal,.005)
for mat in [wood,metal]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    objects[0].name='bin_'+mat.name
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for o in current.children:o.select_set(True)
output=ROOT/'public/models/ogimachi/street-bin.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'street-bin.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'bytes':output.stat().st_size,'material_groups':len(current.children)}))
