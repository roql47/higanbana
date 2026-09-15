"""Second visual correction after reviewing test render; run after correct-irori-reference-v2."""
exec(compile(open('/Users/jay/Claude/3D_motion/scripts/blender/correct-irori-reference-v2.py').read(),'correct-irori-reference-v2.py','exec'))
# Rounded live edge, small bark fissures; avoids a star-like silhouette.
o=next(o for o in r.children if o.name=='V2 irregular burl sign');bpy.data.objects.remove(o,do_unlink=True)
outline=[(-.69,-.25),(-.79,-.11),(-.70,.05),(-.73,.29),(-.56,.25),(-.44,.43),(-.20,.30),(-.03,.35),(.18,.27),(.37,.37),(.42,.22),(.63,.17),(.59,-.01),(.69,-.17),(.48,-.31),(.22,-.34),(.04,-.27),(-.16,-.36),(-.37,-.28),(-.59,-.32)]
# Smooth Catmull-Rom perimeter sampled six times per segment.
edge=[]
for k in range(len(outline)):
 a,b,c,d=[Vector(outline[i%len(outline)]) for i in [k-1,k,k+1,k+2]]
 for j in range(6):
  t=j/6;p=.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);edge.append((p.x+.15,p.y+3.17))
N=len(edge);vs=[(x,y,z) for x in [-4.74,-4.57] for y,z in edge];fs=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];o=mesh('V2 irregular burl sign',vs,fs,burl);be=o.modifiers.new('Rounded weathered edge','BEVEL');be.width=.013;be.segments=3
# Flowing burl fibers with irregular rings instead of a flat soft noise fill.
n=burl.node_tree.nodes;l=burl.node_tree.links;p=n.get('Principled BSDF');tc=next(v for v in n if v.type=='TEX_COORD');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(.3,1.1,1.9);l.new(tc.outputs['Generated'],mapping.inputs[0]);wave=n.new('ShaderNodeTexWave');wave.wave_type='RINGS';wave.rings_direction='X';wave.inputs['Scale'].default_value=9;wave.inputs['Distortion'].default_value=6;wave.inputs['Detail'].default_value=5;l.new(mapping.outputs[0],wave.inputs[0]);ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.075,.029,.008,1);ra.color_ramp.elements[1].color=(.22,.095,.028,1);l.new(wave.outputs[0],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);bump=next(v for v in n if v.type=='BUMP');bump.inputs['Distance'].default_value=.002;l.new(wave.outputs[0],bump.inputs['Height'])
# Align brush characters on the right half, as in the reference sign.
letters=[o for o in r.children if o.type=='FONT' and o.get('entrance_correction_v2')]
for o,y,z,sz in zip(letters,[.19,-.03,-.25],[3.31,3.13,3.21],[.36,.39,.41]):o.location.y=y;o.location.z=z;o.data.size=sz
# Pale circular crest, editable curves, suggested by the visible reference emblem.
cu=bpy.data.curves.new('V2 shop crest','CURVE');cu.dimensions='3D';cu.bevel_depth=.012;cu.bevel_resolution=3;sp=cu.splines.new('POLY');sp.points.add(63)
for i,pnt in enumerate(sp.points):a=i*math.tau/64;pnt.co=(-4.752,.56+.125*math.cos(a),3.10+.15*math.sin(a),1)
sp.use_cyclic_u=True;o=bpy.data.objects.new('V2 shop crest',cu);s.collection.objects.link(o);o.parent=r;cu.materials.append(ivory);own(o)
# Bring the two lantern assemblies closer to the sign. Store original vertices to avoid drift.
for ob in [o for o in r.children if o.type=='MESH' and any(t in o.name for t in ['Dark structural timber','cream paper','pale shoji'])]:
 if ob.get('v2_lamps_inset'):continue
 for ids,lo,hi in components(ob):
  mid=(lo[1]+hi[1])*.5
  if lo[0]<-4.56 and lo[2]>2.7 and hi[2]<3.7 and .95<abs(mid)<1.5:
   delta=Vector((0,-math.copysign(.32,mid),0));local=ob.matrix_local.to_3x3().inverted()@delta
   for i in ids:ob.data.vertices[i].co+=local
 ob['v2_lamps_inset']=True
# Thatch: straw tan, short broken tips rather than a row of long teeth.
roof=next(o for o in r.children if 'Bound kaya reeds' in o.name);old=roof.data.materials[0];m=bpy.data.materials.get('V2 aged golden kaya')
if not m:m=old.copy();m.name='V2 aged golden kaya'
roof.data.materials[0]=m;n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF');tex=next((v for v in n if v.type=='TEX_IMAGE' and v.image and v.image.colorspace_settings.name=='sRGB'),None)
if tex:
 mix=n.get('V2 straw tint') or n.new('ShaderNodeMixRGB');mix.name='V2 straw tint';mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(1.35,.95,.58,1);l.new(tex.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Base Color'])
p.inputs['Roughness'].default_value=.94
ob=next(o for o in r.children if o.name=='PR fine irregular thatch edge')
if not ob.get('v2_short_tips'):
 for i in range(0,len(ob.data.vertices),6):
  for j in range(3):ob.data.vertices[i+3+j].co=ob.data.vertices[i+j].co.lerp(ob.data.vertices[i+3+j].co,.44)
 ob['v2_short_tips']=True
# Replace straight sticks with a connected, crooked root sculpture.
for o in list(r.children):
 if o.name.startswith('V2 gnarled garden root'):bpy.data.objects.remove(o,do_unlink=True)
rng=random.Random(516)
for j in range(7):
 y=-2.65+rng.uniform(-.30,.30);x=-4.65-rng.random()*.16;h=rng.uniform(1.7,2.8);pts=[]
 for k in range(25):
  t=k/24;pts.append((x+.12*math.sin(t*8+j),y+.20*math.sin(t*7+j*.8),.1+t*h))
 branch('V2 twisted old root trunk',pts,[.09*(1-k/30)+.045*math.sin(k*.6+j)**2 for k in range(25)])
 for side in [-1,1]:
  base=Vector(pts[14]);p2=base+Vector((-.12,side*.38,.15));p3=base+Vector((.05,side*.60,.53));points=[]
  for k in range(16):
   t=k/15;points.append(tuple((1-t)**2*base+2*t*(1-t)*p2+t*t*p3))
  branch('V2 crooked root fork',points,[.07*(1-k/16)+.008 for k in range(16)])
# Fine arching grass foliage in front of the root base and lantern.
grassm=material('V2 slender garden grass',(.17,.28,.045),.76)
for cx,cy,base,sc in [(-5.46,-2.25,.30,1),(-4.96,-2.91,.37,1.25)]:
 vs=[];fs=[]
 for j in range(145):
  a=rng.random()*math.tau;h=rng.uniform(.28,.68)*sc;reach=rng.uniform(.18,.39)*sc;start=Vector((cx+rng.uniform(-.06,.06),cy+rng.uniform(-.06,.06),base));side=Vector((-math.sin(a),math.cos(a),0));idx=len(vs)
  for k in range(12):
   t=k/11;pt=start+Vector((math.cos(a)*reach*t*t,math.sin(a)*reach*t*t,h*math.sin(t*1.8)));width=.009*sc*(1-t)**.6+.0002;vs.extend([tuple(pt-side*width),tuple(pt+side*width)])
  for k in range(11):fs.append((idx+2*k,idx+2*k+1,idx+2*k+3,idx+2*k+2))
 mesh('V2 arching fine garden grass',vs,fs,grassm)
# Gravel ground at the entrance instead of a smooth green plane.
ground=material('V2 entrance compacted grit',(.17,.145,.10),.98);n=ground.node_tree.nodes;l=ground.node_tree.links;p=n.get('Principled BSDF');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=74;tex.inputs['Detail'].default_value=3;ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.085,.071,.048,1);ra.color_ramp.elements[1].color=(.29,.25,.18,1);l.new(tex.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color']);b=n.new('ShaderNodeBump');b.inputs['Distance'].default_value=.012;b.inputs['Strength'].default_value=.3;l.new(tex.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
# Patch stays beneath the existing raised doorstep.
mesh('V2 entrance earth apron',[(-7.4,2.6,.009),(-7.4,-4.1,.009),(-4.4,-4.1,.009),(-4.4,2.6,.009)],[(0,1,2,3)],ground)
# Maintain corrected approach angle; composition now includes more roof and right garden.
s.render.filepath='/Users/jay/Claude/3D_motion/artifacts/ogimachi-phases/entrance-correction-test2.png'
print('REFINED',len([o for o in s.objects if o.get('entrance_correction_v2')]))
# Final render review: subtle burl grain and ground following the actual terrain.
n=burl.node_tree.nodes;l=burl.node_tree.links;p=n.get('Principled BSDF');wave=next(v for v in n if v.type=='TEX_WAVE');wave.inputs['Distortion'].default_value=13;wave.inputs['Scale'].default_value=17
ra=next(link.from_node for link in p.inputs['Base Color'].links);ra.color_ramp.elements[0].color=(.085,.041,.018,1);ra.color_ramp.elements[1].color=(.125,.067,.028,1)
# Local grain and raised burls in rootwood, with muted weathered color.
n=bark.node_tree.nodes;l=bark.node_tree.links;p=n.get('Principled BSDF');tc=n.new('ShaderNodeTexCoord');scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(15,15,1.4);l.new(tc.outputs['Generated'],scale.inputs[0]);tex=next(v for v in n if v.type=='TEX_NOISE');tex.inputs['Scale'].default_value=7;l.new(scale.outputs[0],tex.inputs[0]);ra=n.new('ShaderNodeValToRGB');ra.color_ramp.elements[0].color=(.028,.024,.017,1);ra.color_ramp.elements[1].color=(.19,.15,.094,1);l.new(tex.outputs['Fac'],ra.inputs[0]);l.new(ra.outputs[0],p.inputs['Base Color'])
from mathutils import noise as mnoise
for ob in [o for o in r.children if o.name.startswith(('V2 twisted old root','V2 crooked root'))]:
 for v in ob.data.vertices:
  nn=mnoise.noise_vector(Vector((v.co.x*11,v.co.y*11,v.co.z*3)));v.co+=nn*.009
# Follow the terrain mesh in world space; preserve doorstep height and all GIS data.
old=next(o for o in r.children if o.name=='V2 entrance earth apron');bpy.data.objects.remove(old,do_unlink=True)
terrain=next(o for o in s.objects if o.name=='Block terrain crop.006');inv=terrain.matrix_world.inverted();ri=r.matrix_world.inverted();vs=[];fs=[];NX,NY=30,67
for i in range(NX+1):
 for j in range(NY+1):
  x=-7.4+3*i/NX;y=-4.1+6.7*j/NY;world=r.matrix_world@Vector((x,y,4));origin=inv@world;direction=inv.to_3x3()@Vector((0,0,-1));hit,loc,norm,idx=terrain.ray_cast(origin,direction.normalized())
  z=(ri@(terrain.matrix_world@loc)).z if hit else 0
  vs.append((x,y,z+.009))
for i in range(NX):
 for j in range(NY):a=i*(NY+1)+j;fs.append((a,a+NY+1,a+NY+2,a+1))
mesh('V2 entrance earth apron',vs,fs,ground)
print('FINAL SURFACE CORRECTIONS')
