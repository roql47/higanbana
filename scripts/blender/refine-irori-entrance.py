"""Rebuild the visible entrance assembly from the official exterior photograph.
Photo proportions only: not a surveyed reconstruction of the whole building.
Executed before material consolidation with root/ns/w available.
"""
if restaurant:
 import random
 rand=random.Random(3741)
 # Remove the coarse entrance ornament and make separate, curved replacements.
 for ob in list(root.children):
  if ob.name.startswith(('Irregular slab shop sign','Irori sign lettering','Stone lantern','Tanuki','Entrance door upright','Entrance sliding sash rail','Door lower fine lattice','Vertical lantern','Lantern timber')):
   bpy.data.objects.remove(ob,do_unlink=True)
 face=-w/2-.22
 def objmesh(name,vs,fs,mat):return ns['mesh'](name,vs,fs,mat)
 def smoothsphere(name,p,scale,mat):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,radius=1,location=p);o=bpy.context.object;o.name=name;o.scale=scale;o.parent=root;o.data.materials.append(mat)
  for poly in o.data.polygons:poly.use_smooth=True
  return o
 # Two sliding leaves: close lower bars, larger upper lights and separate tracks.
 for cy in [-.5,.5]:
  for yy in [cy-.49,cy,cy+.49]:box('Entrance leaf stile',(.10,.048,2.13),(face,yy,1.36),wood)
  for z in [.30,.88,1.38,1.91,2.42]:box('Entrance leaf rail',(.105,.98,.040),(face,cy,z),wood)
  for j in range(9):box('Entrance lower slender lattice',(.065,.021,1.10),(face-.018,cy-.45+j*.1125,.85),frame)
  box('Sliding leaf worn bottom rail',(.12,.99,.085),(face-.01,cy,.29),wood)
  box('Door pull',(.035,.025,.16),(face-.075,cy+.34,1.24),ns['metal'])
 for z in [.25,2.47]:box('Dark sliding door track',(.17,2.1,.035),(face,0,z),ns['metal'])
 # Reference slab is upright with a natural live edge, sitting clear below the thatch.
 outline=[(-.54,-.44),(-.63,-.24),(-.59,-.03),(-.68,.19),(-.52,.42),(-.31,.39),(-.13,.52),(.1,.44),(.37,.40),(.51,.22),(.56,-.04),(.44,-.33),(.16,-.43),(-.13,-.46)]
 vs=[(face+dx,y,3.22+z) for dx in [-.095,.06] for y,z in outline];n=len(outline)
 fs=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 sign=objmesh('Live edge Irori sign',vs,fs,wood);bev=sign.modifiers.new('Rounded sign edge','BEVEL');bev.width=.025;bev.segments=3;bpy.context.view_layer.objects.active=sign;bpy.ops.object.modifier_apply(modifier=bev.name)
 # Arrange text vertically staggered like the source; this is still a font approximation.
 font=next(Path('/System/Library/Fonts').glob('*W5.ttc'))
 for letter,yy,zz,size in [('い',-.04,3.49,.32),('ろ',-.15,3.22,.35),('り',-.29,3.00,.35)]:
  cu=bpy.data.curves.new('Shop name letter','FONT');cu.body=letter;cu.font=bpy.data.fonts.load(str(font));cu.align_x='CENTER';cu.align_y='CENTER';cu.size=size;cu.extrude=.002
  ob=bpy.data.objects.new('Shop name letter',cu);scene.collection.objects.link(ob);ob.parent=root;ob.location=(face-.101,yy,zz);ob.rotation_euler=(math.pi/2,0,-math.pi/2);cu.materials.append(ns['cream']);bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
 # Twin narrow lanterns with individual battens, caps and paper ribs.
 for yy in [-1.24,1.24]:
  box('Lantern warm paper',(.17,.20,.70),(face-.13,yy,3.16),ns['cream'])
  for dy in [-.12,-.04,.04,.12]:box('Lantern fine cage upright',(.045,.020,.78),(face-.235,yy+dy,3.16),frame)
  for z in [2.77,3.55]:box('Lantern cage cap',(.26,.28,.038),(face-.13,yy,z),frame)
  for j in range(9):box('Lantern paper horizontal rib',(.018,.20,.006),(face-.22,yy,2.83+j*.082),ns['white'])
 # Curved stone roof, squat chamber, narrow column: no pyramid cap.
 x,y=-w/2-.70,-1.85
 ns['cylinder']('Stone lantern base',(x,y,.12),.28,.24,stone)
 ns['cylinder']('Stone lantern stem',(x,y,.55),.105,.68,stone)
 box('Stone lantern square tray',(.48,.48,.09),(x,y,.90),stone)
 for dx in [-.17,.17]:
  for dy in [-.17,.17]:box('Stone lantern corner pillar',(.065,.065,.32),(x+dx,y+dy,1.10),stone)
 box('Stone lantern dark interior',(.16,.16,.20),(x,y,1.10),frame)
 vs=[];rings=[(.48,1.25),(.35,1.28),(.23,1.38),(.10,1.53)]
 for span,z in rings:
  for i in range(32):
   a=math.tau*i/32;cs,sn=math.cos(a),math.sin(a);den=max(abs(cs),abs(sn));vs.append((x+span*cs/den,y+span*sn/den,z+.07*(min(abs(cs),abs(sn))**2 if span>.4 else 0)))
 fs=[(r*32+i,r*32+(i+1)%32,(r+1)*32+(i+1)%32,(r+1)*32+i) for r in range(3) for i in range(32)]
 cap=objmesh('Stone lantern curved roof',vs,fs,stone)
 for p in cap.data.polygons:p.use_smooth=True
 smoothsphere('Stone lantern finial',(x,y,1.57),(.07,.07,.13),stone)
 # Rounded glazed tanuki: cheeks, muzzle, paws, feet, eyes, textured wide hat.
 x,y=-w/2-.77,-1.16
 clay=ns['material']('Tanuki glazed brown',(.15,.10,.065),.35)
 belly=ns['material']('Tanuki aged pale clay',(.43,.38,.27),.60)
 dark=ns['material']('Tanuki dark glaze',(.018,.014,.011),.28)
 smoothsphere('Tanuki rounded body',(x,y,.53),(.24,.23,.43),clay)
 smoothsphere('Tanuki oval belly',(x-.205,y,.51),(.042,.17,.27),belly)
 smoothsphere('Tanuki head',(x,y,1.02),(.22,.23,.23),clay)
 for side in [-1,1]:
  smoothsphere('Tanuki ear',(x+.015,y+side*.19,1.16),(.09,.08,.10),clay)
  smoothsphere('Tanuki eye mask',(x-.19,y+side*.092,1.05),(.035,.065,.065),dark)
  smoothsphere('Tanuki eye',(x-.218,y+side*.092,1.055),(.018,.028,.031),belly)
  smoothsphere('Tanuki pupil',(x-.235,y+side*.092,1.058),(.009,.013,.018),dark)
  smoothsphere('Tanuki paw',(x-.10,y+side*.235,.62),(.10,.07,.20),clay)
  smoothsphere('Tanuki foot',(x-.08,y+side*.13,.12),(.17,.10,.10),clay)
 smoothsphere('Tanuki muzzle',(x-.22,y,.96),(.075,.12,.064),belly)
 smoothsphere('Tanuki nose',(x-.28,y,.99),(.036,.05,.027),dark)
 smoothsphere('Tanuki hat brim',(x,y,1.23),(.30,.34,.035),wood)
 smoothsphere('Tanuki hat crown',(x+.02,y,1.30),(.18,.21,.12),wood)
 # Layer the plants around the stone lantern, with airy tall stems behind.
 for j in range(17):
  yy=-2.1-rand.random()*.9;xx=-w/2-.20-rand.random()*.40;h=rand.uniform(.6,1.55)
  beam('Garden woody stem',(xx,yy,.25),(xx+.10,yy+.04,h),.013,frame)
  for k in range(5):
   z=.35+(h-.35)*(k+1)/6;a=j*1.7+k*2.1;length=.18+rand.random()*.18
   v=[(xx,yy,z),(xx+math.cos(a)*length*.5-.035,yy+math.sin(a)*length*.5,z+.10),(xx+math.cos(a)*length,yy+math.sin(a)*length,z+.14),(xx+math.cos(a)*length*.5+.035,yy+math.sin(a)*length*.5,z+.10)]
   objmesh('Garden pointed broad leaf',v,[(0,1,2),(0,2,3)],ns['leaf'])
 # Source entrance has a full sign-height band above the lintel; previous low eave hid it.
 for ob in root.children:
  if ob.name.startswith(('Curved deep kaya roof','Ridge cap','Boarded gable','Gable rake','Exposed under-eave rafter')):ob.location.z+=.55
 box('Raised entrance upper timber wall',(w,d,.55),(0,0,3.64),wood)
 for side in [-1,1]:
  for yy in [-d/2,0,d/2]:box('Upper bay post extension',(.16,.16,.56),(side*w/2,yy,3.65),frame)
