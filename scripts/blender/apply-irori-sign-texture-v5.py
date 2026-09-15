"""Real image texture + UV for the existing sign; fixed v4 camera and geometry retained."""
import bpy,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
o=next(o for o in r.children if o.name=='V2 irregular burl sign')
if not o.get('v5_source_mesh'):o['v5_source_mesh']=o.data.name;o.data=o.data.copy()
# One coherent slab across the front. Side grain follows sign thickness separately.
uv=o.data.uv_layers.get('SignSlabUV') or o.data.uv_layers.new(name='SignSlabUV');o.data.uv_layers.active=uv
lo=[min(v.co[a] for v in o.data.vertices) for a in range(3)];hi=[max(v.co[a] for v in o.data.vertices) for a in range(3)]
for p in o.data.polygons:
 for li in p.loop_indices:
  co=o.data.vertices[o.data.loops[li].vertex_index].co
  if abs(p.normal.x)>.8:uv.data[li].uv=(.04+.92*(hi[1]-co.y)/(hi[1]-lo[1]),.05+.90*(co.z-lo[2])/(hi[2]-lo[2]))
  else:uv.data[li].uv=(.05+.88*(hi[1]-co.y)/(hi[1]-lo[1]),.06+.12*(co.x-lo[0])/(hi[0]-lo[0]))
m=bpy.data.materials.get('V5 image textured chestnut burl') or bpy.data.materials.new('V5 image textured chestnut burl');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0]);p.inputs['Roughness'].default_value=.79
im=bpy.data.images.load(R+'/public/textures/ogimachi/sign-v5/chestnut-burl-albedo.png',check_existing=True);im.colorspace_settings.name='sRGB';im.pack();tex=n.new('ShaderNodeTexImage');tex.name='Chestnut burl albedo';tex.image=im;tex.extension='EXTEND';uvnode=n.new('ShaderNodeUVMap');uvnode.uv_map='SignSlabUV';l.new(uvnode.outputs['UV'],tex.inputs[0]);l.new(tex.outputs['Color'],p.inputs['Base Color'])
gray=n.new('ShaderNodeRGBToBW');l.new(tex.outputs['Color'],gray.inputs[0]);rough=n.new('ShaderNodeMapRange');rough.name='Grain-dependent roughness';rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=.6;rough.inputs['To Min'].default_value=.9;rough.inputs['To Max'].default_value=.67;l.new(gray.outputs[0],rough.inputs['Value']);l.new(rough.outputs[0],p.inputs['Roughness'])
bump=n.new('ShaderNodeBump');bump.name='Fine sign grain relief';bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.0025;l.new(gray.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal']);o.data.materials.clear();o.data.materials.append(m);o['v5_albedo']='public/textures/ogimachi/sign-v5/chestnut-burl-albedo.png'
# Lettering should read as aged surface paint rather than a thick plastic logo.
pm=bpy.data.materials.get('V5 worn ivory sign paint') or bpy.data.materials.new('V5 worn ivory sign paint');pm.use_nodes=True;n=pm.node_tree.nodes;n.clear();l=pm.node_tree.links;p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0]);p.inputs['Roughness'].default_value=.86
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=90;noise.inputs['Detail'].default_value=2;ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.43,.39,.28,1);ra.color_ramp.elements[1].color=(.77,.73,.60,1);l.new(noise.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.12;b.inputs['Distance'].default_value=.00025;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
for ob in r.children:
 if ob.name.startswith('V2 shop brush letter'):
  ob.data=ob.data.copy();ob.data.materials.clear();ob.data.materials.append(pm);ob.data.extrude=.0004;ob.location.x=-4.742
 if ob.name=='V2 shop crest':
  ob.data=ob.data.copy();ob.data.materials.clear();ob.data.materials.append(pm);ob.data.bevel_depth=.004
  for sp in ob.data.splines:
   for pt in sp.points:pt.co.x=-4.743
# Reduce high-contrast wall blotches without removing photographic grain.
for i in range(5):
 m=bpy.data.materials.get('V3 cedar board '+str(i));node=m.node_tree.nodes.get('V3 restrained weathering') if m else None
 if node:node.inputs[0].default_value=.58;node.inputs[2].default_value=(.18+i*.004,.073+i*.002,.031,1)
# Gentle UV distortion to break repeating kaya stripes, preserving slope direction.
for name in ['V3 sloping weathered kaya','V3 compressed kaya cut ends']:
 m=bpy.data.materials.get(name)
 if not m:continue
 n=m.node_tree.nodes;l=m.node_tree.links;imageNode=next((v for v in n if v.type=='TEX_IMAGE'),None)
 if imageNode and not n.get('V5 subtle fiber displacement'):
  original=imageNode.inputs[0].links[0].from_socket;noise=n.new('ShaderNodeTexNoise');noise.name='V5 subtle fiber displacement';noise.inputs['Scale'].default_value=1.5;noise.inputs['Detail'].default_value=3;l.new(original,noise.inputs[0]);sub=n.new('ShaderNodeVectorMath');sub.operation='SUBTRACT';sub.inputs[1].default_value=(.5,.5,.5);l.new(noise.outputs['Color'],sub.inputs[0]);mul=n.new('ShaderNodeVectorMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=(.05,.025,0);l.new(sub.outputs[0],mul.inputs[0]);add=n.new('ShaderNodeVectorMath');add.operation='ADD';l.new(original,add.inputs[0]);l.new(mul.outputs[0],add.inputs[1]);l.new(add.outputs[0],imageNode.inputs[0])
s.render.resolution_percentage=50;s.cycles.samples=32;s.render.filepath=R+'/artifacts/ogimachi-phases/sign-texture-v5-test.png'
print('Sign image size',list(im.size),'UV',uv.name,'roughness and bump linked; camera unchanged')
