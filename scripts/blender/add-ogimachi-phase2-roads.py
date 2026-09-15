"""Run in phase2 builder scope. Draped study roads, widths remain provisional."""
from mathutils.bvhtree import BVHTree
bvh=BVHTree.FromObject(terrain,bpy.context.evaluated_depsgraph_get())
roadmat=material('Study packed earth road',(.34,.29,.21),.95)
shouldermat=material('Study road grass shoulder',(.3,.34,.19),1)
def surface(x,z,lift):
 hit=bvh.ray_cast(Vector((x,-z,1500)),Vector((0,0,-1)))
 return (x,-z,(hit[0].z if hit[0] is not None else sample(x,z))+lift)
road_summary=[]
for road in d['roads']:
 if road['id'] not in [34320767,236248800,540155249,671938236,1268046903,1346165322,1513896552]:continue
 width=road.get('width') or (1.5 if road['kind'] in ['footway','path'] else 3.4)
 # Continuous mitered strip, subdivided lengthwise to follow the ground.
 points=[]
 for a,b in zip(road['points'],road['points'][1:]):
  length=math.hypot(b[0]-a[0],b[1]-a[1]);steps=max(1,math.ceil(length/.75))
  points.extend((a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps) for i in range(steps))
 points.append(tuple(road['points'][-1]));verts=[];faces=[];sv=[];sf=[]
 for i,(x,z) in enumerate(points):
  a=points[max(0,i-1)];b=points[min(len(points)-1,i+1)];dx,dz=b[0]-a[0],b[1]-a[1];ln=max(1e-8,math.hypot(dx,dz));nx,nz=-dz/ln,dx/ln
  verts.extend([surface(x+nx*width/2,z+nz*width/2,.035),surface(x-nx*width/2,z-nz*width/2,.035)])
  for t in [-width/2-.4,-width/2,width/2,width/2+.4]:sv.append(surface(x+nx*t,z+nz*t,.025))
  if i and -220<x<180 and -380<z<120 and -220<points[i-1][0]<180 and -380<points[i-1][1]<120:
   k=2*i;faces.append((k-2,k,k+1,k-1));j=4*i;sf.extend([(j-4,j,j+1,j-3),(j-2,j+2,j+3,j-1)])
 if faces:
  ob=mesh('Study_road_'+str(road['id']),verts,faces,roadmat);ob['width_m']=width;ob['width_status']=road.get('widthBasis','provisional class width');mesh('Study_shoulder_'+str(road['id']),sv,sf,shouldermat)
  road_summary.append({'id':road['id'],'width':width,'faces':len(faces),'basis':ob['width_status']})
(R/'artifacts/ogimachi-phases/road-mesh-inventory.json').write_text(json.dumps(road_summary,indent=2))
print({'road_surfaces':len(road_summary)})
