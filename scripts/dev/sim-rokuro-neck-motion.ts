import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { RokuroKubi } from '@/ai/rokurokubi';
import type { Sfx } from '@/audio/sfx';

const noop = () => {};
const sfx = new Proxy({}, { get: () => noop }) as Sfx;
const doc = await new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  .read('public/models/yokai-rokurokubi.glb');

const gltfRoot = doc.getRoot();
const joints = new Set(gltfRoot.listSkins().flatMap((skin) => skin.listJoints()));
const objects = new Map<ReturnType<typeof gltfRoot.listNodes>[number], THREE.Object3D>();
for (const node of gltfRoot.listNodes()) {
  const object = joints.has(node) ? new THREE.Bone() : new THREE.Group();
  object.name = node.getName();
  object.position.fromArray([...node.getTranslation()]);
  object.quaternion.fromArray([...node.getRotation()]);
  object.scale.fromArray([...node.getScale()]);
  objects.set(node, object);
}
for (const node of gltfRoot.listNodes()) {
  const parent = objects.get(node)!;
  for (const child of node.listChildren()) parent.add(objects.get(child)!);
}
const model = new THREE.Group();
for (const node of gltfRoot.listScenes()[0]!.listChildren()) model.add(objects.get(node)!);
model.scale.setScalar(2.15 / 0.98);

type DebugRokuro = RokuroKubi & {
  model: THREE.Object3D;
  neck: THREE.Bone[];
  head: THREE.Bone;
  armL: THREE.Bone | null;
  armR: THREE.Bone | null;
  hairL: THREE.Bone | null;
  hairR: THREE.Bone | null;
  bodyRoot: THREE.Bone | null;
  spine: THREE.Bone | null;
  chest: THREE.Bone | null;
  restQ: Map<THREE.Bone, THREE.Quaternion>;
  restP: Map<THREE.Bone, THREE.Vector3>;
  chainRestInv: THREE.Quaternion;
  faceLocal: THREE.Vector3;
  stateT: number;
  reach: number;
  hookCur: number;
  rangedAttack: boolean;
  rangedReachBlend: number;
  lastBendW: THREE.Vector3;
};

const arena = {
  minX: -20, maxX: 20, minZ: -10, maxZ: 10,
  floorY: 0, escapeX: 30,
  blockers: [],
};
const player = new THREE.Vector3(0, 0, 0);
const ai = new RokuroKubi({
  url: '', height: 2.15, pos: new THREE.Vector3(4, 0, 0), yaw: -Math.PI / 2, arena,
}, sfx) as DebugRokuro;

ai.model = model;
ai.root.add(model);
model.traverse((object) => {
  if (!(object instanceof THREE.Bone)) return;
  if (/^Neck_\d+$/.test(object.name)) ai.neck[Number(object.name.slice(5))] = object;
  else if (object.name === 'Head') ai.head = object;
  else if (object.name === 'L_Arm') ai.armL = object;
  else if (object.name === 'R_Arm') ai.armR = object;
  else if (object.name === 'Hair_L') ai.hairL = object;
  else if (object.name === 'Hair_R') ai.hairR = object;
  else if (object.name === 'Root') ai.bodyRoot = object;
  else if (object.name === 'Spine') ai.spine = object;
  else if (object.name === 'Chest') ai.chest = object;
  ai.restQ.set(object, object.quaternion.clone());
  ai.restP.set(object, object.position.clone());
});
model.updateWorldMatrix(false, true);
ai.neck[0]!.getWorldQuaternion(ai.chainRestInv).invert();
const restHeadWorld = ai.head.getWorldQuaternion(new THREE.Quaternion());
ai.faceLocal.set(0, 0, 1).applyQuaternion(restHeadWorld.invert()).normalize();

const quatAngle = (a: THREE.Quaternion, b: THREE.Quaternion) => (
  2 * Math.acos(THREE.MathUtils.clamp(Math.abs(a.dot(b)), -1, 1)) * 180 / Math.PI
);
const prevTip = new THREE.Vector3();
const prevHeadQ = new THREE.Quaternion();
const prevNeckQ = ai.neck.map((bone) => bone.quaternion.clone());
const prevBend = ai.lastBendW.clone();
let ready = false;
let lastState = ai.state;
const samples: { frame: number; state: string; tipStep: number; headAngle: number; neckAngle: number; neckIndex: number; bendAngle: number }[] = [];

ai.activate(player);
for (let frame = 0; frame < 8 * 60; frame++) {
  const time = frame / 60;
  const runningAway = time >= 3.5 && time < 6.5;
  if (runningAway) player.x -= 3.6 / 60;
  ai.update(1 / 60, player, {
    speed: runningAway ? 3.6 : 0,
    moving: runningAway,
    crouching: false,
  });
  if (ai.state !== lastState) {
    console.log(
      `transition frame=${frame} ${lastState}->${ai.state}`
      + ` reach=${ai.reach.toFixed(3)} hook=${ai.hookCur.toFixed(2)}`
      + ` ranged=${ai.rangedAttack} blend=${ai.rangedReachBlend.toFixed(3)}`,
    );
    lastState = ai.state;
  }
  ai.root.updateWorldMatrix(true, true);
  const invRoot = ai.root.matrixWorld.clone().invert();
  const tip = ai.head.getWorldPosition(new THREE.Vector3()).applyMatrix4(invRoot);
  const headQ = ai.head.getWorldQuaternion(new THREE.Quaternion());
  const rootQInv = ai.root.getWorldQuaternion(new THREE.Quaternion()).invert();
  headQ.premultiply(rootQInv);
  if (ready) {
    let neckAngle = 0;
    let neckIndex = -1;
    for (let i = 0; i < ai.neck.length; i++) {
      const angle = quatAngle(prevNeckQ[i]!, ai.neck[i]!.quaternion);
      if (angle > neckAngle) { neckAngle = angle; neckIndex = i; }
      prevNeckQ[i]!.copy(ai.neck[i]!.quaternion);
    }
    samples.push({
      frame,
      state: ai.state,
      tipStep: tip.distanceTo(prevTip),
      headAngle: quatAngle(prevHeadQ, headQ),
      neckAngle,
      neckIndex,
      bendAngle: prevBend.angleTo(ai.lastBendW) * 180 / Math.PI,
    });
  } else {
    for (let i = 0; i < ai.neck.length; i++) prevNeckQ[i]!.copy(ai.neck[i]!.quaternion);
  }
  prevTip.copy(tip);
  prevHeadQ.copy(headQ);
  prevBend.copy(ai.lastBendW);
  ready = true;
}

const ranked = [...samples].sort((a, b) => b.tipStep - a.tipStep).slice(0, 12);
for (const sample of ranked) {
  console.log(
    `frame=${sample.frame.toString().padStart(3)} state=${sample.state.padEnd(7)}`
    + ` tip=${(sample.tipStep * 100).toFixed(2).padStart(6)}cm`
    + ` head=${sample.headAngle.toFixed(2).padStart(6)}deg`
    + ` neck=${sample.neckAngle.toFixed(2).padStart(6)}deg#${sample.neckIndex.toString().padStart(2)}`
    + ` bend=${sample.bendAngle.toFixed(2).padStart(6)}deg`,
  );
}
const maxTipStep = Math.max(...samples.map((sample) => sample.tipStep));
const maxHeadAngle = Math.max(...samples.map((sample) => sample.headAngle));
const maxNeckAngle = Math.max(...samples.map((sample) => sample.neckAngle));
console.log(
  `max tip=${(maxTipStep * 100).toFixed(2)}cm head=${maxHeadAngle.toFixed(2)}deg neck=${maxNeckAngle.toFixed(2)}deg`,
);
if (maxTipStep > 0.15) throw new Error(`neck tip frame jump ${(maxTipStep * 100).toFixed(2)}cm`);
if (maxHeadAngle > 3) throw new Error(`head frame jump ${maxHeadAngle.toFixed(2)}deg`);
if (maxNeckAngle > 2) throw new Error(`neck bone frame jump ${maxNeckAngle.toFixed(2)}deg`);
