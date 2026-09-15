"""Nine ACT1 side buildings. Evidence limits: docs/ogimachi-act1-frontage.md.
After export run node scripts/optimize-act1-sides.mjs for the runtime asset.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_ACT1_side_buildings'
survey=json.loads((ROOT/'public/data/ogimachi/survey.json').read_text())
# id, envelope height, roof rise, roof type, bays, ridge axis.
configs=[(236248636,3.25,6.2,'thatch',3,'x'),(236248639,5.3,1.1,'tile',3,'z'),(236248655,5.1,2.2,'tile',4,'x'),(236248682,2.35,3.5,'thatch',3,'z'),(586010787,2.85,1.35,'metal',4,'x'),(984794590,2.5,1.7,'tile',2,'z'),(986683700,2.65,2.0,'tile',3,'z'),(986683701,2.25,1.0,'metal',2,'z'),(1465226332,2.1,1.15,'tile',2,'z')]
cream=material('Side buildings aged lime',(.68,.65,.53));metal=material('Side buildings brown metal roof',(.21,.17,.13));glass=material('Side buildings recessed glass',(.12,.17,.17),.35)
weathered=material('Kobikiya muted window panels',(.18,.21,.20),.8)
curtain=material('West house muted curtains',(.43,.44,.40),.9)
blockwall=material('North roadside concrete blocks',(.36,.38,.37),.96)
blockjoint=material('North roadside mortar joints',(.22,.24,.23),1)
greenband=material('North roadside muted green band',(.035,.19,.14),.95)
for ident,h,rise,cover,bays,axis in configs:
 b=next(b for b in survey['buildings'] if b['id']==ident)
 current=bpy.data.objects.new('act1-side-'+str(ident),None);scene.collection.objects.link(current);models.append(current);current['osm_id']=ident;current['archetype']='act1-side-'+str(ident)
 # Building is made in roof coordinates and rotated back inside its source footprint.
 w,d=(b['depth'],b['width']) if axis=='x' else (b['width'],b['depth']);w-=.65;d-=.65
 wallmat=cream if ident in [236248639,236248655,986683700] else wood
 box('Stone footing',(w,d,.28),(0,0,.14),stone)
 box('Individually proportioned shell',(w,d,h-.25),(0,0,(h+.25)/2),wallmat)
 roof(w+.55,d+.55,h+.15,rise,thatch if cover=='thatch' else tile if cover=='tile' else metal,.48 if cover=='thatch' else .13)
 for sign in [-1,1]:
  yy=sign*d/2
  mesh('Closed timber gable',[(-w/2,yy,h),(w/2,yy,h),(0,yy,h+.15+rise)],[(0,1,2) if sign<0 else (2,1,0)],wood if cover=='thatch' else wallmat)
  beam('Gable rake',(-w/2,yy,h),(0,yy,h+rise),.12,frame);beam('Gable rake',(w/2,yy,h),(0,yy,h+rise),.12,frame)
  reviewed_front=ident==236248636 and sign==1
  reviewed_south=ident==236248636 and sign==-1
  for xx in ([] if (ident==236248682 and sign==1) or reviewed_south else np.linspace(-w*.39,w*.39,bays)):
   if reviewed_front:
    box('North lower sliding panel',(w/(bays+1)*.85,.05,1.55),(float(xx),yy+.12,1.14),weathered)
    for dx in [-.6,-.3,0,.3,.6]:box('North lower sliding stile',(.035,.08,1.6),(float(xx)+dx,yy+.16,1.14),frame)
   else:window(float(xx),yy+sign*.06,1.55,w/(bays+1)*.77,1.50)
  if reviewed_front:
   for zz in [2.12,2.42,2.72,3.02]:box('North horizontal weatherboards',(w-.2,.06,.22),(0,yy+.11,zz),wood)
  if reviewed_south:
   for xx in [-w*.32,0,w*.32]:
    span=w*.27
    box('South shop opening frame',(span+.14,.13,2.25),(xx,yy-.12,1.40),frame)
    box('South shop recessed glazing',(span,.04,2.10),(xx,yy-.21,1.40),glass)
    for dx in np.linspace(-span/2,span/2,5):box('South shop sliding stile',(.045,.09,2.14),(xx+float(dx),yy-.25,1.40),frame)
    for zz in [.36,1.03,2.45]:box('South shop sliding rail',(span,.09,.055),(xx,yy-.25,zz),frame)
   box('South entrance threshold',(w*.27,.55,.10),(0,yy-.32,.20),stone)
   for xx in [-w*.34,w*.34]:
    for depth in [-.40,-.57,-.74]:box('South shop bench slat',(w*.23,.13,.06),(xx,yy+depth,.43),wood)
    for dx in [-w*.08,w*.08]:box('South shop bench foot',(.09,.42,.32),(xx+dx,yy-.57,.24),frame)
  for xx in np.linspace(-w/2,w/2,bays+1):box('Gable post',(.13,.16,h),(float(xx),yy,h/2),frame)
  for zz in [.4,h-.12]:box('Gable sill',(w,.16,.13),(0,yy,zz),frame)
  if cover=='thatch':
   if ident==236248682 and sign==1:
    for xx in np.linspace(-w*.40,w*.40,15):
     top=h+rise*(1-abs(float(xx))/(w/2))
     box('Storehouse north attic board seam',(.028,.075,max(.08,top-h-.1)),(float(xx),yy+.075,(h+top-.1)/2),frame)
    for xx in np.linspace(-w*.42,w*.42,5):box('Storehouse north panel stile',(.085,.13,1.95),(float(xx),yy+.11,1.27),frame)
    for zz in [.35,1.20,2.22]:box('Storehouse north panel rail',(w-.1,.13,.09),(0,yy+.12,zz),frame)
   elif reviewed_front or reviewed_south:
    for xx in [-w*.17,w*.17]:window(xx,yy+sign*.08,h+rise*.32,w*.23,rise*.26)
   else:window(0,yy+sign*.08,h+rise*.32,w*.35,rise*.26)
   box('Attic sill',(w*.47,.20,.14),(0,yy+sign*.05,h+rise*.16),frame)
   if ident==236248636:window(0,yy+sign*.07,h+rise*.68,w*.13,rise*.16)
 for side in [-1,1]:
  xx=side*w/2
  if ident==236248639 and side==1:
   # West-facing two-storey elevation visible from the south street panorama.
   for yy in [-d/2,-d*.12,d*.15,d/2]:box('Rear house facade post',(.18,.13,h),(xx+.06,yy,h/2),frame)
   for zz in [.25,2.65,3.08,4.63,5.12]:box('Rear house facade beam',(.18,d,.12),(xx+.07,0,zz),frame)
   for yy,span in [(-d*.32,d*.23),(-d*.055,d*.20),(d*.285,d*.22)]:
    box('Rear house upper window surround',(.12,span+.15,1.35),(xx+.13,yy,3.94),frame)
    box('Rear house upper muted glazing',(.04,span,1.20),(xx+.21,yy,3.94),glass)
    for off in [-span/2,0,span/2]:box('Rear house upper sliding stile',(.07,.045,1.24),(xx+.25,yy+off,3.94),frame)
   for yy in [-d*.36,-d*.21,-d*.06]:
    box('Rear house transom recess',(.07,d*.10,.30),(xx+.18,yy,4.86),frame)
    box('Rear house transom glazing',(.03,d*.085,.23),(xx+.23,yy,4.86),glass)
   yy=d*.13;span=d*.60
   box('Rear house shutter surround',(.14,span+.18,2.31),(xx+.13,yy,1.42),frame)
   box('Rear house closed shutter',(.06,span,2.15),(xx+.23,yy,1.42),metal)
   for zz in np.arange(.4,2.48,.10):box('Rear house shutter slat',(.025,span,.023),(xx+.272,yy,float(zz)),frame)
   yy=-d*.36;span=d*.16
   box('Rear house side entrance',(.13,span,2.25),(xx+.14,yy,1.40),frame)
   box('Rear house side entrance glazing',(.04,span-.16,1.9),(xx+.23,yy,1.52),glass)
   box('Rear house entrance stile',(.08,.05,2.08),(xx+.27,yy,1.42),frame)
   box('Rear house storey eave',(.65,d+.3,.12),(xx+.23,0,2.73),tile,(0,-.08,0))
   continue
  if ident==236248682 and side==-1:
   for yy in np.arange(-d/2,d/2,.28):box('Storehouse west board seam',(.07,.025,1.97),(xx-.075,float(yy),1.3),frame)
   for yy in np.linspace(-d/2,d/2,7):box('Storehouse west panel post',(.14,.085,2.1),(xx-.11,float(yy),1.32),frame)
   for zz in [.32,1.2,2.25]:box('Storehouse west horizontal rail',(.15,d,.095),(xx-.12,0,zz),frame)
   continue
  if ident==236248655 and side==1:
   # East facade across the street: broad south window, narrow north window,
   # lower glazed bay and a separate entrance; not four repeated window bays.
   for yy in [-d/2,-d*.04,d*.38,d/2]:box('East facade post',(.18,.15,h),(xx+.05,yy,h/2),frame)
   for zz in [.35,2.72,h-.1]:box('East facade belt',(.18,d,.14),(xx+.06,0,zz),frame)
   for yy,span in [(-d*.24,d*.34),(d*.22,d*.065)]:
    box('East upper window surround',(.12,span+.15,1.58),(xx+.13,yy,3.91),frame)
    box('East upper curtain',(.03,span,1.42),(xx+.21,yy,3.91),curtain)
    for off in [-span/2,0,span/2]:box('East upper window stile',(.09,.045,1.47),(xx+.24,yy+off,3.91),frame)
    if span>1:
     for off in np.linspace(-span*.45,span*.45,14):box('East upper curtain fold',(.012,.022,1.38),(xx+.233,yy+float(off),3.91),weathered)
     box('East upper window hood',(.5,span+.35,.11),(xx+.25,yy,4.77),tile)
   yy=-d*.25;span=d*.37
   box('East ground glazed bay frame',(.13,span+.18,1.86),(xx+.13,yy,1.4),frame)
   box('East ground glazed bay',(.04,span,1.7),(xx+.22,yy,1.4),curtain)
   for off in np.linspace(-span/2,span/2,5):box('East ground sliding frame',(.1,.055,1.77),(xx+.26,yy+float(off),1.4),frame)
   yy=d*.22;span=d*.27
   box('East entrance shadow',(.13,span+.22,2.35),(xx+.13,yy,1.43),frame)
   box('East entrance glazing',(.04,span,2.16),(xx+.22,yy,1.43),glass)
   for off in np.linspace(-span/2,span/2,7):box('East entrance stile',(.09,.05,2.2),(xx+.26,yy+float(off),1.43),frame)
   for zz in [.4,1.38,2.52]:box('East entrance rail',(.09,span,.07),(xx+.26,yy,zz),frame)
   box('East entrance stone step',(.65,span+.15,.14),(xx+.4,yy,.14),stone)
   continue
  for yy in np.linspace(-d/2,d/2,bays+1):box('Side structural upright',(.15,.15,h),(xx,float(yy),h/2),frame)
  for zz in [.35,2.55,h-.1]:
   if zz<h:box('Side timber belt',(.17,d,.13),(xx,0,zz),frame)
  for yy in np.linspace(-d*.33,d*.33,bays):
   box('Dark side window',(.08,d/(bays+1)*.72,1.35),(xx+side*.05,float(yy),1.55),glass)
   for off in [-.32,0,.32]:box('Side lattice mullion',(.12,.04,1.4),(xx+side*.1,float(yy)+off,1.55),frame)
   if h>4:box('Upper side window',(.08,d/(bays+1)*.76,1.20),(xx+side*.06,float(yy),3.8),glass)
 # Individual entrance/roof features, not copies of the generic merchant model.
 if ident==236248636:
  # Authored -X becomes the west/street side after the internal ridge rotation.
  box('West continuous shop awning',(1.45,d+.4,.15),(-w/2-.35,0,2.72),metal,(0,.12,0))
  for y in [-d*.46,0,d*.46]:
   box('West awning post',(.1,.1,2.6),(-w/2-.85,y,1.3),frame)
   beam('West awning brace',(-w/2-.83,y,2.1),(-w/2-.15,y,2.65),.07,frame)
  box('South return shop awning',(w+.95,1.10,.15),(-.35,-d/2-.30,2.72),metal,(.12,0,0))
  for xx in [-w/2-.75,-w*.16,w*.42]:
   box('South awning support',(.10,.10,2.6),(xx,-d/2-.72,1.3),frame)
   beam('South awning bracket',(xx,-d/2-.70,2.10),(xx,-d/2-.12,2.66),.07,frame)
  # Ladder observed on the left rake of the north-facing gable; dimensions estimated.
  start=Vector((w*.44,d/2+.26,h+.1));end=Vector((w*.065,d/2+.26,h+rise*.86))
  cross=Vector((.20,0,.20*(start.x-end.x)/(end.z-start.z)))
  for side in [-1,1]:beam('North gable ladder rail',start+cross*side,end+cross*side,.065,wood)
  for t in np.linspace(.04,.96,14):
   p=start.lerp(end,float(t));beam('North gable ladder rung',p-cross,p+cross,.05,frame)
 elif ident==236248682:
  # Short timber frame resting below the boarded west elevation in the photo.
  for yy in [-d*.25,-d*.03]:box('Storehouse low frame upright',(.1,.075,.48),(-w/2-.32,yy,.32),wood)
  for zz in [.17,.5]:box('Storehouse low frame crosspiece',(.1,d*.27,.07),(-w/2-.32,-d*.14,zz),wood)
  for side in [-1,1]:
   for yy in [-d*.32,d*.32]:box('Raised sill block',(.38,.4,.32),(side*w*.38,yy,.16),stone)
 elif ident==236248655:
  box('East street lower canopy',(1.3,d+.5,.16),(w/2+.25,0,2.78),tile,(0,-.12,0))
  for yy in [-d*.46,d*.03,d*.43]:
   box('East canopy support',(.12,.12,2.65),(w/2+.65,yy,1.33),frame)
   beam('East canopy bracket',(w/2+.65,yy,2.15),(w/2+.1,yy,2.7),.075,frame)
 elif ident==586010787:
  box('Street porch canopy',(w+.4,1.5,.13),(0,-d/2-.35,2.6),metal,(.10,0,0))
  for xx in [-w*.4,w*.4]:box('Porch column',(.11,.11,2.5),(xx,-d/2-.9,1.25),frame)
  # Observed roadside boundary, independent of the obscured building facade.
  # Local +X faces east after the internal roof-axis rotation.
  wallx=w/2+.46;span=d*.78;center=-d*.02
  box('Roadside block boundary',(.20,span,1.52),(wallx,center,.90),blockwall)
  for zz in [.34,.56,.78,1.,1.22,1.44]:
   box('Block horizontal mortar',(.018,span,.014),(wallx+.108,center,zz),blockjoint)
  for row in range(6):
   for yy in np.arange(center-span/2+.22+(row%2)*.22,center+span/2,.44):
    box('Staggered block vertical joint',(.018,.012,.20),(wallx+.11,float(yy),.45+row*.22),blockjoint)
  box('Boundary green painted band',(.025,span,.15),(wallx+.113,center,1.53),greenband)
  box('Boundary coping',(.27,span+.06,.065),(wallx,center,1.69),blockwall)
 elif ident in [986683701,1465226332,984794590]:
  box('Wide plank service door',(w*.43,.10,1.86),(0,-d/2-.10,1.23),frame)
  for xx in np.linspace(-w*.2,w*.2,8):box('Service door plank',(.035,.12,1.8),(float(xx),-d/2-.13,1.23),wood)
 # Align internal roof axis with the mapped envelope; keep origin unshifted.
 if axis=='x':
  for o in list(current.children):
   x,y=o.location.x,o.location.y;o.location.x=-y;o.location.y=x;o.rotation_euler.z+=math.pi/2
 # Merge to a few draw calls while preserving this building's own mesh and metadata.
 mats=set(o.data.materials[0] for o in current.children if o.type=='MESH')
 for mat in mats:
  obs=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat];bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0]
  if len(obs)>1:bpy.ops.object.join()
  obs[0].name=str(ident)+'-'+mat.name
bpy.ops.object.select_all(action='DESELECT')
for root in models:
 root.select_set(True)
 for o in root.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/act1-sides.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'ACT1-side-buildings.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print('SIDE BUILDINGS EXPORTED',len(configs))
