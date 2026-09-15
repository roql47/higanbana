import bpy,math,random
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-floor-v5.blend',{s},fake_user=True,compress=True)
for o in list(r.children):
 if o.name.startswith('IR5 '):bpy.data.objects.remove(o,do_unlink=True)
 if o.name=='IR interior floor' or o.name.startswith('IR2 floor board joint'):o.hide_render=True;o.hide_set(True)
# Seam-free wood material: no photographed tile borders. UV grain runs along X.
m=bpy.data.materials.get('IR5 aged cedar floor') or bpy.data.materials.new('IR5 aged cedar floor');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links
out=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');l.new(p.outputs[0],out.inputs[0]);p.inputs['Roughness'].default_value=.76
uv=n.new('ShaderNodeTexCoord');scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(1.4,100,1);l.new(uv.outputs['UV'],scale.inputs[0]);noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2;noise.inputs['Detail'].default_value=3;noise.inputs['Roughness'].default_value=.68;l.new(scale.outputs[0],noise.inputs[0])
ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.20;ramp.color_ramp.elements[0].color=(.12,.061,.026,1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(.32,.20,.10,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color']);bump=n.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.00055;bump.inputs['Strength'].default_value=.20;l.new(noise.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
# Build all boards in one mesh; long joints stagger from row to row.
vs=[];fs=[];uvs=[];rng=random.Random(516)
xmin,xmax=-4.475,4.075;ymin,ymax=-5.65,5.65;rows=58;w=(ymax-ymin)/rows;gap=.0018
for row in range(rows):
 y0=ymin+row*w;y1=y0+w;cuts=[xmin];x=xmin+[2.8,1.9,1.15,2.35][row%4]
 while x<xmax-.25:cuts.append(x);x+=rng.uniform(2.35,3.15)
 cuts.append(xmax)
 for a,b in zip(cuts,cuts[1:]):
  x0=a+(gap/2 if a>xmin else 0);x1=b-(gap/2 if b<xmax else 0);ya=y0+gap/2;yb=y1-gap/2;start=len(vs);offs=rng.uniform(0,30)
  v=[(x0,ya,.12),(x1,ya,.12),(x1,yb,.12),(x0,yb,.12),(x0,ya,.30),(x1,ya,.30),(x1,yb,.30),(x0,yb,.30)];vs.extend(v)
  for face in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:fs.append(tuple(start+i for i in face));uvs.append([(v[i][0]+offs,v[i][1]+row*.431) for i in face])
me=bpy.data.meshes.new('IR5 staggered cedar boards');me.from_pydata(vs,[],fs);me.materials.append(m);ob=bpy.data.objects.new('IR5 staggered cedar boards',me);s.collection.objects.link(ob);ob.parent=r;ob['runtimeGroup']='floor';uv=me.uv_layers.new(name='UVMap')
for poly,coords in zip(me.polygons,uvs):
 for li,co in zip(poly.loop_indices,coords):uv.data[li].uv=co
be=ob.modifiers.new('Soft worn plank edge','BEVEL');be.width=.0013;be.segments=1
# Keep the original floor collision at exactly the same top elevation.
r['interior_revision']='v5-floor';bpy.context.view_layer.update();bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v5.blend',{s},fake_user=True,compress=True)
old=s.camera;settings=(s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples);s.camera=bpy.data.objects['IR interior review'];s.render.resolution_x=1400;s.render.resolution_y=950;s.render.filepath=R+'/artifacts/ogimachi-phases/irori-interior-v5.png';s.cycles.samples=32
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old;s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples=settings
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Long staggered floorboards authored, unchanged floor elevation; source saved')
