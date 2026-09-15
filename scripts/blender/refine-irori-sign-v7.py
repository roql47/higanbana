import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from mathutils.bvhtree import BVHTree
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
# Original v6 checkpoint remains in photoreal-sign-v6.blend.
for o in list(r.children):
 if o.name.startswith('V2 shop brush letter') or o.name=='V2 shop crest':bpy.data.objects.remove(o,do_unlink=True)
# Outlines observed in enlarged official entrance photo: diagonal layout, broad
# hooked i, open ro (not a closed modern font loop), descending ri.
paths=[[(270,128),(280,137),(292,161),(302,177),(308,151),(308,180),(301,197),(290,198),(284,182),(278,161)],[(316,107),(327,115),(335,131),(341,148),(340,158),(332,158),(326,147),(322,126)],[(344,169),(355,175),(374,181),(377,191),(369,216),(362,240),(372,233),(382,233),(391,241),(394,253),(391,264),(381,276),(368,283),(377,270),(382,259),(382,249),(376,245),(368,247),(360,259),(352,260),(352,247),(358,221),(364,197),(353,190)],[(405,237),(411,247),(414,270),(412,288),(409,298),(404,296),(402,282),(403,258)],[(421,258),(430,254),(439,262),(443,284),(443,310),(438,328),(430,342),(418,354),(425,339),(431,321),(433,300),(431,280),(428,267),(423,278),(419,287),(418,274)]]
sign=next(o for o in r.children if o.name=='V2 irregular burl sign');verts=[sign.matrix_local@v.co for v in sign.data.vertices];tree=BVHTree.FromPolygons(verts,[list(p.vertices) for p in sign.data.polygons])
# Keep paint inside the actual irregular silhouette, including 3 cm clearance.
def coord(p,k=1):return Vector((-4.743,(.5-(p[0]-270)/173)*.60*k,3.19+(.5-(p[1]-107)/247)*.47*k))
def inside(v):
 return all(tree.ray_cast(Vector((-6,v.y+dy,v.z+dz)),Vector((1,0,0)),3)[0] is not None for dy,dz in [(0,0),(.03,0),(-.03,0),(0,.03),(0,-.03)])
k=1
while not all(inside(coord(p,k)) for path in paths for p in path):
 k*=.95
 if k<.5:raise RuntimeError('Cannot safely fit sign lettering')
mat=bpy.data.materials.get('V5 worn ivory sign paint')
for i,path in enumerate(paths):
 vs=[coord(p,k) for p in path];tris=tessellate_polygon([vs]);idx={tuple(v):j for j,v in enumerate(vs)};faces=[tuple(v if isinstance(v,int) else idx[tuple(v)] for v in t) for t in tris]
 me=bpy.data.meshes.new('Reference brush outline');me.from_pydata(vs,[],faces);me.update()
 for p in me.polygons:
  if p.normal.x>0:p.flip()
 me.materials.append(mat);ob=bpy.data.objects.new('V2 shop brush letter reference '+str(i),me);s.collection.objects.link(ob);ob.parent=r;ob['reference_outline']=True
bpy.data.libraries.write(R+'/assets/authored/ogimachi/photoreal-sign-v7.blend',{s},fake_user=True,compress=True)
s.render.filepath=R+'/artifacts/ogimachi-phases/sign-v7-final.png';s.render.resolution_percentage=100;s.cycles.samples=48
bpy.app.timers.register(lambda:(bpy.ops.render.render(write_still=True),None)[1],first_interval=.5)
print('Removed crest. Reference outline scale',k,'all outline vertices have 3cm silhouette clearance')
