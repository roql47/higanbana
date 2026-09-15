"""Close-range village bench, using existing cedar maps; authored design, not a scan."""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_Street_Bench'
current=bpy.data.objects.new('street-bench',None);scene.collection.objects.link(current)
current['archetype']='street-bench';current['scope']='authored traditional backless bench; not a measured replica'
metal=material('Bench dark iron',(.065,.075,.068),.75)
def rounded(name,size,position,mat,bevel=.008):
    o=box(name,size,position,mat)
    modifier=o.modifiers.new('Soft worn edges','BEVEL');modifier.width=bevel;modifier.segments=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=modifier.name)
    return o
for x in [-.225,-.075,.075,.225]:
    rounded('Cedar seat board',(.135,1.70,.08),(x,0,.46),wood)
for y in [-.61,.61]:
    rounded('Seat bearer',(.58,.075,.07),(0,y,.395),metal,.005)
    for x in [-.22,.22]:
        rounded('Iron leg',(.045,.055,.36),(x,y,.18),metal,.004)
        rounded('Broad foot',(.095,.11,.014),(x,y,.007),metal,.003)
    beam('Diagonal support',(-.22,y,.1),(.22,y,.365),.022,metal)
rounded('Long lower stretcher',(.032,1.24,.04),(0,0,.20),metal,.003)
for x in [-.225,-.075,.075,.225]:
    for y in [-.61,.61]:rounded('Recessed fastening',(.014,.014,.003),(x,y,.5005),metal,.002)
for mat in [wood,metal]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
    objects[0].name='bench_'+mat.name
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for o in current.children:o.select_set(True)
output=ROOT/'public/models/ogimachi/street-bench.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'street-bench.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'bytes':output.stat().st_size,'material_groups':len(current.children)}))
