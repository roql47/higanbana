"""Bake the existing authored oak mesh to eight azimuth views for the new distant forest."""
import bpy, math
import numpy as np
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/textures/ogimachi';OUT.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.new('Ogimachi_Oak_Atlas');bpy.context.window.scene=scene
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/authored/ogimachi/oak-bake-source.glb'))
objects=[o for o in scene.objects if o.type=='MESH']
coords=[o.matrix_world@Vector(c) for o in objects for c in o.bound_box]
low=Vector([min(c[a] for c in coords) for a in range(3)]);high=Vector([max(c[a] for c in coords) for a in range(3)])
center=(low+high)/2;extent=max(high.x-low.x,high.y-low.y,high.z-low.z)*1.09
cam=bpy.data.cameras.new('Atlas camera');camera=bpy.data.objects.new('Atlas camera',cam);scene.collection.objects.link(camera);scene.camera=camera;cam.type='ORTHO';cam.ortho_scale=extent
world=bpy.data.worlds.new('Atlas ambient');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.8,1);world.node_tree.nodes['Background'].inputs[1].default_value=.75;scene.world=world
ld=bpy.data.lights.new('Atlas sun','SUN');ld.energy=2.0;light=bpy.data.objects.new('Atlas sun',ld);scene.collection.objects.link(light);light.rotation_euler=(.5,-.4,-.6)
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.use_denoising=True
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.resolution_percentage=100;scene.render.film_transparent=True
scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
atlas=np.zeros((768,1536,4),dtype=np.float32)
for i in range(8):
    a=i*math.pi/4;camera.location=center+Vector((math.sin(a)*extent*2,-math.cos(a)*extent*2,0));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    filepath=ROOT/'assets/authored/ogimachi'/f'oak-frame-{i}.png';scene.render.filepath=str(filepath);bpy.ops.render.render(write_still=True)
    image=bpy.data.images.load(str(filepath),check_existing=False);pixels=np.empty(384*384*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape((384,384,4));row=1-i//4;atlas[row*384:(row+1)*384,(i%4)*384:(i%4+1)*384]=pixels;bpy.data.images.remove(image)
image=bpy.data.images.new('Ogimachi oak eight-view atlas',1536,768,alpha=True);image.pixels.foreach_set(atlas.ravel());image.filepath_raw=str(OUT/'oak-8.png');image.file_format='PNG';image.save()
print('Oak atlas saved: '+str(OUT/'oak-8.png'))
