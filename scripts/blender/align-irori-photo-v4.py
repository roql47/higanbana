"""Reference crop alignment: measured image coordinates, inferred physical geometry.
Run after the v3 roof/wall finish; stable v4 deltas are stored per edited mesh/object.
"""
import bpy,math,json,random
import numpy as np
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
R='/Users/jay/Claude/3D_motion'
fit=json.load(open(R+'/artifacts/ogimachi-phases/alignment-v4-landmarks.json'));q=fit['camera_parameters'];cam=s.camera
cam.location=r.matrix_world@Vector(q[:3]);target=r.matrix_world@Vector((-4.57,q[3],q[4]));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=q[5];cam.data.sensor_width=36;cam.data.sensor_fit='HORIZONTAL'
# Fit only the eave height; do not apply unconstrained camera/plane solutions that move the GIS roof.
def error(dz):
 values=[]
 for y in [2,0,-2,-4]:
  p=world_to_camera_view(s,cam,r.matrix_world@Vector((-5.23,y,3.9+dz)));values.append((1-p.y)*500-(25+.188*p.x*612))
 return np.array(values)
e=error(0);derivative=(error(.001)-e)/.001;dz=float(np.clip(-np.dot(e,derivative)/np.dot(derivative,derivative),-.55,0));print('eave dz',dz,'residual px',error(dz).tolist())
# Ease deformation into slope, keep ridge, rear roof and wall/GIS coordinates fixed.
for ob in r.children:
 if ob.type!='MESH' or not ob.name.startswith(('V3 thick curved front thatch pack','V3 packed irregular cut reed tips','V3 overlapping sloped reed fibers','V3 loose edge fibers')):continue
 if ob.get('v4_eave_adjusted'):continue
 ob['v4_source_mesh']=ob.data.name;ob.data=ob.data.copy()
 for v in ob.data.vertices:
  w=max(0,min(1,(-v.co.x-2.6)/(5.10-2.6)));w=w*w*(3-2*w);v.co.z+=dz*w
 ob['v4_eave_adjusted']=dz
# Source photo has a smaller off-centre sign and unequal visual lamp spacing.
for ob in r.children:
 if ob.name.startswith(('V2 irregular burl sign','V2 shop brush letter','V2 shop crest')) and not ob.get('v4_sign_shift'):
  ob.location.y+=.32;ob['v4_sign_shift']=True
# Transform only lamp sub-components inside merged material objects.
def components(ob):
 par=list(range(len(ob.data.vertices)))
 def f(a):
  while par[a]!=a:par[a]=par[par[a]];a=par[a]
  return a
 for e in ob.data.edges:a,b=map(f,e.vertices);par[b]=a
 groups={}
 for v in ob.data.vertices:groups.setdefault(f(v.index),[]).append(v.index)
 for ids in groups.values():
  ps=[ob.matrix_local@ob.data.vertices[i].co for i in ids];yield ids,[min(v[a] for v in ps) for a in range(3)],[max(v[a] for v in ps) for a in range(3)]
for ob in r.children:
 if ob.type!='MESH' or not any(key in ob.name for key in ['Dark structural timber','cream paper','pale shoji']) or ob.get('v4_lamps_adjusted'):continue
 ob.data=ob.data.copy();inv=ob.matrix_local.inverted()
 for ids,lo,hi in components(ob):
  mid=(lo[1]+hi[1])*.5
  if not (lo[0]<-4.56 and lo[2]>2.7 and hi[2]<3.7 and .65<abs(mid)<1.15):continue
  for i in ids:
   v=ob.matrix_local@ob.data.vertices[i].co;v.z=3.16+(v.z-3.16)*.72;v.y+=.51 if mid>0 else -.05;ob.data.vertices[i].co=inv@v
 ob['v4_lamps_adjusted']=True
# Hide the invented orange sticks/counter from the previous interior placeholder.
for ob in r.children:
 if ob.name.startswith(('V2 interior screen post','V2 interior reception counter')):ob.hide_render=True;ob.hide_set(True)
for ob in s.objects:
 if ob.name=='V2 interior bounce':ob.data.energy=7
# Check photographic corner alignment after camera assignment using Blender's actual projection.
projected=[]
for p in fit['door_corners_local']:
 n=world_to_camera_view(s,cam,r.matrix_world@Vector(p));projected.append([n.x*612,(1-n.y)*500])
fit['blender_projected_px']=projected;fit['eave_height_delta_m']=dz;fit['eave_target_line_px']={'intercept':25,'slope':.188};fit['eave_residual_px']=error(dz).tolist();json.dump(fit,open(R+'/artifacts/ogimachi-phases/alignment-v4-landmarks.json','w'),indent=2)
s.render.resolution_x=1530;s.render.resolution_y=1250;s.render.resolution_percentage=50;s.cycles.samples=32;s.render.filepath=R+'/artifacts/ogimachi-phases/alignment-v4-geometry-test.png'
print('Photo alignment applied; door projected',projected)
