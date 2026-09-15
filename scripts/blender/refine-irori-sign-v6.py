import bpy,math,random
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-sign-v6.blend',{s},fake_user=True,compress=True)
sign=next(o for o in r.children if o.name=='V2 irregular burl sign')
center=sum((sign.matrix_local@Vector(v)).y for v in sign.bound_box)/8
for o in r.children:
 if o.name=='V2 irregular burl sign' or o.name=='V2 shop crest':o.location.y-=center
for o in list(r.children):
 if o.name.startswith('V2 shop brush letter'):
  bpy.data.objects.remove(o,do_unlink=True)
# Hand-drawn centerlines, variable-width ribbon strokes. Coordinates: page right/down.
chars=[[
 [( .13,.12),(.10,.32),(.12,.58),(.22,.78),(.34,.77),(.45,.61)],
 [(.68,.17),(.80,.30),(.88,.52)]
],[[
 (.14,.17),(.40,.13),(.75,.12),(.60,.28),(.37,.48),(.19,.63),(.43,.51),(.69,.49),(.84,.61),(.82,.79),(.65,.90),(.43,.90),(.34,.79),(.44,.72),(.60,.77),(.69,.87)
]],[[
 (.19,.11),(.14,.29),(.18,.48),(.28,.40)],
 [(.70,.08),(.74,.28),(.71,.55),(.58,.79),(.38,.96)]
]]
mat=bpy.data.materials.get('V5 worn ivory sign paint')
for ci,strokes in enumerate(chars):
 verts=[];faces=[];rng=random.Random(440+ci)
 for stroke in strokes:
  pts=[Vector(p) for p in stroke];samples=[]
  for j in range(len(pts)-1):
   p0=pts[max(0,j-1)];p1=pts[j];p2=pts[j+1];p3=pts[min(len(pts)-1,j+2)]
   for k in range(12):
    t=k/12;samples.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
  samples.append(pts[-1]);start=len(verts)
  for j,p in enumerate(samples):
   t=j/(len(samples)-1);d=samples[min(j+1,len(samples)-1)]-samples[max(0,j-1)];d.normalize();normal=Vector((-d.y,d.x))
   width=(.021+.018*math.sin(math.pi*t)**.6)*(min(1,.2+t*15))*max(.12,min(1,(1-t)*10))
   width*=1+.12*math.sin(j*1.7+ci)
   for side in [-1,1]:
    q=p+normal*width*side
    # 0.31 m wide characters, slightly staggered hand-painted baseline.
    y=.39-ci*.34-q.x*.30;z=3.52-q.y*.39+[.015,-.014,.005][ci]
    verts.append((-4.743,y,z))
   if j:faces.append((start+2*j-2,start+2*j,start+2*j+1,start+2*j-1))
 me=bpy.data.meshes.new('Hand painted hiragana '+str(ci));me.from_pydata(verts,[],faces);me.materials.append(mat)
 ob=bpy.data.objects.new('V2 shop brush letter handmade '+str(ci),me);s.collection.objects.link(ob);ob.parent=r;ob['authored_strokes']=True
 # Plane normal points out of facade (-X).
 for p in me.polygons:
  if p.normal.x>0:p.flip()
sign['v6_centered_over_door']=True
bpy.data.libraries.write(R+'/assets/authored/ogimachi/photoreal-sign-v6.blend',{s},fake_user=True,compress=True)
s.render.filepath=R+'/artifacts/ogimachi-phases/sign-v6-final.png';s.render.resolution_percentage=100;s.cycles.samples=48
bpy.app.timers.register(lambda: (bpy.ops.render.render(write_still=True),None)[1],first_interval=.5)
print('Centered slab by',center,'meters; replaced font with handmade variable-width strokes')
