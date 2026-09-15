import bpy, math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-cushions-v3.blend',{s},fake_user=True,compress=True)
for o in list(r.children):
 if o.name.startswith('IR3 '):bpy.data.objects.remove(o,do_unlink=True)
old=[o for o in r.children if o.name.startswith('IR interior seat cushion')]
for o in old:o.hide_render=True;o.hide_set(True)
m=bpy.data.materials.get('IR3 woven indigo cotton') or bpy.data.materials.new('IR3 woven indigo cotton');m.use_nodes=True
n=m.node_tree.nodes;n.clear();l=m.node_tree.links
out=n.new('ShaderNodeOutputMaterial');p=n.new('ShaderNodeBsdfPrincipled');l.new(p.outputs[0],out.inputs[0]);p.inputs['Roughness'].default_value=.86;p.inputs['Sheen Weight'].default_value=.24
coord=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=38;l.new(coord.outputs['Generated'],noise.inputs[0]);ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.018,.035,.053,1);ramp.color_ramp.elements[1].color=(.06,.10,.13,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],p.inputs['Base Color'])
waves=[]
for axis in ['X','Y']:
 w=n.new('ShaderNodeTexWave');w.bands_direction=axis;w.inputs['Scale'].default_value=135;w.inputs['Distortion'].default_value=.5;l.new(coord.outputs['Generated'],w.inputs[0]);waves.append(w)
mult=n.new('ShaderNodeMath');mult.operation='MULTIPLY';l.new(waves[0].outputs['Color'],mult.inputs[0]);l.new(waves[1].outputs['Color'],mult.inputs[1]);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.35;bump.inputs['Distance'].default_value=.00065;l.new(mult.outputs[0],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
seammat=bpy.data.materials.new('IR3 indigo seam thread');seammat.use_nodes=True;sp=seammat.node_tree.nodes.get('Principled BSDF');sp.inputs['Base Color'].default_value=(.10,.15,.18,1);sp.inputs['Roughness'].default_value=.9
N=28
# Closed two-sided padded surface; wrinkles deform the mesh, not only the material.
def surface(u,v,top,seed):
 x=.335*u*(1-.075*abs(v)**8);y=.32*v*(1-.075*abs(u)**8)
 puff=max(0,(1-u*u)*(1-v*v))**.46
 edge=max(abs(u),abs(v));wrinkle=.006*math.sin(38*(v if abs(u)>abs(v) else u)+seed)*math.exp(-((edge-.79)/.15)**2)*puff
 dent=.019*math.exp(-(u*u+v*v)/.075)
 z=(.032+.078*puff-dent+wrinkle) if top else (.022-.022*puff)
 return (x,y,z)
def curve(name,points,rad,mat):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=1;cu.bevel_depth=rad;cu.bevel_resolution=1
 spl=cu.splines.new('POLY');spl.points.add(len(points)-1)
 for p,co in zip(spl.points,points):p.co=(*co,1)
 ob=bpy.data.objects.new('IR3 '+name,cu);s.collection.objects.link(ob);ob.parent=r;cu.materials.append(mat);ob['runtimeGroup']='cushions';return ob
for k,o in enumerate(old):
 verts=[surface(2*i/N-1,2*j/N-1,top,k*.9) for top in [True,False] for j in range(N+1) for i in range(N+1)];faces=[];off=(N+1)**2
 for j in range(N):
  for i in range(N):
   a=j*(N+1)+i;faces.append((a,a+1,a+N+2,a+N+1));faces.append((off+a+N+1,off+a+N+2,off+a+1,off+a))
 ring=list(range(N+1))+[j*(N+1)+N for j in range(1,N+1)]+[N*(N+1)+i for i in range(N-1,-1,-1)]+[j*(N+1) for j in range(N-1,0,-1)]
 for a,b in zip(ring,ring[1:]+ring[:1]):faces.append((b,a,a+off,b+off))
 me=bpy.data.meshes.new('IR3 padded zabuton');me.from_pydata(verts,[],faces);me.materials.append(m);ob=bpy.data.objects.new('IR3 padded zabuton '+str(k),me);s.collection.objects.link(ob);ob.parent=r;ob.location=(o.location.x,o.location.y,.455);ob.rotation_euler.z=[-.04,.035,.025,-.025][k];ob['runtimeGroup']='cushions'
 for p in me.polygons:p.use_smooth=True
 uv=me.uv_layers.new(name='UVMap')
 for poly in me.polygons:
  for li in poly.loop_indices:
   co=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(co.x/.67+.5,co.y/.64+.5)
 points=[(verts[i][0],verts[i][1],.027) for i in ring];points.append(points[0]);seam=curve('perimeter stitched welt '+str(k),points,.0018,seammat);seam.location=ob.location;seam.rotation_euler=ob.rotation_euler
 # Small center thread, a tied depression rather than a button.
 z=surface(0,0,True,k*.9)[2]+.001
 tuft=curve('center tuft '+str(k),[(-.009,0,z),(0,.003,z-.002),(.009,0,z)],.0014,seammat);tuft.location=ob.location;tuft.rotation_euler=ob.rotation_euler
r['interior_revision']='v3-cushions';bpy.context.view_layer.update()
cam=bpy.data.objects.get('IR3 cushion review')
if not cam:cam=bpy.data.objects.new('IR3 cushion review',bpy.data.cameras.new('IR3 cushion review'));s.collection.objects.link(cam)
cam.location=r.matrix_world@Vector((-2.08,1.48,1.20));target=r.matrix_world@Vector((-1.45,2.40,.51));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=51
bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v3.blend',{s},fake_user=True,compress=True)
oldcam=s.camera;settings=(s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples)
s.camera=cam;s.render.resolution_x=1100;s.render.resolution_y=850;s.render.filepath=R+'/artifacts/ogimachi-phases/irori-cushion-v3.png';s.cycles.samples=40
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=oldcam;s.render.resolution_x,s.render.resolution_y,s.render.filepath,s.cycles.samples=settings
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Four padded cushions, perimeter seams, center tufts, woven cotton authored; saved; rendering')
