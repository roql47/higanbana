"""ACT1 western frontage, traced envelopes plus observed 2010/2012 street elevations.
Unseen rear details and heights are estimates. No reference imagery is baked.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_ACT1_frontage'
survey=json.loads((ROOT/'public/data/ogimachi/survey.json').read_text())
ids=[236248652,236248688,236248633,236248631,236248712]
# Local frontage palette: do not recolor the shared village library.
cream=material('ACT1 aged cream plaster',(.76,.74,.68),.94)
frame=material('ACT1 dark stained timber',(.105,.064,.038),.82)
paper=material('ACT1 muted exterior glazing',(.16,.20,.20),.24)
ocher=material('ACT1 workshop ochre',(.43,.32,.22))
concrete=material('ACT1 weathered concrete',(.49,.49,.46))
rust=material('ACT1 oxidized standing seam',(.24,.13,.10))
shutter=material('ACT1 dull rolling shutter',(.28,.29,.28))
glass=material('ACT1 dark window',(.16,.20,.20),.24)
curtain=material('ACT1 muted linen curtain',(.66,.64,.57))
curtain_fold=material('ACT1 linen fold shadow',(.52,.51,.46))
noren=material('ACT1 faded violet doorway cloth',(.20,.14,.23))
exec(compile(Path(__file__).with_name('act1-materials.py').read_text(),str(Path(__file__).with_name('act1-materials.py')),'exec'))
allmats=[wood,frame,stone,tile,cream,ocher,concrete,rust,shutter,glass,curtain,curtain_fold,noren]
for ident in ids:
 b=next(b for b in survey['buildings'] if b['id']==ident)
 current=bpy.data.objects.new('act1-'+str(ident),None);scene.collection.objects.link(current);models.append(current)
 current['osm_id']=ident;current['archetype']='act1-'+str(ident)
 w,d=b['width']-.6,b['depth']-.6
 box('Mapped foundation',(w,d,.24),(0,0,.12),stone)
 if ident==236248652:
  # Two-storey white timber frontage, long side facing the road (+X).
  # 2010 south-oblique and 2012 frontal photos show a recessed lower south wing.
  # Keep both masses inside the existing surveyed envelope; dimensions estimated.
  split=-d*.1
  for name,depth,cy,setback,base,rise in [('south',d*.4,-d*.3,.85,5.25,1.85),('north',d*.6,d*.2,0,5.92,2.15)]:
   ww=w-setback;cx=-setback/2
   box(name+' plaster mass',(ww,depth,base-.27),(cx,cy,(base+.27)/2),cream)
   before=set(current.children)
   roof(ww+1.15,depth+.6,base,rise,tile,.16)
   for o in set(current.children)-before:o.location.x+=cx;o.location.y+=cy
   for side in [-1,1]:
    yy=cy+side*depth/2
    mesh(name+' closed gable',[(cx-ww/2,yy,base),(cx+ww/2,yy,base),(cx,yy,base+rise)],[(0,1,2) if side<0 else (2,1,0)],cream)
   box(name+' lower eave',(2.0,depth+.4,.15),(w/2-setback-.30,cy,2.92),tile,(0,-.15,0))
   for yy in np.linspace(cy-depth/2,cy+depth/2,4):
    box(name+' dark upright',(.17,.17,base-.12),(w/2-setback+.02,float(yy),(base+.12)/2),frame)
   for z in [.34,2.64,3.15,base-.32]:box(name+' timber rail',(.18,depth,.16),(w/2-setback+.04,cy,z),frame)
  for yy,ww in [(-d*.32,d*.19),(d*.055,d*.19),(d*.34,d*.195)]:
   setback=.85 if yy<split else 0
   face_x=w/2-setback;zz=4.12 if setback else 4.43;hh=1.45 if setback else 1.6
   window(face_x+.1,yy,zz,ww,hh,True)
   # Curtains sit behind the outer mullions; four sliding panes, not two dark slabs.
   box('Upper linen backing',(.018,ww-.10,hh-.10),(face_x+.172,yy,zz),curtain)
   for off in np.arange(-ww/2+.10,ww/2-.08,.11):
    box('Vertical curtain fold',(.022,.024,hh-.12),(face_x+.174,yy+float(off),zz),curtain_fold)
   for off in [-ww*.25,ww*.25]:box('Quarter window mullion',(.065,.045,hh),(face_x+.205,yy+off,zz),frame)
   box('Upper projecting sill',(.22,ww+.22,.12),(face_x+.17,yy,zz-hh/2-.10),wood)
  # Lower roof support brackets terminate on the wall, clear of the walkway.
  for yy in [-d*.46,-d*.24,-d*.085,d*.16,d*.44]:
   face_x=w/2-(.85 if yy<split else 0)
   beam('Eave diagonal bracket',(face_x+.09,yy,2.25),(face_x+.64,yy,2.82),.075,frame)
   box('Eave underside rafter',(.78,.065,.09),(face_x+.31,yy,2.82),wood)
  for yy in np.arange(-d/2+.14,d/2,.38):
   face_x=w/2-(.85 if yy<split else 0)
   box('Individual exposed eave rafter',(.87,.055,.075),(face_x+.23,float(yy),2.80),frame)
  for yy,ww in [(-d*.32,d*.19),(d*.055,d*.19),(d*.34,d*.195)]:
   face_x=w/2-(.85 if yy<split else 0);zz=4.12 if yy<split else 4.43;hh=1.45 if yy<split else 1.6
   for off in [-ww/2-.075,ww/2+.075]:box('Deep upper window jamb',(.23,.10,hh+.20),(face_x+.105,yy+off,zz),frame)
   box('Upper window lintel',(.25,ww+.25,.10),(face_x+.115,yy,zz+hh/2+.06),frame)
  for name,depth,cy,setback in [('south',d*.4,-d*.3,.85),('north',d*.6,d*.2,0)]:
   box(name+' eave fascia',(.10,depth+.4,.16),(w/2-setback+.69,cy,2.97),frame)
  # Distinguish floor-reaching sliding doors from raised window bays.
  for index,(yy,ww) in enumerate([(-d*.355,d*.21),(-d*.165,d*.11),(d*.105,d*.27),(d*.315,d*.12)]):
   face_x=w/2-(.85 if yy<split else 0)
   if index in [1,3]:
    box('Door outer frame',(.12,ww+.14,2.20),(face_x+.10,yy,1.36),frame)
    box('Door recessed glazing',(.03,ww,2.06),(face_x+.17,yy,1.36),glass)
    for off in [-ww/2,-ww/4,0,ww/4,ww/2]:box('Sliding door stile',(.075,.045,2.09),(face_x+.21,yy+off,1.36),wood)
    box('Door kickboard',(.08,ww,.30),(face_x+.21,yy,.47),wood)
    box('Sliding door pull',(.09,.045,.23),(face_x+.27,yy+.06,1.25),concrete)
    box('Door sill',(.25,ww+.15,.06),(face_x+.12,yy,.27),stone)
   else:
    window(face_x+.1,yy,1.55,ww,1.88,True)
    # Observed light lower blind and darker shop curtains break up dead flat glazing.
    backing=curtain if index==0 else noren
    for off in np.linspace(-ww*.47,ww*.47,24):
     box('Lower interior curtain pleat',(.025,ww*.038,1.73),(face_x+.172,yy+float(off),1.56),backing)
    for off in [-ww/4,ww/4]:box('Lower quarter mullion',(.07,.045,1.88),(face_x+.21,yy+off,1.55),wood)
  # September 2012 doorway cloth: plain color, no invented lettering.
  cloth_width=d*.40;cloth_centre=d*.175
  for i in range(5):
   yy=cloth_centre-cloth_width/2+(i+.5)*cloth_width/5
   pw=cloth_width/5-.035;verts=[];faces=[]
   for row in range(5):
    for col in range(9):
     u=col/8;v=row/4
     verts.append((w/2+.30+.025*math.sin(u*math.pi*4)+.035*v*v,yy+(u-.5)*pw,2.62-.38*v+.01*math.sin(u*math.pi*2)*v))
   for row in range(4):
    for col in range(8):
     k=row*9+col;faces.append((k,k+9,k+10,k+1))
   mesh('Folded doorway cloth panel',verts,faces,noren)
  box('Cloth hanging rail',(.06,cloth_width+.12,.06),(w/2+.30,cloth_centre,2.65),frame)
  for yy in [-d*.065,d*.43]:
   face_x=w/2-(.85 if yy<split else 0)
   box('White lattice panel',(.07,1.03,1.86),(face_x+.19,yy,1.36),cream)
   for offset in np.linspace(-.49,.49,9):box('Lattice vertical',(.09,.022,1.87),(face_x+.24,yy+float(offset),1.36),frame)
   for z in np.arange(.49,2.27,.16):box('Lattice crossbar',(.1,1.04,.023),(face_x+.25,yy,float(z)),frame)
  for yy in [-d*.32,d*.32]:
   face_x=w/2-(.85 if yy<split else 0)
   box('Timber bench',(.64,2.2,.10),(face_x+.57,yy,.48),wood)
   for dy in [-.8,.8]:box('Bench leg',(.48,.12,.40),(face_x+.57,yy+dy,.23),frame)
  for yy in np.arange(-d/2,d/2,.55):
   setback=.85 if yy<split else 0
   box('Eave snow stop',(.12,.09,.12),(w/2-setback-.35,float(yy),5.41 if setback else 6.08),concrete)
 else:
  # Warehouse/administrative frontage has no gassho roof or repeated merchant bays.
  h={236248688:4.3,236248633:3.05,236248631:6.4,236248712:8.1}[ident]
  mat=concrete if ident==236248712 else ocher
  box('Individual workshop envelope',(w,d,h),(0,0,h/2+.24),mat)
  if ident in [236248688,236248633]:
   roof_before=set(current.children)
   roof_w,roof_d=(d,w) if ident==236248633 else (w,d)
   rw,rd,base,rise=roof_w+.6,roof_d+.6,h+.25,1.65 if ident==236248688 else .65
   half=rw/2;length=math.hypot(half,rise);pitch=math.atan2(rise,half)
   for side in [-1,1]:
    box('Standing seam metal roof',(length,rd,.10),(side*half/2,0,base+rise/2),rust,(0,side*pitch,0))
    for yy in np.arange(-rd/2,rd/2,.48):box('Metal roof raised seam',(length,.035,.045),(side*half/2,float(yy),base+rise/2+.075),rust,(0,side*pitch,0))
   box('Metal ridge flashing',(.24,rd,.12),(0,0,base+rise+.07),rust)
   for side in [-1,1]:mesh('Closed workshop gable',[(-roof_w/2,side*roof_d/2,h+.24),(roof_w/2,side*roof_d/2,h+.24),(0,side*roof_d/2,base+rise)],[(0,1,2) if side<0 else (2,1,0)],mat)
   if ident==236248633:
    # Rotate only roof and gables: its surveyed local Z runs east/west.
    # The reference shows an eave facing the road, with ridge north/south.
    for o in set(current.children)-roof_before:
     x,y=o.location.x,o.location.y;o.location.x=-y;o.location.y=x;o.rotation_euler.z+=math.pi/2
  else:
   box('Flat roof parapet',(w+.22,d+.22,.25),(0,0,h+.3),mat)
   box('Flat roof dark inset',(w-.3,d-.3,.08),(0,0,h+.45),tile)
  # Local face nearest the street: resolve footprint rotation without moving it.
  angle=b['angle'];frontX=abs(math.cos(angle))>abs(math.sin(angle));sign=1 if (math.cos(angle) if frontX else -math.sin(angle))>0 else -1
  face=w/2 if frontX else d/2;span=d if frontX else w
  def facebox(name,u,z,ww,hh,mm,offset=.05):
   dim=(.10,ww,hh) if frontX else (ww,.10,hh)
   loc=(sign*(face+offset),u,z) if frontX else (u,sign*(face+offset),z)
   return box(name,dim,loc,mm)
  if ident in [236248688,236248633]:
   # August 2010 east-facing elevation: taller south workshop; low north annex.
   # Avoid inventing the same three loading doors on both buildings.
   doors=[(-span*.10,span*.42)] if ident==236248688 else [(-span*.33,span*.25),(span*.34,span*.24)]
   for u,doorw in doors:
    facebox('Ground shutter frame',u,1.48,doorw+.20,2.5,rust)
    facebox('Rolling steel door',u,1.49,doorw,2.4,shutter,.12)
    for z in np.arange(.38,2.65,.10):
     facebox('Raised shutter slat lip',u,float(z),doorw,.035,shutter,.18)
    for off in [-doorw/2-.055,doorw/2+.055]:
     facebox('Shutter guide channel',u+off,1.49,.09,2.42,rust,.23)
    facebox('Shutter bottom bar',u,.30,doorw,.09,rust,.22)
    facebox('Shutter pull recess',u,.67,.25,.10,frame,.24)
    facebox('Shutter threshold',u,.245,doorw+.20,.07,concrete,.25)
   windows=[(span*.33,3.35,span*.21,.8)] if ident==236248688 else [(-span*.09,2.05,span*.15,.8),(span*.10,2.05,span*.15,.8)]
   for u,z,ww,hh in windows:
    facebox('Workshop window reveal',u,z,ww+.10,hh+.10,frame)
    facebox('Workshop glazing',u,z,ww,hh,glass,.12)
    facebox('Workshop mullion',u,z,.04,hh,concrete,.19)
    facebox('Workshop projecting window sill',u,z-hh/2-.08,ww+.22,.09,rust,.23)
   facebox('Continuous shallow entrance canopy',0,2.92,span*.96,.13,rust,.25)
  elif ident==236248631:
   # South ochre block: four high windows, mostly closed wall below (2010 east view).
   for u in np.linspace(-span*.36,span*.36,4):
    facebox('Ochre upper reveal',float(u),h-1.1,span*.15,1.05,frame)
    facebox('Ochre upper glazing',float(u),h-1.1,span*.145,.96,glass,.12)
    for off in [-span*.045,0,span*.045]:facebox('Ochre window divisions',float(u)+off,h-1.1,.035,1.0,concrete,.19)
   facebox('Single lower utility window',span*.24,2.6,span*.17,1.25,frame)
   facebox('Lower utility glazing',span*.24,2.6,span*.16,1.15,glass,.12)
   facebox('Small service door',-span*.39,1.38,1.0,2.1,shutter,.10)
   facebox('Ochre horizontal eave',0,3.55,span,.12,rust,.22)
  elif ident==236248712:
   # Concrete frontage: blank south pier, middle window band and narrow north shaft.
   facebox('Blank concrete south pier',span*.35,h/2,span*.27,h-.1,concrete,.14)
   for u in [span*.16,span*.02,-span*.12,-span*.26]:
    facebox('Concrete upper window reveal',u,5.18,span*.125,1.55,frame,.15)
    facebox('Concrete upper glazing',u,5.18,span*.113,1.43,glass,.23)
    facebox('Concrete window transom',u,5.18,span*.12,.06,concrete,.29)
    facebox('Concrete window mullion',u,5.18,.04,1.45,concrete,.29)
   facebox('North vertical shaft',-span*.42,h/2,span*.10,h-.08,cream,.32)
   for z in [3.4,5.0,6.5]:facebox('Narrow shaft slit',-span*.42,z,.18,.72,glass,.40)
   facebox('Boarded lower opening',span*.20,1.55,span*.34,2.4,ocher,.14)
   for u in np.arange(span*.03,span*.37,.23):facebox('Boarded opening seam',float(u),1.55,.025,2.35,wood,.21)
   facebox('Main entrance frame',-span*.24,1.47,span*.27,2.55,frame,.14)
   facebox('Main entrance glass',-span*.24,1.47,span*.25,2.4,glass,.22)
   for u in [-span*.36,-span*.30,-span*.24,-span*.18,-span*.12]:facebox('Entrance mullion',u,1.47,.045,2.4,concrete,.29)
   facebox('Entrance transom',-span*.24,2.08,span*.25,.05,concrete,.29)
   facebox('Entrance canopy',-span*.24,2.85,span*.32,.17,cream,.45)
   for z in [3.12,6.18,h-.10]:facebox('Concrete horizontal slab',0,z,span,.14,cream,.18)
   # Shallow panel joints, not invented dirt baked from reference photographs.
   for u in np.linspace(-span*.48,span*.48,7):facebox('Concrete vertical joint',float(u),h/2,.018,h-.3,shutter,.205)
 # Merge each building by material; preserve per-building root and measured placement.
 for mat in allmats+[paper]:
  obs=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat]
  if not obs:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0]
  if len(obs)>1:bpy.ops.object.join()
  obs[0].name=str(ident)+'-'+mat.name
bpy.ops.object.select_all(action='DESELECT')
for root in models:
 root.select_set(True)
 for o in root.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/act1-frontage.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'ACT1-frontage.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print('ACT1 frontage exported',ids)
