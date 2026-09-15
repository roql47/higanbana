"""Authored compact cast-iron hydrant, not a measured historical replica."""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-bench.py')
exec(compile(SOURCE.read_text().split('for x in [-.225')[0],str(SOURCE),'exec'))
scene.name='Ogimachi_Hydrant';current.name='street-hydrant'
current['archetype']='street-hydrant';current['scope']='authored cast-iron street fixture'
concrete=surface('Hydrant concrete','textures/ogimachi/act1/concrete-color.webp','textures/ogimachi/act1/concrete-normal.webp',.35)
paint=material('Muted red cast iron',(.30,.055,.025),.83)
rng=np.random.default_rng(631)
pixels=np.ones((128,128,4),dtype=np.float32)
grain=rng.uniform(.76,1.13,(128,128,1));pixels[:,:,:3]=np.array([.40,.105,.055])*grain
im=bpy.data.images.new('Cast iron paint grain',128,128);im.pixels.foreach_set(pixels.ravel());im.pack()
node=paint.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
paint.node_tree.links.new(node.outputs['Color'],paint.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
metal.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.65
def cyl(name,radius,depth,position,mat,axis='Z',vertices=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=position)
    o=bpy.context.object;o.name=name;o.parent=current;o.data.materials.append(mat)
    if axis=='X':o.rotation_euler.y=math.pi/2
    m=o.modifiers.new('Cast edges','BEVEL');m.width=.004;m.segments=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    return o
rounded('Concrete plinth',(.52,.52,.32),(0,0,.16),concrete,.012)
cyl('Base flange',.145,.035,(0,0,.3375),paint)
cyl('Main barrel',.10,.39,(0,0,.55),paint)
cyl('Bonnet flange',.125,.035,(0,0,.7575),paint)
bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=8,radius=1,location=(0,0,.78))
o=bpy.context.object;o.name='Domed bonnet';o.scale=(.116,.116,.085);o.parent=current;o.data.materials.append(paint)
cyl('Operating nut',.035,.045,(0,0,.868),metal,vertices=6)
for side in [-1,1]:
    cyl('Hose outlet',.065,.17,(side*.14,0,.61),paint,'X')
    cyl('Outlet cap flange',.083,.025,(side*.235,0,.61),paint,'X')
    cyl('Cap nut',.027,.024,(side*.26,0,.61),metal,'X',6)
for i in range(6):
    a=i*math.tau/6;cyl('Base anchor',.012,.023,(math.cos(a)*.12,math.sin(a)*.12,.363),metal,vertices=6)
for mat in [paint,metal,concrete]:
    objects=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name='hydrant_'+mat.name
    for node in mat.node_tree.nodes:
        if node.type=='TEX_IMAGE' and node.image and max(node.image.size)>512:
            node.image.scale(512,512);node.image.pack()
bpy.ops.object.select_all(action='DESELECT');current.select_set(True)
for o in current.children:o.select_set(True)
output=ROOT/'public/models/ogimachi/street-hydrant.glb'
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'street-hydrant.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print(json.dumps({'bytes':output.stat().st_size,'material_groups':len(current.children)}))
