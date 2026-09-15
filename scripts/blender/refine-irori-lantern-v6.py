"""Refine the existing Irori lantern, preserving its position and silhouette."""
import bpy
from pathlib import Path
ROOT=Path('/Users/jay/Claude/3D_motion')
scene=bpy.context.scene
assert not bpy.app.is_job_running('RENDER')
building=next(o for o in scene.objects if o.get('osm_id')==236248710)
objects=[o for o in building.children_recursive if o.type=='MESH' and not o.hide_render and any(m and m.name.startswith(('V2 weathered lantern granite','Irori V6 fine-grained granite')) for m in o.data.materials)]
assert objects, 'Lantern objects missing'
material=bpy.data.materials.get('Irori V6 fine-grained granite') or bpy.data.materials.new('Irori V6 fine-grained granite')
material.use_nodes=True
nodes=material.node_tree.nodes;nodes.clear();links=material.node_tree.links
out=nodes.new('ShaderNodeOutputMaterial');bsdf=nodes.new('ShaderNodeBsdfPrincipled');links.new(bsdf.outputs[0],out.inputs['Surface'])
geo=nodes.new('ShaderNodeNewGeometry')
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=75;noise.inputs['Detail'].default_value=3
links.new(geo.outputs['Position'],noise.inputs['Vector'])
ramp=nodes.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=(.095,.102,.096,1)
ramp.color_ramp.elements[1].position=.78;ramp.color_ramp.elements[1].color=(.34,.35,.31,1)
links.new(noise.outputs['Fac'],ramp.inputs[0]);links.new(ramp.outputs[0],bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value=.88
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35;bump.inputs['Distance'].default_value=.003
links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs[0],bsdf.inputs['Normal'])
for obj in objects:
    obj.data=obj.data.copy()
    for i,m in enumerate(obj.data.materials):
        if m and m.name.startswith(('V2 weathered lantern granite','Irori V6 fine-grained granite')):obj.data.materials[i]=material
    bevel=obj.modifiers.get('V6 softened granite edge') or obj.modifiers.new('V6 softened granite edge','BEVEL')
    bevel.width=.008;bevel.segments=3;bevel.limit_method='ANGLE'
    obj['lantern_revision']='v6'
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/irori-lantern-v6.blend'),{scene},fake_user=True,compress=True)
print('Refined lantern objects:',len(objects))
