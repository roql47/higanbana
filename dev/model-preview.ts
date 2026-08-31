import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const params = new URLSearchParams(location.search);
const src = params.get('src') ?? '/models/mio-preview-source.glb';
const yaw = Number(params.get('yaw') ?? 0);
const view = params.get('view') ?? 'three-quarter';
const clipName = params.get('clip') ?? '';
const freeze = params.get('freeze') === '1';
const clipTime = Number(params.get('time') ?? 0);
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
if (view === 'front-z') camera.position.set(0, 1.15, 3.5);
else if (view === 'front-x') camera.position.set(3.5, 1.15, 0);
else if (view === 'back-z') camera.position.set(0, 1.15, -3.5);
else camera.position.set(2.4, 1.3, 3.2);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.85, 0);
controls.enableDamping = true;

const label = document.querySelector<HTMLDivElement>('#label')!;
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(src);
const model = gltf.scene;
model.rotation.y = yaw;
model.updateMatrixWorld(true);
const before = new THREE.Box3().setFromObject(model);
const size = before.getSize(new THREE.Vector3());
const scale = 1.62 / Math.max(size.y, 1e-6);
model.scale.setScalar(scale);
model.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(model);
const center = box.getCenter(new THREE.Vector3());
model.position.set(-center.x, -box.min.y, -center.z);
model.traverse((obj) => {
  const mesh = obj as THREE.Mesh;
  if (!mesh.isMesh) return;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
});
scene.add(model);
const mixer = new THREE.AnimationMixer(model);
const sourceClip = gltf.animations.find((candidate) => candidate.name === clipName) ?? gltf.animations[0];
const clip = sourceClip?.clone();
if (clip) {
  clip.tracks = clip.tracks.filter((track) => /(\.quaternion$)|^(Root|Hip)\.position$/.test(track.name));
  mixer.clipAction(clip).play();
  mixer.setTime(clipTime);
  model.updateMatrixWorld(true);
  model.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) skinned.computeBoundingBox();
  });
  const posed = new THREE.Box3().setFromObject(model, true);
  const posedCenter = posed.getCenter(new THREE.Vector3());
  model.position.x -= posedCenter.x;
  model.position.y -= posed.min.y;
  model.position.z -= posedCenter.z;
}
label.textContent = `${src}\nsource ${size.x.toFixed(3)} × ${size.y.toFixed(3)} × ${size.z.toFixed(3)}\nanims ${gltf.animations.length} · playing ${clip?.name ?? 'none'}`;

Object.assign(window, { previewScene: scene, previewModel: model, previewCamera: camera, previewControls: controls });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => {
  if (!freeze) mixer.update(1 / 60);
  controls.update();
  renderer.render(scene, camera);
});
