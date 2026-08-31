import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeAxialBillboardMaterial, makeBillboardPlane } from '@/world/billboard';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07101a);
scene.fog = new THREE.FogExp2(0x0b1720, 0.018);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 140);
camera.position.set(17, 7.5, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 3.3, 0);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshBasicMaterial({ color: 0x101a16 }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
scene.add(new THREE.GridHelper(60, 30, 0x283a32, 0x17251f));

const loader = new THREE.TextureLoader();
const [atlasA, atlasB] = await Promise.all([
  loader.loadAsync('/textures/impostors/cedar-a-8.webp'),
  loader.loadAsync('/textures/impostors/cedar-b-8.webp'),
]);
for (const texture of [atlasA, atlasB]) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
}

const geometry = makeBillboardPlane(3.8, 7.3 * 1.04);
const makeRow = (texture: THREE.Texture, z: number, name: string) => {
  const material = makeAxialBillboardMaterial(texture, {
    alphaTest: 0.3,
    color: 0x435847,
    atlas: { frames: 8, columns: 4, rows: 2 },
  });
  const mesh = new THREE.InstancedMesh(geometry, material, 7);
  mesh.name = name;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 7; i++) {
    dummy.position.set((i - 3) * 3.4, 0, z);
    dummy.rotation.y = i * 0.73;
    dummy.scale.setScalar(0.82 + (i % 3) * 0.1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
};
makeRow(atlasA, -2.2, 'cedar-a-impostors');
makeRow(atlasB, 4.0, 'cedar-b-impostors');

const label = document.querySelector<HTMLDivElement>('#label')!;
label.textContent = '8방향 삼나무 임포스터\n앞줄 A형 · 뒷줄 B형\n45°마다 실제 GLB 렌더 프레임 선택';

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
