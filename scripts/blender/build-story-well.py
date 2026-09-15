from pathlib import Path
source=Path(__file__).with_name('build-story-shrine.py')
exec(compile(source.read_text().split('try:\n')[0],str(source),'exec'))
scene.name='Story_Well_Exterior_V1'
water=material('Well dark water',(.008,.018,.015))
rope=material('Well hemp rope',(.30,.23,.13))
try:
 # Individually authored annular blocks retain a genuine opening.
 for row in range(4):
  for i in range(16):
   a=(i+(row%2)*.5)*math.tau/16+.012;b=a+math.tau/16-.024;lo=.15+row*.29;hi=lo+.275
   verts=[(r*math.cos(t),r*math.sin(t),z) for z in [lo,hi] for r,t in [(1.25,a),(1.25,b),(.87,b),(.87,a)]]
   mesh=bpy.data.meshes.new('Well masonry');mesh.from_pydata(verts,[],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.materials.append(stone if (i+row)%3 else stone_alt);o=bpy.data.objects.new('Well stone ring block',mesh);scene.collection.objects.link(o)
 cylinder('Shallow dark water placeholder',(0,0,.17),.86,.02,water)
 for x in [-1.55,1.55]:
  box('Well timber upright',(x,0,1.9),(.23,.28,3.5),wood)
  box('Post stone base',(x,0,.3),(.5,.55,.45),stone)
 box('Well head beam',(0,0,3.55),(3.7,.3,.3),panel)
 axle=cylinder('Wooden windlass axle',(0,0,2.65),.16,3.3,wood);axle.rotation_euler[1]=math.pi/2
 for i in range(14):
  bpy.ops.mesh.primitive_torus_add(major_radius=.18,minor_radius=.026,major_segments=16,minor_segments=6,location=(-.38+i*.055,0,2.65),rotation=(0,math.pi/2,0));bpy.context.object.data.materials.append(rope);bpy.context.object.name='Wound rope'
 cylinder('Hanging rope',(0,-.19,1.65),.027,1.9,rope)
 box('Crank arm',(1.8,0,2.37),(.12,.12,.58),metal)
 handle=cylinder('Crank grip',(2.02,0,2.12),.065,.45,wood);handle.rotation_euler[1]=math.pi/2
 # Bucket set beside the well, with individual staves and metal hoops.
 for i in range(12):
  a=i*math.tau/12;o=box('Bucket stave',(2.15+.28*math.cos(a),-.8+.28*math.sin(a),.48),(.13,.07,.56),panel if i%3 else panel_alt);o.rotation_euler[2]=a+math.pi/2
 cylinder('Bucket bottom',(2.15,-.8,.23),.28,.045,wood)
 for z in [.3,.65]:
  bpy.ops.mesh.primitive_torus_add(major_radius=.30,minor_radius=.026,major_segments=16,minor_segments=6,location=(2.15,-.8,z));bpy.context.object.data.materials.append(metal)
 for i in range(7):box('Well approach stepping stone',(.15*(-1)**i,-2-i*.65,.12),(.75,.52,.17),stone if i%3 else stone_alt)
 for m in materials:
  objs=[o for o in scene.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==m]
  if not objs:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in objs:o.select_set(True)
  bpy.context.view_layer.objects.active=objs[0]
  if len(objs)>1:bpy.ops.object.join()
 bpy.ops.object.select_all(action='SELECT')
 out=ROOT/'public/models/ogimachi/story-well.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,use_active_scene=True,export_apply=True)
 bpy.data.libraries.write(str(ROOT/'assets/authored/ogimachi/Story-well.blend'),{scene},path_remap='RELATIVE_ALL',fake_user=True)
 print('Well exported',out.stat().st_size,'bytes')
finally:bpy.context.window.scene=previous
