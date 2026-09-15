"""Four junction buildings. Reference and uncertainty: docs/ogimachi-junction.md."""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
scene.name='Ogimachi_north_junction'
survey=json.loads((ROOT/'public/data/ogimachi/survey.json').read_text())
cream=material('Junction pale metal siding',(.64,.64,.55))
lime=material('Junction warm plaster',(.78,.76,.65))
metal=material('Junction charcoal sheet roof',(.13,.14,.13),.8)
configs=[(660927473,4.5,1.3,'warehouse'),(660927475,5.0,1.8,'house'),(660927476,4.7,1.7,'house'),(671938230,2.9,1.25,'hall')]
for ident,h,rise,kind in configs:
 b=next(b for b in survey['buildings'] if b['id']==ident)
 current=bpy.data.objects.new('junction-'+str(ident),None);scene.collection.objects.link(current);models.append(current)
 current['osm_id']=ident;current['archetype']='junction-'+kind;current['evidence']='photo-form-estimated-dimensions'
 w,d=b['width']-.7,b['depth']-.7
 box('Foundation',(w,d,.28),(0,0,.14),stone)
 box('Lower wall',(w,d,h-.28),(0,0,(h+.28)/2),cream if kind=='warehouse' else wood)
 if kind=='house':box('Upper plaster',(w+.02,d+.02,h-2.65),(0,0,(h+2.65)/2),lime)
 if kind=='house':roof(w+.9,d+.85,h+.1,rise,tile,.14)
 else:
  # Broad sheet roof without the tile-course geometry used by the house roofs.
  half=(w+1.1)/2;length=math.hypot(half,rise);angle=math.atan2(rise,half)
  for side in [-1,1]:
   box('Sheet roof',(length,d+1.1,.14),(side*half/2,0,h+rise/2),metal,(0,side*angle,0))
   for yy in np.arange(-(d+1.1)/2,(d+1.1)/2,.6):box('Roof seam',(length,.025,.035),(side*half/2,float(yy),h+rise/2+.09),metal,(0,side*angle,0))
  box('Ridge flashing',(.28,d+1.15,.15),(0,0,h+rise+.05),metal)
 for side in [-1,1]:
  yy=side*d/2
  mesh('Closed gable',[(-w/2,yy,h),(w/2,yy,h),(0,yy,h+rise)],[(0,1,2) if side<0 else (2,1,0)],cream if kind=='warehouse' else lime)
  beam('Gable rake',(-w/2,yy,h),(0,yy,h+rise),.13)
  beam('Gable rake',(w/2,yy,h),(0,yy,h+rise),.13)
  if kind=='warehouse':
   # Blank corrugated end wall on one end, framed service opening on the other.
   for xx in np.arange(-w/2,w/2,.18):box('End siding rib',(.024,.04,h-.3),(float(xx),yy+side*.04,(h+.3)/2),lime)
   if side<0:
    box('Warehouse dark entry',(w*.64,.10,3.35),(0,yy-.08,1.95),frame)
    for xx in [-w*.33,w*.33]:box('Entry jamb',(.16,.18,3.6),(xx,yy-.15,1.9),wood)
    box('Entry lintel',(w*.68,.18,.22),(0,yy-.15,3.65),wood)
  elif kind=='house':
   for z in [1.45,3.85]:
    for xx in [-w*.29,w*.29]:window(xx,yy+side*.08,z,w*.29,1.3)
   for xx in np.linspace(-w/2,w/2,5):box('Facade post',(.14,.16,h),(float(xx),yy,h/2),frame)
   for z in [.4,2.6,h]:box('Facade crossbeam',(w,.18,.15),(0,yy,z),frame)
   box('Door',(1.2,.12,2.05),(0,yy+side*.10,1.3),wood)
   box('Lower eave',(w+.55,1,.14),(0,yy+side*.32,2.75),metal,(side*-.16,0,0))
  else:
   for xx in np.linspace(-w*.39,w*.39,5):window(float(xx),yy+side*.08,1.55,w*.13,1.7)
 for side in [-1,1]:
  xx=side*w/2
  box('Gutter',(.13,d+.8,.12),(xx+side*.48,0,h-.05),metal)
  if kind=='warehouse':
   for yy in np.arange(-d/2,d/2,.18):box('Side siding rib',(.04,.025,h-.3),(xx+side*.04,float(yy),(h+.3)/2),lime)
  else:
   count=7 if kind=='hall' else 4
   for yy in np.linspace(-d*.40,d*.40,count):
    for z in ([1.45,3.85] if kind=='house' else [1.45]):
     box('Recessed side glazing',(.08,d/count*.68,1.45),(xx+side*.06,float(yy),z),paper)
     for off in [-d/count*.34,0,d/count*.34]:box('Window division',(.13,.055,1.55),(xx+side*.12,float(yy)+off,z),frame)
    box('Wall post',(.16,.14,h),(xx,float(yy),h/2),frame)
   if kind=='hall':
    box('Continuous porch eave',(1.2,d+.7,.15),(xx+side*.25,0,2.7),metal,(0,side*.12,0))
    for yy in np.linspace(-d*.42,d*.42,6):box('Porch support',(.14,.14,2.55),(xx+side*.65,float(yy),1.275),frame)
  box('Downpipe',(.08,.08,h-.25),(xx+side*.14,d*.43,(h+.25)/2),metal)
 for mat in set(o.data.materials[0] for o in current.children if o.type=='MESH'):
  obs=[o for o in current.children if o.type=='MESH' and o.data.materials[0]==mat];bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0]
  if len(obs)>1:bpy.ops.object.join()
  obs[0].name=str(ident)+'-'+mat.name
bpy.ops.object.select_all(action='DESELECT')
for root in models:
 root.select_set(True)
 for o in root.children:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi/junction.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/'north-junction.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print('JUNCTION BUILDINGS EXPORTED',len(configs))
