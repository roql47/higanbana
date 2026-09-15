"""Authored modest road lamp, preserving existing pole dimensions."""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-bench.py')
exec(compile(SOURCE.read_text().split('for x in [-.225')[0],str(SOURCE),'exec'))
scene.name='Ogimachi_Street_Lamp';current.name='street-lamp'
current['archetype']='street-lamp';current['scope']='authored fixture, not measured reference reconstruction'
concrete=surface('Lamp concrete','textures/ogimachi/act1/concrete-color.webp','textures/ogimachi/act1/concrete-normal.webp',.3)
metal.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.6
glass=material('Frosted lamp diffuser',(.72,.70,.57),.55)
def cone(name,r1,r2,depth,z,x,mat):
    bpy.ops.mesh.primitive_cone_add(vertices=20,radius1=r1,radius2=r2,depth=depth,location=(x,0,z))
    o=bpy.context.object;o.name=name;o.parent=current;o.data.materials.append(mat)
    for face in o.data.polygons:face.use_smooth=len(face.vertices)==4
    return o
cone('Tapered concrete pole',.12,.075,6.6,3.3,0,concrete)
for z in [5.95,6.18]:
    cone('Mounting collar',.085,.085,.055,z,0,metal)
    rounded('Collar fastening',(.04,.045,.07),(-.085,0,z),metal,.003)
beam('Upper lamp arm',(.065,0,6.18),(.62,0,6.24),.035,metal)
beam('Diagonal brace',(.065,0,5.95),(.44,0,6.22),.024,metal)
cone('Lamp neck',.027,.027,.11,6.20,.63,metal)
cone('Bell shade',.19,.065,.09,6.10,.63,metal)
cone('Shade rim',.195,.195,.017,6.05,.63,metal)
cone('Frosted lens',.17,.17,.025,6.035,.63,glass)
rounded('Cable cover',(.022,.028,1.55),(.085,0,5.37),metal,.003)
rounded('Service cover',(.022,.085,.23),(-.118,0,1.15),metal,.004)
for mat in [metal,glass,concrete]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name='lamp_'+mat.name
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image and max(node.image.size)>512:
            node.image.scale(512,512);node.image.pack()
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for o in current.children:o.select_set(True)
output=ROOT/'public/models/ogimachi/street-lamp.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'street-lamp.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'bytes':output.stat().st_size,'material_groups':len(current.children)}))
