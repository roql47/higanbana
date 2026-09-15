import bpy,math,random
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248704)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-shop-roof-v2.blend',{s},fake_user=True,compress=True)
o=next(o for o in r.children if 'Bound kaya' in o.name)
if not o.get('shop_cut_refined'):o.data=o.data.copy()
me=o.data
m=bpy.data.materials.get('Shop compacted thatch ends') or bpy.data.materials.new('Shop compacted thatch ends');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0]);p.inputs['Roughness'].default_value=.97
uv=n.new('ShaderNodeTexCoord');v=n.new('ShaderNodeTexVoronoi');v.inputs['Scale'].default_value=155;l.new(uv.outputs['UV'],v.inputs['Vector']);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.12;ramp.color_ramp.elements[0].color=(.025,.017,.010,1);ramp.color_ramp.elements[1].position=.67;ramp.color_ramp.elements[1].color=(.13,.09,.05,1);l.new(v.outputs['Distance'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.3;b.inputs['Distance'].default_value=.003;l.new(v.outputs['Distance'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
if m.name not in [x.name for x in me.materials]:me.materials.append(m)
idx=list(me.materials).index(m);uvlayer=me.uv_layers.active
cut=[]
for p in me.polygons:
 if abs(p.normal.z)<.15 and p.center.z<10.9:
  p.material_index=idx;cut.append(p)
  for li in p.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uvlayer.data[li].uv=((co.y if abs(p.normal.x)>.8 else co.x)/1.5,co.z/1.5)
# Small cut stems only on the exposed eave faces, not thousands of full roof strands.
name='V3 packed irregular cut reed tips shop'
old=bpy.data.objects.get(name)
if old:bpy.data.objects.remove(old,do_unlink=True)
vs=[];fs=[];rng=random.Random(274)
for p in cut:
 if p.center.z>4.5:continue
 pts=[me.vertices[i].co for i in p.vertices]
 for j in range(max(1,int(p.area*95))):
  a=pts[0];bi=rng.randrange(1,len(pts)-1);b=pts[bi];c=pts[bi+1];u=rng.random();v=rng.random()
  if u+v>1:u=1-u;v=1-v
  q=a+(b-a)*u+(c-a)*v;normal=p.normal;axis=normal.cross(Vector((0,0,1))).normalized();other=normal.cross(axis);rad=rng.uniform(.002,.004);tip=q+normal*rng.uniform(.009,.027);start=len(vs)
  for center in [q,tip]:
   for k in range(3):vs.append(center+rad*(axis*math.cos(k*math.tau/3)+other*math.sin(k*math.tau/3)))
  fs.extend([(start+k,start+(k+1)%3,start+(k+1)%3+3,start+k+3) for k in range(3)]);fs.append((start+3,start+4,start+5))
mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],fs);ob=bpy.data.objects.new(name,mesh);s.collection.objects.link(ob);ob.parent=r
straw=bpy.data.materials.get('Shop reed ends plain') or bpy.data.materials.new('Shop reed ends plain');straw.diffuse_color=(.27,.19,.10,1);straw.use_nodes=True;bs=straw.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=straw.diffuse_color;bs.inputs['Roughness'].default_value=.96;mesh.materials.append(straw)
# Copy facade material so the neighbouring restaurant is not affected.
wood=next(ob for ob in r.children if 'Smoke-aged cedar' in ob.name)
if not wood.get('shop_surface_v2'):
 wood.data=wood.data.copy()
 for i,mat in enumerate(wood.data.materials):
  cp=mat.copy();wood.data.materials[i]=cp
  if cp.use_nodes:
   bs=next((n for n in cp.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if bs:bs.inputs['Roughness'].default_value=.87
 bevel=wood.modifiers.new('Shop facade board edge relief','BEVEL');bevel.width=.004;bevel.segments=2;bevel.limit_method='ANGLE';wood['shop_surface_v2']=True
 o['shop_cut_refined']=True
cam=bpy.data.objects.get('Shop textile review');old=s.camera;cam.location=r.matrix_world@Vector((-12,-8,4.8));target=r.matrix_world@Vector((-3.4,0,3.5));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=40;s.camera=cam;s.render.filepath=R+'/artifacts/ogimachi-phases/shop-roof-v2.png';s.cycles.samples=40
bpy.data.libraries.write(R+'/assets/authored/ogimachi/shop-roof-v2.blend',{s},fake_user=True,compress=True)
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Cut faces',len(cut),'reed tip polygons',len(fs))
