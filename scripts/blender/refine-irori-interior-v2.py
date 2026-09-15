import bpy,math,random
from mathutils import Vector
R='/Users/jay/Claude/3D_motion';s=bpy.context.scene;r=next(o for o in s.objects if o.get('osm_id')==236248710)
assert not bpy.app.is_job_running('RENDER')
bpy.data.libraries.write(R+'/assets/authored/ogimachi/pre-irori-interior-v2.blend',{s},fake_user=True,compress=True)
for o in r.children:
 if o.name.startswith('V2 entrance deep jamb'):o.hide_render=True;o.hide_set(True)
for o in list(r.children):
 if o.name.startswith('IR2 '):bpy.data.objects.remove(o,do_unlink=True)
# Reuse the prior authored constructors without rebuilding its scene.
base=open(R+'/scripts/blender/build-irori-interior-v1.py').read()
exec(base[base.index('def plain('):base.index('# Floor and shell.')])
oldbox=box
def box(name,pos,size,mat):
 o=oldbox(name,pos,size,mat);o.name='IR2 '+name;return o
def collider(name,pos,size):
 o=proxy(name,pos,size);o.name='IR2 collider '+name;return o
ceramic=plain('IR2 glazed celadon',(.22,.32,.27),.25)
black=plain('IR2 cast iron',(.025,.022,.018),.69)
border=plain('IR2 tatami cloth border',(.09,.12,.085),.88)
# Replace false open-door panels with real shallow jambs. Central aisle stays open.
for y in [-1.04,1.04]:box('entrance jamb',(-4.42,y,1.4),(.20,.10,2.2),dark)
box('entrance lintel',(-4.42,0,2.49),(.22,2.20,.12),dark)
for x in [-4.56,-4.52]:box('sliding track',(x,0,.305),(.014,4.13,.014),dark)
# Continuous interior facade lining, divided around the surveyed window bays.
for y in [-3.3,3.3]:
 box('front low lining',(-4.32,y,.61),(.10,4.35,.61),wood)
 box('front high lining',(-4.32,y,2.77),(.10,4.35,.58),plaster)
for y in [-5.48,-3.7,-1.72,1.65,3.60,5.42]:box('front mullion',(-4.3,y,1.65),(.13,.13,2.68),dark)
# Wood skirting, wainscot battens, and rails avoid featureless box walls.
for y in [-5.46,5.46]:
 box('wall timber base',(-.15,y,.71),(8.15,.075,.78),wood)
 for z in [.34,1.13,2.77]:box('wall rail',(-.15,y-.04*(1 if y>0 else -1),z),(8.1,.055,.065),dark)
 for x in [i*.32-3.85 for i in range(25)]:box('wainscot batten',(x,y-.044*(1 if y>0 else -1),.72),(.026,.028,.7),dark)
box('back wainscot',(3.83,0,.72),(.065,11.0,.80),wood)
# Interior shoji screens: paper inset, deep frames and fine kumiko grid.
for x in [-2.22,.27,2.68]:
 y=5.36
 box('shoji paper',(x,y,1.97),(2.05,.024,1.43),paper)
 for dx in [-1.04,1.04]:box('shoji stile',(x+dx,y-.037,1.97),(.055,.07,1.54),dark)
 for z in [1.21,2.73]:box('shoji rail',(x,y-.037,z),(2.13,.07,.065),dark)
 for dx in [-.69,-.345,0,.345,.69]:box('kumiko vertical',(x+dx,y-.062,1.97),(.019,.029,1.46),wood)
 for z in [1.48,1.73,1.98,2.23,2.48]:box('kumiko horizontal',(x,y-.065,z),(2.05,.032,.019),wood)
# Tatami bound edges and chair-back slats give real construction detail.
for o in list(r.children):
 if o.name.startswith('IR interior rush mat'):
  for dy in [-.88,.88]:box('tatami bound hem',(o.location.x,o.location.y+dy,.46),(3.02,.045,.014),border)
 if o.name.startswith('IR interior chair back'):
  o.hide_render=True
  for dx in [-.24,.24]:box('chair back stile',(o.location.x+dx,o.location.y,1.07),(.045,.06,.65),wood)
  for z in [.94,1.11,1.32]:box('chair back rail',(o.location.x,o.location.y,z),(.50,.05,.055),wood)
# Back service cabinet, with inset doors, drawers, open shelves and ceramic stock.
box('service cabinet',(3.46,-2.80,.85),(.68,3.4,1.08),wood);collider('service cabinet',(3.46,-2.80,.85),(.68,3.4,1.08))
box('cabinet worktop',(3.45,-2.80,1.425),(.79,3.52,.075),dark)
for y in [-4.05,-3.23,-2.41,-1.59]:
 box('cabinet inset door',(3.10,y,.83),(.025,.76,.88),dark)
 box('cabinet panel',(3.079,y,.83),(.024,.64,.75),wood)
 box('cabinet pull',(3.049,y+.23,1.09),(.033,.12,.027),black)
for z in [1.66,2.12,2.57]:box('crockery shelf',(3.65,-2.80,z),(.43,3.45,.045),wood)
for y in [-4.5,-1.10]:box('shelf upright',(3.70,y,2.12),(.12,.075,1.0),dark)
# Lathed vessels are hollow, including their lip and foot (not solid cylinders).
def vessel(name,pos,profile,mat,segments=24):
 vs=[];fs=[]
 for radius,z in profile:
  for k in range(segments):a=2*math.pi*k/segments;vs.append((radius*math.cos(a),radius*math.sin(a),z))
 for j in range(len(profile)-1):
  for k in range(segments):a=j*segments+k;b=j*segments+(k+1)%segments;fs.append((a,b,b+segments,a+segments))
 me=bpy.data.meshes.new(name);me.from_pydata(vs,[],fs);me.materials.append(mat);o=bpy.data.objects.new('IR2 '+name,me);s.collection.objects.link(o);o.parent=r;o.location=pos;o['runtimeGroup']='interior'
 for p in me.polygons:p.use_smooth=True
 return o
cup=[(.035,0),(.045,.01),(.054,.085),(.052,.095),(.043,.095),(.038,.025),(0,.025)]
bowl=[(.045,0),(.049,.012),(.08,.032),(.125,.075),(.128,.083),(.116,.085),(.069,.034),(0,.024)]
for x,y,z in [(-1.4,-3.45,1.075),(1.55,-3.45,1.075),(-1.45,3.45,.835),(1.65,3.45,.835)]:
 for dy in [-.25,.25]:
  box('lacquer serving tray',(x,y+dy,z+.014),(.54,.38,.028),dark)
  vessel('rice bowl',(x-.09,y+dy,z+.03),bowl,ceramic)
  vessel('tea cup',(x+.15,y+dy+.07,z+.03),cup,ceramic)
  for off in [-.011,.011]:box('chopstick',(x,y+dy-.14+off,z+.047),(.28,.008,.008),wood)
for z in [1.69,2.15,2.60]:
 for y in [-4.2,-3.6,-3.0,-2.4,-1.8,-1.3]:vessel('shelf pottery',(3.61,y,z),bowl if z<2.5 else cup,ceramic)
# Reception writing tray and bound menu books, placed on furniture rather than in the path.
box('reception tray',(-3.35,-2,1.34),(.52,.72,.025),dark)
for i in range(3):box('menu book',(-3.35,-2,1.365+i*.027),(.39,.5,.024),cloth if i%2 else paper)
# Light fixture timber ribs and lower diffusers.
for x in [-1.8,1.8]:
 for y in [-2.7,2.7]:
  box('lantern lower rim',(x,y,2.405),(.50,.50,.035),dark)
  for dx in [-.225,.225]:
   for dy in [-.225,.225]:box('lantern corner rib',(x+dx,y+dy,2.59),(.022,.022,.35),dark)
# Subtle plank joints preserve the original floor height and walking collision.
for y in [i*.28-5.46 for i in range(40)]:box('floor board joint',(-.2,y,.301),(8.48,.004,.002),dark)
# Archive source independently; preserve the user's unsaved multi-scene session.
r['interior_revision']='v2';bpy.context.view_layer.update()
bpy.data.libraries.write(R+'/assets/authored/ogimachi/irori-interior-v2.blend',{s},fake_user=True,compress=True)
old=s.camera;s.camera=bpy.data.objects['IR interior review'];s.render.resolution_x=1400;s.render.resolution_y=950;s.render.filepath=R+'/artifacts/ogimachi-phases/irori-interior-v2.png';s.cycles.samples=32
oldsettings=(s.render.resolution_x,s.render.resolution_y,s.cycles.samples)
def render():
 try:bpy.ops.render.render(write_still=True)
 finally:s.camera=old
 return None
bpy.app.timers.register(render,first_interval=.5)
print('Removed false door reveals; detailed restaurant interior authored, checkpoint saved; rendering')
