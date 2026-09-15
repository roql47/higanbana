import bpy,math
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248704)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-shop-canopy-v3.blend',{s},fake_user=True,compress=True)
o=next(o for o in r.children if 'weathered canopy' in o.name)
if not o.get('canopy_v3'):
 o.data=o.data.copy();o.data.transform(o.matrix_local);o.matrix_basis.identity()
 ids={i for p in list(o.data.polygons)[:6] for i in p.vertices}
 for i in ids:
  v=o.data.vertices[i];t=(-v.co.y-4.252)/1.493;v.co.z+=.15-.30*t
 o.data.update();o['canopy_v3']=True
m=bpy.data.materials.get('Shop aged metal canopy') or bpy.data.materials.new('Shop aged metal canopy');m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;p=n.new('ShaderNodeBsdfPrincipled');out=n.new('ShaderNodeOutputMaterial');l.new(p.outputs[0],out.inputs[0]);p.inputs['Metallic'].default_value=.35;p.inputs['Roughness'].default_value=.74
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8;noise.inputs['Detail'].default_value=3;ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.055,.065,.06,1);ra.color_ramp.elements[1].color=(.14,.16,.15,1);l.new(noise.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.12;b.inputs['Distance'].default_value=.0008;l.new(noise.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
if m.name not in [ma.name for ma in o.data.materials]:o.data.materials.append(m)
mi=list(o.data.materials).index(m)
for poly in list(o.data.polygons)[:12]:poly.material_index=mi
for ob in list(r.children):
 if ob.name.startswith('Shop V3 canopy'):bpy.data.objects.remove(ob,do_unlink=True)
wood=bpy.data.materials.get('Dark structural timber.072')
def beam(name,a,b,width,depth,mat):
 a,b=Vector(a),Vector(b);d=b-a
 bpy.ops.mesh.primitive_cube_add(size=1);ob=bpy.context.object;ob.name='Shop V3 canopy '+name;ob.parent=r;ob.location=(a+b)/2;ob.rotation_euler=d.to_track_quat('Z','Y').to_euler();ob.scale=(width,depth,d.length)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ob.data.materials.append(mat);be=ob.modifiers.new('Soft folded edges','BEVEL');be.width=min(width,depth)*.16;be.segments=2;return ob
# Front: seams run with water fall, hems finish the low edge.
for i in range(15):
 x=-4.15+i*8.3/14;beam('front folded seam', (x,-4.27,3.307),(x,-5.72,3.161),.018,.02,m)
beam('front drip hem',(-4.2,-5.745,3.13),(4.2,-5.745,3.13),.045,.055,m)
# Side canopy already falls outward; align seams along its slope.
for i in range(18):
 y=-5.12+i*10.04/17;beam('side folded seam',(-3.42,y,3.30),(-4.73,y,3.166),.018,.02,m)
beam('side drip hem',(-4.748,-5.175,3.13),(-4.748,4.975,3.13),.045,.055,m)
# Shallow rafters bear on the existing wall; brace stays above openings.
for x in [-3.5,-1.75,0,1.75,3.5]:
 beam('front underside rafter',(x,-4.25,3.18),(x,-5.72,3.03),.075,.095,wood)
for y in [-4,-2,0,2,4]:
 beam('side underside rafter',(-3.42,y,3.18),(-4.72,y,3.05),.075,.095,wood)
 beam('side knee brace',(-3.64,y,2.66),(-4.32,y,3.04),.07,.07,wood)
cam=bpy.data.objects['Shop textile review'];old=s.camera;s.camera=cam;s.render.filepath=R+'/artifacts/ogimachi-phases/shop-canopy-v3.png';s.cycles.samples=40
bpy.data.libraries.write(R+'/assets/authored/ogimachi/shop-canopy-v3.blend',{s},fake_user=True,compress=True)
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Front canopy outward fall corrected; seams hems rafters and braces authored')
