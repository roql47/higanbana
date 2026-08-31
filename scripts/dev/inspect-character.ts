/** Inspect a character GLB without importing it into Blender. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const path of process.argv.slice(2)) {
  console.log(`\n=== ${path}`);
  try {
    const doc = await io.read(path);
    const root = doc.getRoot();
    const nodes = root.listNodes();
    const meshes = root.listMeshes();
    const skins = root.listSkins();
    const animations = root.listAnimations();
    let vertices = 0;
    let primitives = 0;
    const mins = [Infinity, Infinity, Infinity];
    const maxs = [-Infinity, -Infinity, -Infinity];
    for (const mesh of meshes) {
      for (const primitive of mesh.listPrimitives()) {
        primitives++;
        const position = primitive.getAttribute('POSITION');
        if (!position) continue;
        vertices += position.getCount();
        const array = position.getArray();
        if (!array) continue;
        for (let i = 0; i < array.length; i += 3) {
          for (let axis = 0; axis < 3; axis++) {
            mins[axis] = Math.min(mins[axis]!, array[i + axis]!);
            maxs[axis] = Math.max(maxs[axis]!, array[i + axis]!);
          }
        }
      }
    }
    console.log(`nodes ${nodes.length} meshes ${meshes.length} primitives ${primitives} vertices ${vertices}`);
    console.log(`skins ${skins.length} animations ${animations.length} materials ${root.listMaterials().length} textures ${root.listTextures().length}`);
    console.log(`local bounds min ${mins.map((v) => v.toFixed(4))} max ${maxs.map((v) => v.toFixed(4))}`);
    for (const skin of skins) console.log(`skin ${skin.getName() || '(unnamed)'}: ${skin.listJoints().length} joints — ${skin.listJoints().map((n) => n.getName()).join(',')}`);
    for (const animation of animations) console.log(`animation ${animation.getName() || '(unnamed)'}: ${animation.listChannels().length} channels`);
    for (const mesh of meshes) {
      const owners = nodes.filter((node) => node.getMesh() === mesh);
      console.log(`mesh ${mesh.getName() || '(unnamed)'}: ${mesh.listPrimitives().length} primitives; nodes ${owners.map((n) => n.getName()).join(',')}`);
    }
    console.log(`named nodes: ${nodes.map((n) => n.getName()).filter(Boolean).join(',')}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
