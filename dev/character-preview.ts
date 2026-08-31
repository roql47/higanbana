import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CharacterModel } from '@/character/model';
import { MIO } from '@/character/config';
import { settings } from '@/core/settings';
import type { CharacterController } from '@/character/controller';

const params = new URLSearchParams(location.search);
const clipName = params.get('clip') ?? 'idle';
const clipTime = Number(params.get('time') ?? 0);
const freeze = params.get('freeze') === '1';
const view = params.get('view') ?? 'front';
const visibility = Number(params.get('visibility') ?? 1);
const distance = Number(params.get('distance') ?? 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x181a20);
scene.add(new THREE.HemisphereLight(0xe8efff, 0x282018, 2.4));
const key = new THREE.DirectionalLight(0xfff2df, 4.2);
key.position.set(2.5, 4, 3.5);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x8daaff, 2.2);
rim.position.set(-3, 2, -3);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.CircleGeometry(2.5, 64), new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor, new THREE.GridHelper(4, 16, 0x5d6470, 0x30343c));

const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.15, view === 'back' ? -distance : distance);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.82, 0);
controls.enableDamping = true;

const model = await CharacterModel.load(MIO, renderer);
scene.add(model.root);
model.play(clipName, 0, { timeScale: freeze ? 0 : 1 });
const action = model.actions.get(clipName);
if (action) action.time = clipTime;
const hc = settings.character;
model.headPitchTarget = clipName === 'run' ? hc.headPitchRun : clipName === 'walk' ? hc.headPitchWalk : hc.headPitchIdle;
model.spinePitchTarget = clipName === 'run' ? hc.spinePitchRun : clipName === 'walk' ? hc.spinePitchWalk : hc.spinePitchIdle;

const fakeController = {
  position: new THREE.Vector3(), yaw: 0, accel: new THREE.Vector3(), grounded: true,
  justLanded: false, landImpact: 0, justJumped: false,
} as CharacterController;
model.update(0, fakeController);
model.setVisibility(visibility);
document.querySelector<HTMLDivElement>('#label')!.textContent = `runtime CharacterModel\n${clipName} @ ${clipTime.toFixed(2)} s\narm limits ${MIO.constrainLocomotionArms ? 'on' : 'off'}`;
Object.assign(window, { previewModel: model, previewController: fakeController, previewScene: scene, previewCamera: camera });

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = freeze ? 0 : Math.min((now - last) / 1000, 0.05);
  last = now;
  model.update(dt, fakeController);
  controls.update();
  renderer.render(scene, camera);
});
