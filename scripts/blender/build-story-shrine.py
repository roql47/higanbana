from pathlib import Path
import bpy, math
ROOT=Path('/Users/jay/Claude/3D_motion')
previous=bpy.context.window.scene
scene=bpy.data.scenes.new('Story_Shrine_Interior_V4');bpy.context.window.scene=scene
materials=[]
activeDoor=None
doorRoots=[]
def material(name,color,texture=None):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.85
 if texture:
  image=bpy.data.images.load(str(ROOT/'public/textures/ogimachi/frontage'/texture),check_existing=True);node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;m.node_tree.links.new(node.outputs['Color'],p.inputs['Base Color'])
 if texture:
  stem=texture.replace('-color.png','')
  for suffix in ['normal','roughness']:
   path=ROOT/'public/textures/ogimachi/frontage'/f'{stem}-{suffix}.png'
   if path.exists():
    img=bpy.data.images.load(str(path),check_existing=True);img.colorspace_settings.name='Non-Color';n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=img
    if suffix=='normal':
     normal=m.node_tree.nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.4;m.node_tree.links.new(n.outputs['Color'],normal.inputs['Color']);m.node_tree.links.new(normal.outputs['Normal'],p.inputs['Normal'])
    else:m.node_tree.links.new(n.outputs['Color'],p.inputs['Roughness'])
 materials.append(m);return m
wood=material('Shrine weathered timber',(.3,.2,.12),'wood-color.png');dark=material('Shrine roof',(.12,.15,.15),'tile-color.png');stone=material('Shrine foundation',(.38,.40,.37));red=material('Shrine aged vermilion',(.36,.075,.035));door=material('Shrine door shadow',(.025,.029,.025));metal=material('Shrine fitting bronze',(.23,.18,.09))
soil=material('Shrine packed earth',(.32,.25,.15),'../packed-gravel.webp')
stone_alt=material('Shrine varied retaining stone',(.29,.31,.28))
panel=material('Shrine warm wood siding',(.26,.15,.075));panel_alt=material('Shrine varied boards',(.21,.12,.057))
def box(name,loc,size,mat):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat);o.parent=activeDoor;return o
def cylinder(name,loc,radius,depth,mat):
 bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat);o.parent=activeDoor;return o
try:
 # Blender Y points north; glTF exports this toward negative world Z.
 court=box('Packed earth courtyard',(0,2,.25),(23,28,.5),soil)
 # World-scale UVs prevent the courtyard texture stretching across 28 metres.
 for loop in court.data.loops:
  v=court.data.vertices[loop.vertex_index].co;court.data.uv_layers.active.data[loop.index].uv=(v.x/3,v.y/3)
 # Individual masonry facing, two courses. Keep the gate's approach open.
 for row in range(2):
  for side in [-1,1]:
   for i in range(23):
    y=-11.4+i*1.18
    box('Side retaining stone',(side*11.48,y,.125+row*.25),(.28,1.14,.235),stone if (i+row)%3 else stone_alt)
  for edge in [-12,16]:
   for i in range(19):
    x=-10.8+i*1.2
    if edge==-12 and abs(x)<2:continue
    box('Front rear retaining stone',(x,edge,.125+row*.25),(1.16,.28,.235),stone if (i+row)%3 else stone_alt)
 # Two shallow entrance steps connect the 50cm terrace to the approach.
 for i in range(2):box('Courtyard entrance step',(0,-12.75+i*.5,.125+i*.125),(3.8,.5,.25+i*.25),stone)

 box('Timber main floor',(0,6,1),(15,11,.5),wood)
 # Hollow sanctuary: walls replace the previous solid mass.
 for x in [-5.38,5.38]:box('Sanctuary side wall',(x,7,3.3),(.24,7,4.1),panel)
 box('Sanctuary rear wall',(0,10.38,3.3),(11,.24,4.1),panel)
 for x in [-4.85,4.85]:box('Front wall return',(x,3.5,3.3),(1.3,.24,4.1),panel)
 box('Sanctuary upper front wall',(0,3.5,5.0),(8.4,.24,.7),panel)
 for i in range(20):box('Interior floor board',(-4.95+i*.52,7,1.29),(.5,6.65,.08),panel if i%3 else panel_alt)
 for y in [5,7.5,10]:box('Interior exposed ceiling beam',(0,y,5.35),(10.5,.26,.32),wood)
 box('Rear altar dais',(0,9,1.56),(4.8,1.8,.45),wood)
 box('Altar table',(0,9,2.35),(3.8,1.1,.16),panel)
 for x in [-1.6,1.6]:box('Altar table leg',(x,9,1.95),(.15,.7,.7),wood)
 box('Central sacred tablet',(0,9.5,3.1),(.8,.18,1.25),wood)
 for x in [-1.25,1.25]:
  cylinder('Interior candle holder',(x,9,2.52),.16,.16,metal)
  cylinder('Interior candle',(x,9,2.78),.065,.38,stone)

 # Individual boards reveal scale and joints without relying on a dark flat block.
 for side in [-1,1]:
  for i in range(22):box('Side siding plank',(side*5.52,3.65+i*.31,3.3),(.055,.295,4.05),panel if i%3 else panel_alt)
 for i in range(34):box('Rear siding plank',(-5.35+i*.32,10.52,3.3),(.305,.055,4.05),panel if i%3 else panel_alt)
 for i in range(30):box('Veranda floor board',(-7.25+i*.5,1.98,1.285),(.48,2.9,.07),panel if i%4 else panel_alt)
 for side in [-1,1]:
  for y in [1,3,5,7,9,11]:box('Veranda railing post',(side*7.15,y,1.87),(.16,.16,1.25),wood)
  for z in [1.55,2.42]:box('Veranda side rail',(side*7.15,6,z),(.14,10.2,.14),panel)
  for x in [side*3.1,side*5.1,side*7.15]:box('Veranda front post',(x,.65,1.87),(.16,.16,1.25),wood)
  for z in [1.55,2.42]:box('Veranda front rail',(side*5.1,.65,z),(4.25,.14,.14),panel)

 for x in [-6.5,-3.25,0,3.25,6.5]:
  for y in [1,11]:box('Structural pillar',(x,y,3.4),(.32,.32,4.5),wood)
 for y in [1,11]:box('Lintel',(0,y,5.45),(15,.4,.45),wood)
 for x in [-6.7,6.7]:box('Side beam',(x,6,5.45),(.4,11,.45),wood)
 for x in [-2.2,2.2]:
  activeDoor=bpy.data.objects.new('ShrineDoorLeft' if x<0 else 'ShrineDoorRight',None);scene.collection.objects.link(activeDoor);doorRoots.append(activeDoor)
  box('Closed sanctuary door',(x,3.43,3),(4.2,.15,3.5),door)
  for i in range(12):box('Door lattice',(x-1.9+i*.345,3.3,3),(.055,.12,3.4),wood)
  for z in [1.6,2.5,3.4,4.3]:box('Door rail',(x,3.22,z),(4,.13,.06),wood)
 activeDoor=None
 for x in [-4.45,4.45]:box('Door surround',(x,3.12,3.02),(.16,.22,3.7),panel)
 for z in [1.28,4.83]:box('Door surround lintel',(0,3.12,z),(9,.23,.16),panel)
 for i,x in enumerate([-.35,.35]):
  activeDoor=doorRoots[i];box('Door bronze pull',(x,3.02,2.9),(.07,.10,.3),metal)
 activeDoor=None
 # Gable roof with deep eaves and separate ridge.
 verts=[(-8.5,-.5,5.5),(8.5,-.5,5.5),(-8.5,6,8.5),(8.5,6,8.5),(-8.5,12.5,5.5),(8.5,12.5,5.5)]
 mesh=bpy.data.meshes.new('Shrine roof planes');mesh.from_pydata(verts,[],[(0,1,3,2),(2,3,5,4)]);mesh.materials.append(dark);o=bpy.data.objects.new('Deep pitched roof',mesh);scene.collection.objects.link(o)
 uv=mesh.uv_layers.new(name='Roof tile UV')
 for loop in mesh.loops:
  v=mesh.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(v.x/2,v.y/2)
 solid=o.modifiers.new('Roof thickness','SOLIDIFY');solid.thickness=.23
 for x in [i*.55-7.7 for i in range(29)]:
  for y in [.05,11.95]:box('Exposed eave rafter',(x,y,5.35),(.11,1.5,.18),panel)
 for y in [-.5,12.5]:box('Eave fascia',(0,y,5.4),(17.2,.15,.32),panel)

 box('Roof ridge',(0,6,8.52),(18,.36,.38),dark)
 for x in [i*.5-8 for i in range(33)]:
  for sign in [-1,1]:
   o=box('Roof raised seam',(x,6+sign*3.25,7.02),(.045,7.16,.065),dark);o.rotation_euler[0]=-sign*math.atan2(3,6.5)
 for i in range(4):
  top=.5+(i+1)*.1875
  box('Front stair',(0,-1.15+i*.5,(.5+top)/2),(5.5,.5,top-.5),stone)
 # Short stepping stones lead from the torii to the offering courtyard.
 for i in range(7):box('Courtyard stepping stone',(0,-9.5+i*.95,.535),(1.7,.75,.07),stone)
 # Entry gate and seven offering seats in a semicircle facing the sanctuary.
 for x in [-3.6,3.6]:cylinder('Torii column',(x,-10.5,2.65),.23,5.3,red)
 box('Torii upper beam',(0,-10.5,5.2),(9,.5,.42),red);box('Torii cross beam',(0,-10.5,4.05),(8,.28,.27),red)
 for i in range(7):
  a=math.pi*.15+i*math.pi*.7/6;x=7*math.cos(a);y=-1.5-5*math.sin(a)
  box('Offering stone '+str(i+1),(x,y,.8),(.75,.75,.6),stone);box('Offering tray '+str(i+1),(x,y,1.14),(.85,.85,.09),wood)
 for x in [-8.5,8.5]:
  cylinder('Lantern stone foot',(x,-7,.8),.36,.65,stone);box('Lantern light housing',(x,-7,1.4),(.65,.65,.65),stone);box('Lantern cap',(x,-7,1.8),(.9,.9,.15),stone)
 # Join by material: stable small draw-call count.
 for parent in [None]+doorRoots:
  for m in materials:
   objs=[o for o in scene.objects if o.type=='MESH' and o.parent==parent and o.data.materials and o.data.materials[0]==m]
   if not objs:continue
   bpy.ops.object.select_all(action='DESELECT')
   for o in objs:o.select_set(True)
   for o in objs:
    bpy.context.view_layer.objects.active=o
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
   bpy.context.view_layer.objects.active=objs[0]
   if len(objs)>1:bpy.ops.object.join()
 bpy.ops.object.select_all(action='SELECT')
 out=ROOT/'public/models/ogimachi/story-shrine.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
 bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/Story-shrine.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
 print('Shrine first form exported',out.stat().st_size,'bytes',len(scene.objects),'mesh groups')
finally:bpy.context.window.scene=previous
