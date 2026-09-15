"""ACT1 north continuation. Reference limits: docs/ogimachi-act1-north.md.
Run scripts/optimize-act1-sides.mjs public/models/ogimachi/act1-north.glb after export.
"""
from pathlib import Path
SOURCE=Path(__file__).with_name('build-ogimachi-library.py')
exec(compile(SOURCE.read_text().split("build('farmhouse',10.4")[0],str(SOURCE),'exec'))
asset_stem=globals().get('asset_stem','act1-north')
blend_name=globals().get('blend_name','ACT1-north-buildings.blend')
scene.name='Ogimachi_'+asset_stem
survey=json.loads((ROOT/'public/data/ogimachi/survey.json').read_text())
rust=material('North standing seam oxidized metal',(.27,.13,.09),.85)
cream=material('North warm lime gables',(.72,.70,.61))
iron=material('North dark gutter metal',(.08,.09,.08),.72)
# Individual envelopes and features; heights/hidden elevations are estimates.
# id, wall height, rise, roof, ridge axis, frontage variant
configs=[(236248649,2.75,1.45,'metal','x','workshop'),
 (236248692,5.15,1.65,'metal','z','balcony'),
 (586010788,5.0,1.9,'tile','z','timber'),
 (236248687,4.8,1.6,'metal','z','boards'),
 (236248660,4.9,1.9,'tile','z','lime'),
 (236248677,3.0,2.4,'tile','z','plaster'),
 (992212029,2.5,1.4,'tile','z','shed'),
 (1465227686,2.1,.9,'metal','z','shed')]
configs=globals().get('building_configs',configs)

def metal_roof(w,d,h,rise):
 half=w/2;length=math.hypot(half,rise);a=math.atan2(rise,half)
 for side in [-1,1]:
  box('Continuous metal sheet',(length,d,.11),(side*half/2,0,h+rise/2),rust,(0,side*a,0))
  for yy in np.arange(-d/2,d/2,.55):
   box('Standing seam',(length,.025,.04),(side*half/2,float(yy),h+rise/2+.065),iron,(0,side*a,0))
  for t in [.35,.75]:
   box('Snow retaining rail',(.055,d,.055),(side*half*t,0,h+rise*(1-t)+.13),iron)
 box('Folded ridge cap',(.24,d+.08,.16),(0,0,h+rise+.05),rust)

for ident,h,rise,cover,axis,variant in configs:
 b=next(b for b in survey['buildings'] if b['id']==ident)
 current=bpy.data.objects.new(asset_stem+'-'+str(ident),None);scene.collection.objects.link(current);models.append(current)
 current['osm_id']=ident;current['archetype']=asset_stem+'-'+str(ident);current['evidence']='partial-reference-estimated-elevations'
 w,d=(b['depth'],b['width']) if axis=='x' else (b['width'],b['depth']);w-=.65;d-=.65
 wall=cream if variant in ['plaster','lime','porch'] else wood
 box('Stone foundation',(w,d,.35),(0,0,.175),stone)
 box('Building envelope',(w,d,h-.35),(0,0,(h+.35)/2),wall)
 if cover=='metal':metal_roof(w+.7,d+.7,h+.12,rise)
 else:roof(w+.7,d+.7,h+.12,rise,tile,.14)
 for s in [-1,1]:
  y=s*d/2
  mesh('Closed gable',[(-w/2,y,h),(w/2,y,h),(0,y,h+.12+rise)],[(0,1,2) if s<0 else (2,1,0)],cream)
  beam('Gable rake',(-w/2,y,h),(0,y,h+.12+rise),.13)
  beam('Gable rake',(w/2,y,h),(0,y,h+.12+rise),.13)
  beam('Gable centre post',(0,y,h),(0,y,h+rise),.12)
  # Horizontal board edges are real geometry; upper wall belt differs by storey.
  if wall==wood:
   for z in np.arange(.4,h,.26):box('Clapboard seam',(w,.025,.025),(0,y+s*.02,float(z)),frame)
  for x in np.linspace(-w/2,w/2,4):box('Timber upright',(.12,.14,h),(float(x),y,h/2),frame)
  levels=[1.55,min(3.95,h-.8)] if h>4 else [1.5]
  for z in levels:
   for x in [-w*.29,w*.29]:window(x,y+s*.08,z,w*.25,1.25)
  if variant in ['shed','workshop','garage']:
   box('Recessed service shutter',(w*.42,.10,1.95),(0,y+s*.14,1.32),iron)
   for z in np.arange(.42,2.25,.11):box('Shutter rib',(w*.4,.06,.025),(0,y+s*.21,float(z)),wood)
  else:
   box('Timber entry',(w*.18,.10,2.05),(0,y+s*.12,1.38),frame)
   for x in np.linspace(-w*.075,w*.075,6):box('Entry lattice',(.04,.06,1.92),(float(x),y+s*.2,1.38),wood)
  if variant=='balcony':
   box('Upper window balcony',(w*.85,.60,.12),(0,y+s*.36,3.15),wood)
   for x in np.linspace(-w*.40,w*.40,15):box('Balcony rail baluster',(.05,.06,.74),(float(x),y+s*.61,3.6),frame)
   box('Balcony handrail',(w*.85,.09,.09),(0,y+s*.61,4.0),frame)
  if variant not in ['shed','plaster']:
   box('Lower street eave',(w+.25,.9,.12),(0,y+s*.32,2.8),rust if cover=='metal' else tile,(s*-.13,0,0))
 for s in [-1,1]:
  x=s*w/2
  box('Eave gutter',(.12,d+.6,.12),(x+s*.36,0,h-.04),iron)
  box('Downpipe',(.085,.085,h-.25),(x+s*.12,d*.40,(h+.25)/2),iron)
  for y in np.linspace(-d*.38,d*.38,4):
   box('Side post',(.14,.14,h),(x,float(y),h/2),frame)
   for z in ([1.55,min(3.95,h-.8)] if h>4 else [1.55]):
    box('Side glass',(.045,d*.12,1.2),(x+s*.05,float(y),z),paper)
    for off in [-d*.06,0,d*.06]:box('Side window frame',(.09,.045,1.3),(x+s*.09,float(y)+off,z),frame)
  for z in [.4,2.7]:box('Side wall belt',(.14,d,.12),(x,0,min(z,h-.1)),frame)
 if variant=='boards':
  for y in np.arange(-d/2,d/2,.3):box('Vertical board seam',(.035,.025,h-.4),(-w/2-.04,float(y),(h+.4)/2),frame)
 if variant=='porch':
  pw=w*.6;yy=-d/2-.25
  mesh('Entrance pediment',[(-pw/2,yy,2.7),(pw/2,yy,2.7),(0,yy,3.65)],[(2,1,0)],cream)
  for side in [-1,1]:
   beam('Entrance rake',(side*pw/2,yy,2.7),(0,yy,3.65),.16)
   box('Entrance column',(.15,.15,2.7),(side*pw/2,yy,1.35),frame)
 if axis=='x':
  for o in list(current.children):
   x,y=o.location.x,o.location.y;o.location.x=-y;o.location.y=x;o.rotation_euler.z+=math.pi/2
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
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/models/ogimachi'/f'{asset_stem}.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True,export_extras=True)
bpy.data.libraries.write(str(OUT/blend_name),{scene},path_remap='RELATIVE_ALL',fake_user=True)
print('NORTH BUILDINGS EXPORTED',len(configs))
