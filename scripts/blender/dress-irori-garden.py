"""Editable fine foliage and hollow pots; additions are stable on rerun."""
import bpy,math,random
from mathutils import Vector
s=bpy.context.scene;root=next(o for o in s.objects if o.get('osm_id')==236248710)
for o in list(s.objects):
 if o.get('irori_garden_v2'):bpy.data.objects.remove(o,do_unlink=True)
def mat(name,color,rough):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
leafmats=[mat('IG fern leaf '+str(i),c,.65) for i,c in enumerate([(.07,.14,.027),(.11,.21,.045),(.16,.25,.065)])]
clay=mat('IG weathered earthenware',(.20,.105,.056),.91);soil=mat('IG dark granular soil',(.035,.025,.016),1)
for m in [clay,soil]:
 n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
 noise=n.get('IG grain') or n.new('ShaderNodeTexNoise');noise.name='IG grain';noise.inputs['Scale'].default_value=95
 bump=n.get('IG pores') or n.new('ShaderNodeBump');bump.name='IG pores';bump.inputs['Strength'].default_value=.2;bump.inputs['Distance'].default_value=.004;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],p.inputs['Normal'])
def mesh(name,vs,fs,m):
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new(name,me);s.collection.objects.link(o);o.parent=root;o['irori_garden_v2']=True;me.materials.append(m);return o
rand=random.Random(924)
for plant,(cx,cy,base,scale) in enumerate([(-5.52,-2.28,.0,1.0),(-5.01,-3.08,0,1.25),(-4.82,-1.94,0,.74)]):
 # Closed-profile lathe: pot wall/lip/inside visible around soil.
 profile=[(.14,0),(.15,.03),(.21,.28),(.235,.29),(.235,.325),(.205,.325),(.188,.28),(.13,.065),(.0,.065)]
 vs=[];fs=[];N=48
 for radius,z in profile:
  for j in range(N):a=j*math.tau/N;vs.append((cx+math.cos(a)*radius*scale,cy+math.sin(a)*radius*scale,base+z*scale))
 for k in range(len(profile)-1):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
 pot=mesh('IG open rim planter',vs,fs,clay)
 for p in pot.data.polygons:p.use_smooth=True
 soilvs=[(cx,cy,base+.267*scale)]+[(cx+math.cos(j*math.tau/N)*.186*scale,cy+math.sin(j*math.tau/N)*.186*scale,base+.267*scale) for j in range(N)]
 mesh('IG soil surface',soilvs,[(0,j+1,(j+1)%N+1) for j in range(N)],soil)
 allvs=[[],[],[]];allfs=[[],[],[]]
 for frond in range(12):
  angle=frond*math.tau/12+rand.uniform(-.2,.2);length=rand.uniform(.43,.66)*scale;height=rand.uniform(.30,.50)*scale
  def stem(t):return Vector((cx+math.cos(angle)*length*t,cy+math.sin(angle)*length*t,base+.27*scale+height*math.sin(t*math.pi*.66)))
  # Tapered leaflet pairs along curved fronds, with central folds to catch light.
  for k in range(1,18):
   t=k/19;origin=stem(t);span=.12*scale*math.sin(math.pi*t)**.65
   for side in [-1,1]:
    direction=Vector((math.cos(angle+side*1.15),math.sin(angle+side*1.15),.18));tip=origin+direction*span;mid=origin.lerp(tip,.55);perp=Vector((-direction.y,direction.x,0))*.016*scale*math.sin(math.pi*t)
    idx=(frond+k)%3;v=allvs[idx];f=allfs[idx];n=len(v);v.extend([tuple(origin),tuple(mid+perp),tuple(mid+Vector((0,0,.006))),tuple(mid-perp),tuple(tip)]);f.extend([(n,n+1,n+2),(n,n+2,n+3),(n+1,n+4,n+2),(n+2,n+4,n+3)])
  stemvs=[];stemfs=[]
  for k in range(21):
   p=stem(k/20);stemvs.extend([tuple(p+Vector((-.002,0,0))),tuple(p+Vector((.002,0,0)))])
  for k in range(20):stemfs.append((k*2,k*2+1,k*2+3,k*2+2))
  mesh('IG fern rachis',stemvs,stemfs,leafmats[0])
 for i in range(3):mesh('IG finely divided fern',allvs[i],allfs[i],leafmats[i])
print('GARDEN',len([o for o in s.objects if o.get('irori_garden_v2')]))
