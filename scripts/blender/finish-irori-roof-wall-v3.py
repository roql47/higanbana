"""Material and silhouette adjustments after the first fixed-camera test."""
import bpy,math,random
from mathutils import Vector
from mathutils import noise as mnoise
s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710);rng=random.Random(1462)
# Restore detailed photographed fibers, using different mappings for slope and compressed edge.
img=bpy.data.images.load('/Users/jay/Claude/3D_motion/public/textures/ogimachi/kaya-aligned-v2.png',check_existing=True);img.pack()
for name,sc in [('V3 sloping weathered kaya',(1.2,1.0,1)),('V3 compressed kaya cut ends',(1.8,.40,1))]:
 m=bpy.data.materials[name];n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');tc=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=sc;l.new(tc.outputs['UV'],mapping.inputs[0]);tex=n.new('ShaderNodeTexImage');tex.image=img;l.new(mapping.outputs[0],tex.inputs[0]);tint=n.new('ShaderNodeMixRGB');tint.blend_type='MULTIPLY';tint.inputs[0].default_value=1;tint.inputs[2].default_value=(1.50,1.03,.61,1) if 'cut' in name else (1.30,1.08,.80,1);l.new(tex.outputs['Color'],tint.inputs[1]);l.new(tint.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=.012;b.inputs['Strength'].default_value=.50;l.new(tex.outputs['Color'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
# Local uneven packing; preserve apex and don't repeat sinusoidal scallops along the eave.
o=next(o for o in r.children if o.name=='V3 thick curved front thatch pack')
if not o.get('v3_rough_pack'):
 for v in o.data.vertices:
  weight=max(0,min(1,(-v.co.x-4.70)/.5));v.co.x+=weight*.023*mnoise.noise(Vector((v.co.y*5,v.co.z*6,2)));v.co.z+=weight*.035*mnoise.noise(Vector((v.co.y*6,v.co.z*4,9)))
 o['v3_rough_pack']=True
# A handful of individual broken bundles along the bottom edge; irregular rather than a comb.
for ob in list(r.children):
 if ob.get('v3_edge_loose'):bpy.data.objects.remove(ob,do_unlink=True)
vs=[];fs=[]
for i in range(3300):
 y=rng.uniform(-6.75,6.75);z=3.875+.025*math.sin(y*1.37)+.012*math.sin(y*3.8+.4)+rng.uniform(-.02,.08);x=-5.24+rng.uniform(-.055,.015);length=rng.uniform(.016,.063);rad=rng.uniform(.001,.0023);idx=len(vs)
 a=Vector((x,y,z));b=a+Vector((-.02,rng.uniform(-.012,.012),-length))
 for p in [a,b]:
  for k in range(3):an=k*math.tau/3;vs.append(tuple(p+Vector((math.cos(an)*rad,math.sin(an)*rad,0))))
 for k in range(3):fs.append((idx+k,idx+(k+1)%3,idx+(k+1)%3+3,idx+k+3))
me=bpy.data.meshes.new('V3 loose edge fibers');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('V3 loose edge fibers',me);s.collection.objects.link(o);o.parent=r;o['irori_roof_wall_v3']=True;o['v3_edge_loose']=True;me.materials.append(bpy.data.materials['V3 reed fiber 1'])
# Assign one internal strip of a real cedar board to each modeled member.
# This intentionally excludes the source image's black board joints and repeated nail row.
albedo=bpy.data.images.load('/Users/jay/Claude/3D_motion/public/textures/minka/weathered-cedar-diff-1k.webp',check_existing=True);albedo.pack()
normal=bpy.data.images.load('/Users/jay/Claude/3D_motion/public/textures/minka/weathered-cedar-nor-gl-1k.webp',check_existing=True);normal.colorspace_settings.name='Non-Color';normal.pack()
for name in ['V3 cedar board '+str(i) for i in range(5)]+['V3 smoke darkened structural oak','V3 handled warm sash timber']:
 m=bpy.data.materials[name];n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');tex=n.new('ShaderNodeTexImage');tex.image=albedo;mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
 if 'cedar board' in name:
  i=int(name[-1]);tint=(2.15+i*.10,1.20+i*.04,.64+i*.02)
 elif 'sash' in name:tint=(1.80,1.44,.93)
 else:tint=(.88,.65,.43)
 mix.inputs[2].default_value=(*tint,1);l.new(tex.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Base Color']);nt=n.new('ShaderNodeTexImage');nt.image=normal;nm=n.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.32;l.new(nt.outputs[0],nm.inputs['Color']);l.new(nm.outputs[0],p.inputs['Normal']);p.inputs['Roughness'].default_value=.83
strips=[(.108,.173),(.229,.297),(.354,.402),(.471,.517),(.615,.663),(.784,.825),(.861,.911)]
for ob in r.children:
 if ob.type!='MESH' or not ob.get('irori_roof_wall_v3') or not any(m and m.name.startswith(('V3 cedar board','V3 smoke darkened','V3 handled warm')) for m in ob.data.materials):continue
 if ob.get('v3_board_crop'):continue
 uv=ob.data.uv_layers.active
 if not uv:continue
 lo=[min(v.co[a] for v in ob.data.vertices) for a in range(3)];hi=[max(v.co[a] for v in ob.data.vertices) for a in range(3)];axis=max(range(3),key=lambda a:hi[a]-lo[a]);u0,u1=rng.choice(strips);v0=rng.choice([.04,.49]);cross=2 if axis==1 else 1
 for p in ob.data.polygons:
  for li in p.loop_indices:
   v=ob.data.vertices[ob.data.loops[li].vertex_index].co;across=(v[cross]-lo[cross])/max(.001,hi[cross]-lo[cross]);along=(v[axis]-lo[axis])/max(.001,hi[axis]-lo[axis]);uv.data[li].uv=(u0+across*(u1-u0),v0+along*.27)
 ob['v3_board_crop']=True
# Re-map existing merged door component UVs using physical member bounds as well.
wo=next(o for o in r.children if 'Smoke-aged cedar' in o.name)
if not wo.get('v3_door_crop'):
 par=list(range(len(wo.data.vertices)))
 def f(a):
  while par[a]!=a:par[a]=par[par[a]];a=par[a]
  return a
 for e in wo.data.edges:a,b=map(f,e.vertices);par[b]=a
 gr={}
 for v in wo.data.vertices:gr.setdefault(f(v.index),[]).append(v.index)
 uv=wo.data.uv_layers.active
 for ids in gr.values():
  pts=[wo.matrix_local@wo.data.vertices[i].co for i in ids];lo=[min(v[a] for v in pts) for a in range(3)];hi=[max(v[a] for v in pts) for a in range(3)]
  if not (lo[0]<-4.5 and hi[0]<-4.48 and lo[1]>-1.04 and hi[1]<1.04 and hi[2]<2.5):continue
  axis=max(range(3),key=lambda a:hi[a]-lo[a]);cross=2 if axis==1 else 1;u0,u1=rng.choice(strips);idset=set(ids)
  for p in wo.data.polygons:
   if p.vertices[0] not in idset:continue
   for li in p.loop_indices:
    v=wo.matrix_local@wo.data.vertices[wo.data.loops[li].vertex_index].co;uv.data[li].uv=(u0+(v[cross]-lo[cross])/max(.001,hi[cross]-lo[cross])*(u1-u0),.46+(v[axis]-lo[axis])/max(.001,hi[axis]-lo[axis])*.27)
 wo['v3_door_crop']=True
s.render.resolution_percentage=50;s.cycles.samples=32;s.render.filepath='/Users/jay/Claude/3D_motion/artifacts/ogimachi-phases/roof-wall-v3-test2.png'
print('Mapped individual cedar board interiors and revised roof fibers')
# Correct winding on closed authored volumes (including thin glass).
import bmesh
fixed=[]
for ob in r.children:
 if ob.type!='MESH' or not (ob.get('irori_roof_wall_v3') or ob.get('entrance_correction_v2') or ob.name.startswith('PR thin window glass')):continue
 bm=bmesh.new();bm.from_mesh(ob.data)
 if bm.faces and all(e.is_manifold for e in bm.edges) and bm.calc_volume(signed=True)<0:
  bmesh.ops.reverse_faces(bm,faces=list(bm.faces));bm.to_mesh(ob.data);fixed.append(ob.name)
 bm.free()
# Restrained patina: retain knots and grain while reducing photographic black/white streaks.
for name in ['V3 cedar board '+str(i) for i in range(5)]+['V3 smoke darkened structural oak','V3 handled warm sash timber']:
 m=bpy.data.materials[name];n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');source=p.inputs['Base Color'].links[0].from_socket
 node=n.new('ShaderNodeMixRGB');node.name='V3 restrained weathering';node.blend_type='MIX'
 if 'cedar board' in name:node.inputs[0].default_value=.42;node.inputs[2].default_value=(.19,.064,.025,1)
 elif 'sash' in name:node.inputs[0].default_value=.30;node.inputs[2].default_value=(.13,.075,.038,1)
 else:node.inputs[0].default_value=.24;node.inputs[2].default_value=(.055,.030,.014,1)
 l.new(source,node.inputs[1]);l.new(node.outputs[0],p.inputs['Base Color'])
 for no in n:
  if no.type=='NORMAL_MAP':no.inputs['Strength'].default_value=.20
print('Corrected closed-volume winding:',len(fixed))
