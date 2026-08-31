/** Report the largest quaternion step and loop seam for selected animation bones. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const path = process.argv[2] ?? 'public/models/mio.glb';
const clipName = process.argv[3] ?? 'run';
const wanted = new Set((process.argv[4] ?? 'Spine01,Spine02,NeckTwist01,NeckTwist02,Head').split(','));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(path);
const clip = doc.getRoot().listAnimations().find((animation) => animation.getName() === clipName);
if (!clip) throw new Error(`Missing clip: ${clipName}`);
console.log(`clip ${clip.getName()} channels ${clip.listChannels().length}`);
console.log(clip.listChannels().slice(0, 8).map((channel) => `${channel.getTargetNode()?.getName()}:${channel.getTargetPath()}`).join(', '));

const angle = (a: ArrayLike<number>, ai: number, b: ArrayLike<number>, bi: number) => {
  const dot = Math.abs(
    a[ai]! * b[bi]! + a[ai + 1]! * b[bi + 1]! +
    a[ai + 2]! * b[bi + 2]! + a[ai + 3]! * b[bi + 3]!,
  );
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
};

for (const channel of clip.listChannels()) {
  const node = channel.getTargetNode();
  if (channel.getTargetPath() !== 'rotation' || !node || !wanted.has(node.getName())) continue;
  const sampler = channel.getSampler();
  const times = sampler.getInput()?.getArray();
  const values = sampler.getOutput()?.getArray();
  if (!times || !values) continue;
  let max = { degrees: 0, from: 0, to: 0 };
  for (let i = 1; i < times.length; i++) {
    const degrees = angle(values, (i - 1) * 4, values, i * 4);
    if (degrees > max.degrees) max = { degrees, from: times[i - 1]!, to: times[i]! };
  }
  const seam = angle(values, (times.length - 1) * 4, values, 0);
  console.log(`${node.getName().padEnd(12)} keys ${String(times.length).padStart(4)} max ${max.degrees.toFixed(2).padStart(7)}deg @ ${max.from.toFixed(3)}-${max.to.toFixed(3)} seam ${seam.toFixed(2).padStart(7)}deg`);
}
