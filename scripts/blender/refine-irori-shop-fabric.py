import bpy,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248704)
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-shop-fabric.blend',{s},fake_user=True,compress=True)
o=next(o for o in r.children if 'dusty red noren' in o.name)
if not o.get('fabric_refined'):
 me=o.data;adj={v.index:set() for v in me.vertices}
 for e in me.edges:a,b=e.vertices;adj[a].add(b);adj[b].add(a)
 left=set(adj);parts=[]
 while left:
  stack=[left.pop()];part=[]
  while stack:
   v=stack.pop();part.append(me.vertices[v].co.copy());new=adj[v]&left;left-=new;stack.extend(new)
  parts.append(part)
 vs=[];fs=[]
 for n,part in enumerate(parts):
  lo=Vector([min(v[i] for v in part) for i in range(3)]);hi=Vector([max(v[i] for v in part) for i in range(3)]);start=len(vs);nx=16;nz=18
  for j in range(nz+1):
   t=j/nz
   for i in range(nx+1):
    u=i/nx;x=lo.x+(hi.x-lo.x)*u;y=(lo.y+hi.y)/2+.022*math.sin(u*math.pi*5+n*.7)*t+.018*t*t;z=hi.z-(hi.z-lo.z)*t-.012*math.sin(math.pi*u)*t
    vs.append((x,y,z))
  for j in range(nz):
   for i in range(nx):a=start+j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
 new=bpy.data.meshes.new('Shop noren draped textile');new.from_pydata(vs,[],fs);new.update();o.data=new
 m=bpy.data.materials.new('Shop faded woven red fabric');m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.94
 n=m.node_tree.nodes;l=m.node_tree.links;noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=140;noise.inputs['Detail'].default_value=2;mix=n.new('ShaderNodeValToRGB');mix.color_ramp.elements[0].color=(.12,.018,.012,1);mix.color_ramp.elements[1].color=(.29,.058,.036,1);l.new(noise.outputs['Fac'],mix.inputs[0]);l.new(mix.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.18;b.inputs['Distance'].default_value=.0005;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal']);new.materials.append(m)
 for p in new.polygons:p.use_smooth=True
 mod=o.modifiers.new('Thin fabric thickness','SOLIDIFY');mod.thickness=.002;o['fabric_refined']=True
for ob in r.children:
 if ob.type=='MESH' and ('structural timber' in ob.name or 'weathered canopy' in ob.name) and not ob.modifiers.get('Shop softened edges'):
  b=ob.modifiers.new('Shop softened edges','BEVEL');b.width=.006;b.segments=2;b.limit_method='ANGLE'
cam=bpy.data.objects.get('Shop textile review')
if not cam:cam=bpy.data.objects.new('Shop textile review',bpy.data.cameras.new('Shop textile review'));s.collection.objects.link(cam)
cam.location=r.matrix_world@Vector((-12,-8,3.1));target=r.matrix_world@Vector((-3.4,0,2.1));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=45
old=s.camera;s.camera=cam;s.render.resolution_x=1400;s.render.resolution_y=1050;s.render.resolution_percentage=100;s.cycles.samples=32;s.render.filepath=R+'/artifacts/ogimachi-phases/shop-fabric-v1.png'
bpy.data.libraries.write(R+'/assets/authored/ogimachi/shop-fabric-v1.blend',{s},fake_user=True,compress=True)
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Shop draped noren and softened timber ready')
