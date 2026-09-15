import * as THREE from 'three';
import { Props } from '@/world/props';

/**
 * GLB 한 점을 **투명 배경 스프라이트**로 굽는다 — 화면에 띄우는 소품용.
 *
 * `photo.ts` 의 `photoThumbFromModel` 이 세운 문법을 일반화한 것이다: 인벤토리 아이콘을
 * 캔버스로 그렸더니 「이전 느낌 그대로」라는 피드백이 왔고, 답은 **이미 있는 모델을 찍는 것**이었다.
 * 화면 오버레이(손바닥·부적·쪽지)도 같은 문제를 만나므로 굽는 쪽만 떼어 공용으로 둔다.
 *
 * 3D 씬에 실물을 띄우지 않는 이유: 오버레이는 UI 층(z 60)이고 게임 카메라와 무관하게
 * 정지해 있어야 한다. 뷰모델로 카메라에 붙이면 안개·톤매핑·후처리가 전부 얹혀
 * **UI 인데 씬처럼 흔들린다**. 한 번 구워 두면 그 문제가 통째로 사라진다.
 */
export async function modelSprite(
  renderer: THREE.WebGLRenderer,
  url: string,
  opts: {
    size?: number; zoom?: number; yaw?: number; pitch?: number;
    /** 납작한 것(손·사진·부적)은 **가장 얇은 축**에서 봐야 정면이다 — 모델 규약에 기대지 않는다 */
    faceThinAxis?: boolean;
    /** 화면 위쪽으로 세울 축 — 생략하면 남은 두 축 중 긴 쪽(손가락 방향) */
    roll?: number;
    /** 굽기 전에 소품 자세를 고정한다. 런타임에는 이 자세의 이미지 한 장만 남는다. */
    pose?: (root: THREE.Object3D) => void;
  } = {},
): Promise<string> {
  const size = opts.size ?? 512;
  const gltf = await Props.loader().loadAsync(url);
  const root = gltf.scene;
  opts.pose?.(root);
  const scene = new THREE.Scene();
  scene.add(root);
  // 스캔 모델의 알베도는 이미 빛을 물고 있다 — 평평하게 밝히기만 한다(photo.ts 와 같은 이유)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a94a4, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(0.35, 0.9, 1.1);
  scene.add(key);
  // 아래에서 올라오는 약한 채움 — 초칭을 든 손이라 손바닥 밑이 살아야 한다
  const fill = new THREE.DirectionalLight(0xffc98a, 0.5);
  fill.position.set(-0.4, -0.8, 0.6);
  scene.add(fill);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s3 = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const span = Math.max(s3.x, s3.y, s3.z);
  const half = span * 0.5 * (opts.zoom ?? 1.08);

  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, span * 10);
  const dir = new THREE.Vector3();
  if (opts.faceThinAxis) {
    /**
     * 납작한 것의 정면은 **바운딩 박스가 알려 준다**(`photo.ts` 와 같은 규칙): 가장 얇은 축이 법선이다.
     * Tripo 산출물의 축 규약은 프롬프트마다 다르므로 yaw/pitch 를 손으로 맞추면 모델을 갈아 끼울 때마다
     * 다시 틀어진다(실측: 손이 옆으로 누워 나왔다). 위쪽은 남은 두 축 중 **긴 쪽** — 손가락 방향이다.
     */
    const ax: ('x' | 'y' | 'z')[] = ['x', 'y', 'z'];
    const len = { x: s3.x, y: s3.y, z: s3.z };
    const thin = ax.reduce((a, b) => (len[a] <= len[b] ? a : b));
    const rest = ax.filter((a) => a !== thin);
    const up = len[rest[0]!] >= len[rest[1]!] ? rest[0]! : rest[1]!;
    dir.set(thin === 'x' ? 1 : 0, thin === 'y' ? 1 : 0, thin === 'z' ? 1 : 0);
    cam.up.set(up === 'x' ? 1 : 0, up === 'y' ? 1 : 0, up === 'z' ? 1 : 0);
  } else {
    const yaw = opts.yaw ?? 0, pitch = opts.pitch ?? 0;
    dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  }
  cam.position.copy(c).addScaledVector(dir, span * 3);
  cam.lookAt(c);
  if (opts.roll) cam.rotateZ(opts.roll);

  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevRT = renderer.getRenderTarget();
  const prevAlpha = renderer.getClearAlpha();
  const buf = new Uint8Array(size * size * 4);
  try {
    renderer.setClearAlpha(0);                 // 투명 배경 — 오버레이 위에 그대로 얹힌다
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  } finally {
    renderer.setRenderTarget(prevRT);
    renderer.setClearAlpha(prevAlpha);
    rt.dispose();
    // 이 함수가 별도로 읽은 모델이다. PNG를 만든 뒤 임시 GLB의 GPU 자원을 남기지 않는다.
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const skeletons = new Set<THREE.Skeleton>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(mat);
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((mesh as THREE.SkinnedMesh).skeleton);
    });
    for (const mat of materials) {
      for (const value of Object.values(mat)) if (value instanceof THREE.Texture) textures.add(value);
      mat.dispose();
    }
    for (const geo of geometries) geo.dispose();
    for (const tex of textures) tex.dispose();
    for (const skeleton of skeletons) skeleton.dispose();
  }

  // WebGL 은 아래에서 위로 읽는다 — 행을 뒤집어 캔버스 좌표계로 옮긴다
  const img = new ImageData(size, size);
  const row = size * 4;
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  cv.getContext('2d')!.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
