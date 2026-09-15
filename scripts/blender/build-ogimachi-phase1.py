"""Isolated GIS base study. No inferred detail is promoted to a finished replica."""
import bpy,json,math,struct
from pathlib import Path
from mathutils import Vector
ROOT=Path('/Users/jay/Claude/3D_motion')
d=json.loads((ROOT/'public/data/ogimachi/survey.json').read_text())
meta=d['dem']; raw=(ROOT/'public/data/ogimachi/dem.f32').read_bytes(); vals=struct.unpack('<%sf'%(len(raw)//4),raw)
def height(x,z):
 u=max(0,min(meta['size']-1.000001,(x-meta['minX'])/meta['step']));v=max(0,min(meta['size']-1.000001,(z-meta['minZ'])/meta['step']))
 ix,iz=int(u),int(v);a,b=u-ix,v-iz;k=iz*meta['size']+ix;n=meta['size']
 return vals[k]*(1-a)*(1-b)+vals[k+1]*a*(1-b)+vals[k+n]*(1-a)*b+vals[k+n+1]*a*b
scene=bpy.data.scenes.new('Ogimachi_Phase1_GIS_Base');bpy.context.window.scene=scene
scene['status']='GIS base study only; building heights estimated; no reference-video alignment certified'
scene['coordinates']='Blender X=east Y=north Z=relative elevation; game X=x Y=height Z=-y'
def mat(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9;return m
terrainmat=mat('Study terrain',(.28,.36,.22));roadmat=mat('Survey road centreline',(.8,.56,.18));fieldmat=mat('Survey field outline',(.18,.48,.46));buildingmat=mat('Footprint volumes — estimated height',(.65,.61,.49))
def mesh(name,verts,faces,material):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();ob=bpy.data.objects.new(name,me);scene.collection.objects.link(ob);ob.data.materials.append(material);return ob
# North central village region including current ACT1 frontage and northern approach.
x0,x1,z0,z1=-220,180,-380,120;step=4;nx=int((x1-x0)/step)+1;nz=int((z1-z0)/step)+1
vertices=[(x0+i*step,-(z0+j*step),height(x0+i*step,z0+j*step)) for j in range(nz) for i in range(nx)]
faces=[]
for j in range(nz-1):
 for i in range(nx-1):
  a=j*nx+i;faces.extend([(a,a+nx,a+1),(a+1,a+nx,a+nx+1)])
mesh('GSI_terrain_4m',vertices,faces,terrainmat)
def line(name,points,material,radius,closed=False):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=radius;cu.bevel_resolution=0
 sp=cu.splines.new('POLY');sp.points.add(len(points)-1)
 for p,(x,z) in zip(sp.points,points):p.co=(x,-z,height(x,z)+.35,1)
 sp.use_cyclic_u=closed;ob=bpy.data.objects.new(name,cu);scene.collection.objects.link(ob);cu.materials.append(material)
def within(p):return x0<=p[0]<=x1 and z0<=p[1]<=z1
count=0
for b in d['buildings']:
 if not within((b['x'],b['z'])):continue
 pts=b['points'];pts=pts[:-1] if pts[0]==pts[-1] else pts
 n=len(pts);base=height(b['x'],b['z']);h=max(2.8,b.get('levels',1)*2.8)
 verts=[(x,-z,base+dz) for dz in (0,h) for x,z in pts]
 fs=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 ob=mesh('Footprint_'+str(b['id']),verts,fs,buildingmat);ob['osm_id']=str(b['id']);ob['height_status']='estimated placeholder';count+=1
roads=0
for r in d['roads']:
 # Segment clipping retains paths crossing the review bounds.
 for a,b in zip(r['points'],r['points'][1:]):
  dx,dz=b[0]-a[0],b[1]-a[1];lo,hi=0.,1.
  for p,q in [(-dx,a[0]-x0),(dx,x1-a[0]),(-dz,a[1]-z0),(dz,z1-a[1])]:
   if abs(p)<1e-10:
    if q<0:hi=-1
   elif p<0:lo=max(lo,q/p)
   else:hi=min(hi,q/p)
  if lo>hi:continue
  length=math.hypot(dx,dz)*(hi-lo);steps=max(1,math.ceil(length/2))
  pts=[(a[0]+dx*(lo+(hi-lo)*i/steps),a[1]+dz*(lo+(hi-lo)*i/steps)) for i in range(steps+1)]
  line('Road_axis_'+str(r['id']),pts,roadmat,.35);roads+=1
fields=0
for f in d['fields']:
 if all(within(p) for p in f['points']):line('Field_'+str(f['id']),f['points'],fieldmat,.22,True);fields+=1
world=bpy.data.worlds.new('Phase1 daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.8,1);world.node_tree.nodes['Background'].inputs[1].default_value=.7;scene.world=world
sun=bpy.data.lights.new('Phase1 sun','SUN');sun.energy=2;ob=bpy.data.objects.new('Phase1 sun',sun);scene.collection.objects.link(ob);ob.rotation_euler=(.5,-.4,-.5)
cam=bpy.data.cameras.new('Phase1 overview');ob=bpy.data.objects.new('Phase1 overview',cam);scene.collection.objects.link(ob);ob.location=(320,480,420);target=Vector((-20,120,0));ob.rotation_euler=(target-ob.location).to_track_quat('-Z','Y').to_euler();cam.type='ORTHO';cam.ortho_scale=650;scene.camera=ob
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
out=ROOT/'artifacts/ogimachi-phases';out.mkdir(parents=True,exist_ok=True)
scene.render.filepath=str(out/'phase1-gis-base.png')
bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/phase1-gis-base.blend'),{scene},fake_user=True)
(out/'phase1-inventory.json').write_text(json.dumps({'bounds':[x0,x1,z0,z1],'buildings':count,'road_segments':roads,'fields':fields,'terrain_vertices':len(vertices),'status':'GIS scaffold, not visually matched replica'},indent=2))
print({'scene':scene.name,'buildings':count,'road_segments':roads,'fields':fields,'saved':'phase1-gis-base.blend'})
