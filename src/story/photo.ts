import * as THREE from 'three';
import { Props } from '@/world/props';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * 가족사진 — ACT 2 의 핵심 이미지이자 이 게임의 열쇠 소품.
 *
 * 스토리보드: *사진에는 어린 미오와 사요가 함께 있지만, **사요의 얼굴 부분만 물에 번진 것처럼
 * 훼손**되어 있다.* 장면 목적 ③ 이 통째로 이 한 장에 걸려 있다 —
 * "기억의 결손을 시각화한다". 미오는 언니의 얼굴을 **기억하지 못한다**, 그걸 설명하는 대신 보여준다.
 *
 * ## 사진은 **실제 게임 월드에서 찍는다** (`preparePhoto`)
 * 처음엔 캔버스 그림 → 다음엔 모델만 렌더해 그림 배경에 합성 — 둘 다 "게임과 다른 화풍"으로
 * 읽혔다(사용자 지적: 포즈가 이상하다 · 배경이 모델링이 아니다). 최종형은 **로케 촬영**이다:
 * 로드가 끝난 실제 씬에서, 참배로의 진짜 도리이 앞에 캐릭터를 세우고 시간대를 잠깐 '낮'으로
 * 돌려 메인 렌더러로 한 컷 찍는다. 10년 전 피안제 날의 사진이 **그 장소에서** 나온다.
 *  - **사요** = 현재 미오 모델 그대로 (얼굴은 물얼룩이 지운다 — 자매가 닮았다는 암시.
 *    ACT 30 에서 얼룩이 걷히면 그 얼굴이 나온다)
 *  - **어린 미오** = SkeletonUtils 로 복제해 0.62 배, 다른 포즈 프레임
 * 렌더가 실패하면 그린 인물로 남는다 — 사진이 비는 것보다 낫다.
 *
 * 물얼룩·입자·긁힘은 계속 캔버스다. **훼손이 사진의 일부여야** 나중에(ACT 30)
 * 얼룩이 걷히는 연출을 같은 코드에서 할 수 있다. `damaged: 0` 이면 온전한 사진이 나온다.
 */

const W = 768, H = 512;
/** 인화지 여백(흰 테두리) */
const M = 26;
/** 사진 속 지면선 — 인물의 발이 여기 선다 */
const GROUND = M + (H - M * 2) * 0.74;
/**
 * 어린 미오의 축소율 — 미오 모델(1.62 m, 열여섯)을 **여섯 살**로 줄인다.
 * 1.15 / 1.62 ≈ 0.71. 사요(1.49 m) 옆에 세우면 키 비가 0.77 로, 여섯 살과 열두 살의 차이다.
 * (언니를 미오 모델로 대신하던 시절에는 0.62 였다 — 그때는 옆에 선 것이 1.62 m 였으니까)
 */
const YOUNG = 0.71;
/** 인물 목표 크기(px)와 가로 위치(0..1) */
const SAYO = { h: 244, x: 0.575 };
const MIO = { h: 158, x: 0.40 };

export interface PhotoOpts {
  /** 0 = 온전한 사진 · 1 = 사요의 얼굴이 완전히 번졌다 (기본 1) */
  damaged?: number;
}

/** 캐릭터 렌더에 필요한 최소 인터페이스 (`CharacterModel` 이 그대로 맞는다) */
export interface PhotoModel {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clipNames: string[];
  play: (name: string, fade?: number) => void;
  actions: Map<string, THREE.AnimationAction>;
  height: number;
}

/**
 * 사진 속 **언니** — 사요의 3D 모델(`story/sayo.ts`).
 *
 * 예전에는 미오 모델을 두 번 렌더해서 언니 자리에 세웠다(「자매가 닮았다」는 핑계였지만,
 * 사실은 사요 모델이 없었다). 2026-08-22 에 사요가 생겼으니 언니는 언니로 찍는다 —
 * ACT 30 에서 얼룩이 걷히며 드러나는 얼굴도 그때부터 **사요의 얼굴**이 된다.
 */
export interface PhotoSister {
  root: THREE.Object3D;
  height: number;
  /** 클립의 한 프레임으로 세운다 */
  pose(name: string, t: number): void;
}

export interface PhotoContext {
  model: PhotoModel;
  /** 있으면 언니를 이 모델로 찍는다. 없으면 예전처럼 미오 모델을 두 번 쓴다 */
  sister?: PhotoSister | null;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  village: { ground: { roadAt(s: number): { x: number; z: number; dirX: number; dirZ: number }; heightAt(x: number, z: number): number }; toriiS0: number };
  timeOfDay: { name: string; set(name: string, seconds?: number): void };
  /** 촬영 동안 감출 것들 (손에 든 초칭 등 — 10년 전 대낮 사진에 나오면 안 된다) */
  hide?: THREE.Object3D[];
}

/**
 * `preparePhoto` 가 찍어 둔 **로케 원판**. 완성본이 아니라 재료를 들고 있는다.
 *
 * 예전에는 완성된 텍스처만 캐시했다. 그러면 `damaged` 를 바꿔 다시 만들 때 로케 사진이
 * 사라지고 그려진 폴백이 나온다 — **ACT 30 에서 얼룩이 걷히며 사요의 얼굴이 드러나는 연출이
 * 바로 그 재생성**이라, 원판을 들고 있어야 한다.
 */
let shot: { img: CanvasImageSource; bleed: { x: number; y: number; r: number } | null } | null = null;
/** 훼손도별 완성본 캐시 — 같은 값을 두 번 그리지 않는다 */
const made = new Map<number, { front: THREE.CanvasTexture; back: THREE.CanvasTexture }>();

/**
 * 앞면(사진)과 뒷면(연필 글씨) 텍스처 한 벌.
 * @param opts.damaged 1 = 사요의 얼굴이 물에 번져 지워진 상태(기본) · 0 = 온전한 사진(ACT 30)
 */
export function makePhoto(opts: PhotoOpts = {}): { front: THREE.CanvasTexture; back: THREE.CanvasTexture } {
  const dmg = opts.damaged ?? 1;
  const hit = made.get(dmg);
  if (hit) return hit;
  const one = { front: drawFront(dmg, null, shot ?? undefined), back: drawBack() };
  made.set(dmg, one);
  return one;
}

/** 로케 원판이 있는가 — 없으면 그려진 폴백이 나온다 */
export function photoIsShot() { return shot !== null; }

/**
 * **인벤토리 아이콘을 사진 모델에서 딴다** (`props/photo-hands.glb` — 사진을 쥔 두 손).
 *
 * 캔버스로 그린 사진을 줄여 넣어 봤더니 「이전 느낌 그대로」였다(사용자). 그럴 수밖에 —
 * 가방에 든 것은 도판이 아니라 **손에 쥐는 물건**이고, 그 물건은 이미 모델로 있다.
 * 정면에서 직교 카메라로 한 컷 찍어 정사각으로 자른다. 배경은 투명이라 슬롯 위에 그대로 얹힌다.
 *
 * 정면 축은 **바운딩 박스에서 찾는다** — 가장 얇은 축이 사진의 법선이다. 모델 규약(+Z 앞면)에
 * 기대지 않는 이유는, 소품이 교체되면 그 규약부터 깨지기 때문이다.
 */
export async function photoThumbFromModel(
  renderer: THREE.WebGLRenderer,
  url = '/models/props/photo-hands.glb',
  size = 256,
  damaged = 1,
): Promise<string> {
  const gltf = await Props.loader().loadAsync(url);
  const root = gltf.scene;
  const scene = new THREE.Scene();
  scene.add(root);
  // 스캔 모델의 알베도는 이미 빛을 물고 있다 — 평평하게 밝히기만 한다
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa2b0, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(0.3, 0.6, 1);
  scene.add(key);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s3 = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  // 가장 얇은 축 = 사진의 법선. 그 축에서 바라본다
  const thin = s3.x <= s3.y && s3.x <= s3.z ? 'x' : s3.y <= s3.z ? 'y' : 'z';
  const dir = new THREE.Vector3(thin === 'x' ? 1 : 0, thin === 'y' ? 1 : 0, thin === 'z' ? 1 : 0);
  const planeSize = thin === 'x' ? Math.max(s3.y, s3.z) : thin === 'y' ? Math.max(s3.x, s3.z) : Math.max(s3.x, s3.y);
  /**
   * 정사각 크롭. 모델 전체를 담으면 아래가 **손이 잘린 빈자리**가 되고, 왼쪽 가장자리에
   * **손가락이 들어온다**(사용자 리포트). 사진 안쪽만 남도록 조이고(0.46) 들어 올린다(0.08) —
   * 아이콘에 필요한 건 「쥐고 있는 모양」이 아니라 **사진에 찍힌 둘**이다.
   */
  const half = planeSize * 0.5 * CROP.zoom;
  const target = c.clone().add(new THREE.Vector3(0, planeSize * CROP.lift, 0));
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, planeSize * 8);
  cam.position.copy(target).addScaledVector(dir, planeSize * 3);
  cam.up.set(0, 1, 0);
  if (thin === 'y') cam.up.set(0, 0, -1);   // 위에서 내려다보는 경우의 상단 방향
  cam.lookAt(target);

  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevRT = renderer.getRenderTarget();
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearAlpha(0);                 // 배경 투명 — 슬롯 색이 비쳐야 한다
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, cam);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  renderer.setRenderTarget(prevRT);
  renderer.setClearAlpha(prevAlpha);

  const img = new ImageData(size, size);
  const row = size * 4;
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * row, (size - y) * row), y * row);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const cctx = cv.getContext('2d')!;
  cctx.putImageData(img, 0, 0);
  /**
   * **얼룩은 여기서 얹는다.** 모델 텍스처에는 언니의 얼굴이 **그대로 남아 있다**(실측) —
   * 아이템 설명(「언니의 얼굴만 물에 번진 것처럼 지워져 있다」)과 ACT 30 의 복원 연출이
   * 그 얼굴에 걸려 있으므로, 아이콘에서 지운 채로 내보낸다.
   * 좌표는 렌더가 고정이라 비율로 박아 둔다(언니 = 왼쪽 큰 쪽, 화면 38 % · 21 %).
   */
  if (damaged > 0) {
    // 얼굴 좌표는 **모델 기준**(planeSize 배)이라 크롭을 바꿔도 따라온다 — 화면 비율로 박아 두면
    // 조일 때마다 얼룩이 얼굴에서 벗어난다(그래서 한 번 어긋났다)
    const span = 2 * half / planeSize;                       // 화면 한 변이 담는 모델 폭(비율)
    const fx = 0.5 + FACE.right / span;
    const fy = 0.5 - (FACE.up - CROP.lift) / span;
    bleed(cctx, size * fx, size * fy, size * (FACE.r / span), damaged);
  }

  // 정리 — 아이콘 한 장 때문에 1 MB 짜리 메시가 메모리에 남으면 안 된다
  rt.dispose();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      for (const t of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap]) t?.dispose();
      std.dispose();
    }
  });
  return cv.toDataURL('image/png');
}

/** 아이콘 크롭 — 모델의 사진 폭(`planeSize`) 대비 배율과 들어 올림 */
const CROP = { zoom: 0.46, lift: 0.08 };
/**
 * 모델 사진 속 **언니의 얼굴** 위치와 크기. 모델 중심 기준 `planeSize` 배다.
 * 머리카락 픽셀로 재려다 배경(처마·나무)까지 물어 10 % 어긋났다 — **얼굴을 4 배로 확대해
 * 눈으로 찍었다**: 0.46 배 크롭에서 화면 44 % · 22 %, 얼굴 반지름 화면의 4 %.
 * 얼룩은 얼굴보다 조금 크게(7 %) 잡아 머리까지 먹는다.
 */
const FACE = { right: -0.026, up: 0.202, r: 0.040 };

/**
 * **사진 모델 위에 얹는 물얼룩 데칼** (ACT 2 의 손에 든 사진).
 *
 * 모델 텍스처에는 언니의 얼굴이 그대로 남아 있다 — 30 cm 앞에서 그대로 보인다.
 * 텍스처를 다시 굽는 대신 얼굴 자리에 판 한 장을 띄운다. 좌표는 아이콘과 **같은 상수**(`FACE`)를
 * 쓰므로 둘이 어긋날 수 없고, ACT 30 은 이 메시를 감추기만 하면 얼굴이 드러난다.
 *
 * @param photoWidth 모델의 사진 폭(월드 단위) — `FACE` 는 이 폭에 대한 비율이다
 * @param z          사진면의 국소 z (레이캐스트로 재서 준다). 여기서 살짝 앞으로 띄운다
 */
export function makeFaceBleed(photoWidth: number, z: number, damaged = 1): THREE.Mesh {
  const PX = 256;          // 캔버스 한 변
  const R = 62;            // 그 안에서의 얼룩 반지름
  const CY = 0.34;         // 얼룩 중심의 세로 위치 — 아래는 흘러내린 자국 몫으로 비워 둔다
  const cv = document.createElement('canvas');
  cv.width = cv.height = PX;
  const bctx = cv.getContext('2d')!;
  bleed(bctx, PX * 0.5, PX * CY, R, damaged);
  bleed(bctx, PX * 0.5, PX * CY, R * 0.8, damaged);   // 한 겹으로는 얼굴이 비친다 (뷰어와 같은 이유)
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const rWorld = FACE.r * photoWidth;
  const size = (PX / R) * rWorld;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    // 종이 위의 얼룩이므로 종이와 같은 빛을 받아야 한다 — Basic 으로 두면 붙여 넣은 스티커가 된다.
    // 모델 알베도를 0.62 로 눌러 놨으므로(`act2.ts`) 여기도 같이 눌러 톤을 맞춘다
    new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, roughness: 0.7, metalness: 0,
      color: new THREE.Color(0.62, 0.62, 0.62), polygonOffset: true, polygonOffsetFactor: -2,
    }),
  );
  mesh.name = 'face-bleed';
  mesh.position.set(FACE.right * photoWidth, FACE.up * photoWidth - (0.5 - CY) * size, z + rWorld * 0.06);
  mesh.renderOrder = 11;    // 사진(10) 바로 위
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * **뷰어용 원판** — 인벤에서 사진을 열었을 때 나오는 그 그림.
 *
 * 세 번 바뀌었다: 캔버스로 그린 사진 → 모델(`photo-hands.glb`)에서 딴 컷 → **원본 사진 한 장**.
 * 모델에서 뜬 컷은 3D 스캔이라 가장자리가 뭉개지고 손이 함께 들어왔다. 사용자가 원판 이미지를
 * 직접 주었으므로 그걸 그대로 쓴다(`public/textures/photo-front.webp` — 회색 배경을 잘라내고
 * 1400×1005 로 구웠다. 인화지의 말린 가장자리는 그대로 남겼다).
 *
 * 얼룩은 **굽지 않는다.** 원판은 깨끗하게 두고 훼손도별로 얹어 캐시한다 —
 * ACT 30 은 `damaged 0` 으로 같은 원판을 얼룩 없이 받는다.
 */
let frontShot: HTMLCanvasElement | null = null;
const modelFronts = new Map<number, HTMLCanvasElement>();
/**
 * 원판 안에서 **언니의 얼굴**이 있는 자리. x·r 은 가로 폭 대비, y 는 세로 높이 대비 비율.
 * 원판에 10 % 격자를 얹어 눈으로 읽었다 — 얼굴 중심 (0.445, 0.245), 얼굴 폭이 가로의 7 % 라
 * 얼룩은 그보다 크게 5.2 % 반지름.
 */
const PHOTO_FACE = { x: 0.445, y: 0.245, r: 0.052 };

export async function loadPhotoFront(url = '/textures/photo-front.webp'): Promise<void> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('사진 원판 로드 실패: ' + url));
    i.src = url;
  });
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  cv.getContext('2d')!.drawImage(img, 0, 0);
  frontShot = cv;
  modelFronts.clear();
}

/** 원판에 훼손도를 얹은 앞면. 아직 안 읽었으면 null → 호출부가 캔버스 사진으로 폴백 */
export function modelPhotoFront(damaged = 1): HTMLCanvasElement | null {
  if (!frontShot) return null;
  const hit = modelFronts.get(damaged);
  if (hit) return hit;
  const src = frontShot;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  if (damaged > 0) {
    // **두 겹.** 원판이 밝아서 한 겹으로는 얼굴이 비쳐 보인다 — 「지워져 있다」가 아니라 「덧칠했다」가 된다.
    // 두 번째는 조금 작게 얹어 가운데만 더 짙게 하고 가장자리의 번짐은 그대로 둔다
    const x = src.width * PHOTO_FACE.x, y = src.height * PHOTO_FACE.y, r = src.width * PHOTO_FACE.r;
    bleed(ctx, x, y, r, damaged);
    bleed(ctx, x, y, r * 0.8, damaged);
  }
  modelFronts.set(damaged, cv);
  return cv;
}

/** 훼손도별 축소본 캐시 */
const thumbs = new Map<number, string>();

/**
 * **인벤토리 아이콘용 축소본**(data URL).
 *
 * 아이콘이 🖼️ 이모지였다. 인벤토리에 든 것은 *액자 그림*이 아니라 **이 사진 한 장**이고,
 * 이미 완성본 캔버스를 들고 있으니 그걸 잘라 쓰면 된다 — 슬롯이 정사각형이라 가운데(인물 둘)를
 * 정사각으로 자른다. 로케 원판이 없으면 그려진 폴백이 그대로 축소된다.
 */
export function photoThumb(damaged = 1): string {
  const hit = thumbs.get(damaged);
  if (hit) return hit;
  const src = makePhoto({ damaged }).front.image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  const sw = src.height;                       // 정사각 크롭 (인물은 가운데 0.4~0.58 에 있다)
  ctx.drawImage(src, (src.width - sw) / 2, 0, sw, src.height, 0, 0, 128, 128);
  const url = c.toDataURL('image/png');
  thumbs.set(damaged, url);
  return url;
}

/**
 * 실제 씬에서 사진을 찍는다. **월드 로드가 끝난 뒤, 프레임 루프가 돌기 전** 한 번 부른다(main).
 * 시간대를 '낮'으로 돌리고 → 캐릭터 둘을 도리이 앞에 세우고 → 메인 렌더러로 RT 한 컷 →
 * 전부 원위치. 화면에는 아무것도 그려지지 않는다.
 */
export function preparePhoto(cx: PhotoContext, opts: PhotoOpts = {}) {
  const { model, renderer, scene, village, timeOfDay } = cx;
  const sister = cx.sister ?? null;
  const g = village.ground;
  const keep = {
    parent: model.root.parent,
    pos: model.root.position.clone(),
    rot: model.root.rotation.clone(),
    scale: model.root.scale.clone(),
    visible: model.root.visible,
    time: timeOfDay.name,
    hidden: (cx.hide ?? []).map((o) => ({ o, v: o.visible })),
    sis: sister ? { pos: sister.root.position.clone(), rot: sister.root.rotation.clone(), visible: sister.root.visible } : null,
  };
  let rt: THREE.WebGLRenderTarget | null = null;
  let young: THREE.Object3D | null = null;
  try {
    // --- 시간: 피안제의 낮. 즉시 적용(하늘 굽기 포함) ---
    timeOfDay.set('day', 0);
    for (const h of keep.hidden) h.o.visible = false;   // 복제 전에 감춰야 복제본도 감긴 채 나온다

    // --- 무대: 참배로 첫 도리이 앞 ---
    const s0 = village.toriiS0;
    const stand = g.roadAt(s0 - 2.2);
    const nx = -stand.dirZ, nz = stand.dirX;            // 길의 좌측 법선
    const place = (o: THREE.Object3D, off: number, back: number, yawJitter: number) => {
      const x = stand.x + nx * off - stand.dirX * back;
      const z = stand.z + nz * off - stand.dirZ * back;
      o.position.set(x, g.heightAt(x, z), z);
      // 카메라(길 남쪽)를 본다 — facing = (sin yaw, 0, cos yaw) = 길 진행의 반대
      o.rotation.set(0, Math.atan2(-stand.dirX, -stand.dirZ) + yawJitter, 0);
    };

    // 포즈: 가만히 서서 찍는 사진이다 — 걷기·둘러보기 프레임이 걸리면 이상해진다(그랬다)
    const clipName = model.clipNames.includes('standing_relax') ? 'standing_relax' : 'idle';
    const clip = model.actions.get(clipName)?.getClip() ?? null;

    if (sister) {
      // --- 언니는 언니로 --- 사요 모델을 그 자리에 세운다
      sister.root.visible = true;
      place(sister.root, 0.34, 0, -0.08);
      sister.pose('idle', 1.2);
      // 어린 미오 = 미오 모델 **본체**를 0.71 배로. 복제할 이유가 없어졌다(둘이 다른 모델이다)
      model.root.visible = true;
      model.root.scale.setScalar(YOUNG);
      place(model.root, -0.38, 0.1, 0.12);
      model.play(clipName, 0);
      model.mixer.update(clip ? clip.duration * 0.71 : 0.5);
      model.root.updateMatrixWorld(true);
      sister.root.updateMatrixWorld(true);
    } else {
      // --- 폴백: 사요 모델이 없으면 예전처럼 미오를 두 번 쓴다 ---
      model.root.visible = true;
      model.root.scale.setScalar(1);
      place(model.root, 0.34, 0, -0.08);
      model.play(clipName, 0);
      model.mixer.update(clip ? clip.duration * 0.32 : 0.4);

      young = cloneSkeleton(model.root);
      young.scale.setScalar(0.62);
      place(young, -0.38, 0.1, 0.12);
      scene.add(young);
      if (clip) {
        const mixer = new THREE.AnimationMixer(young);
        mixer.clipAction(clip).play();
        mixer.update(clip.duration * 0.71);
      }
      model.root.updateMatrixWorld(true);
      young.updateMatrixWorld(true);
    }

    // --- 카메라: 길 남쪽에서 북(도리이·신사 쪽)을 본다. 2배 해상도 = 다운스케일 안티에일리어싱 ---
    const camP = g.roadAt(s0 - 6.0);
    const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);
    cam.position.set(camP.x + nx * 0.15, g.heightAt(camP.x, camP.z) + 1.28, camP.z);
    const lookY = g.heightAt(stand.x, stand.z) + 0.95;
    cam.lookAt(stand.x + nx * 0.05, lookY, stand.z);
    cam.updateMatrixWorld(true);

    rt = new THREE.WebGLRenderTarget(W * 2, H * 2);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, cam);
    const buf = new Uint8Array(W * 2 * H * 2 * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W * 2, H * 2, buf);
    renderer.setRenderTarget(prevRT);

    // GPU 는 아래가 0 번 행 — 뒤집으면서 ImageData 로
    const img = new ImageData(W * 2, H * 2);
    const row = W * 2 * 4;
    for (let y = 0; y < H * 2; y++) img.data.set(buf.subarray((H * 2 - 1 - y) * row, (H * 2 - y) * row), y * row);
    const worldC = document.createElement('canvas');
    worldC.width = W * 2; worldC.height = H * 2;
    worldC.getContext('2d')!.putImageData(img, 0, 0);

    // 물얼룩 = 사요 머리의 화면 좌표 (사진 영역 기준으로 환산)
    const head = sister ?? { root: model.root, height: model.height };
    const hv = head.root.position.clone();
    hv.y += head.height * 0.87;   // 정수리가 아니라 **얼굴**을 지워야 한다
    hv.project(cam);
    const bleedAt = {
      x: M + (hv.x * 0.5 + 0.5) * (W - M * 2),
      y: M + (1 - (hv.y * 0.5 + 0.5)) * (H - M * 2),
      r: 27,
    };

    shot = { img: worldC, bleed: bleedAt };
    made.clear();   // 원판이 생겼으니 폴백으로 그려 둔 것은 버린다
  } catch (e) {
    console.warn('[photo] 로케 촬영 실패 → 그린 인물 유지', e);
  } finally {
    // 전부 원위치 — 사진 한 장 때문에 세계가 이동해 있으면 안 된다
    if (young) { scene.remove(young); }
    if (sister && keep.sis) {
      sister.root.position.copy(keep.sis.pos);
      sister.root.rotation.copy(keep.sis.rot);
      sister.root.visible = keep.sis.visible;
    }
    model.root.position.copy(keep.pos);
    model.root.rotation.copy(keep.rot);
    model.root.scale.copy(keep.scale);
    model.root.visible = keep.visible;
    if (keep.parent && model.root.parent !== keep.parent) keep.parent.add(model.root);
    for (const h of keep.hidden) h.o.visible = h.v;
    timeOfDay.set(keep.time, 0);
    rt?.dispose();
  }
}

function canvas(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * 앞면. `people` 이 있으면(캐릭터 렌더) 그 콜백이 인물을 그리고 사요 머리 위치를 돌려준다.
 * 없으면 예전처럼 캔버스 인물을 그린다.
 */
function drawFront(
  damaged: number,
  people: ((ctx: CanvasRenderingContext2D) => { x: number; y: number; r: number } | null) | null,
  world?: { img: CanvasImageSource; bleed: { x: number; y: number; r: number } | null },
): THREE.CanvasTexture {
  return canvas((ctx) => {
    // --- 인화지 ---
    ctx.fillStyle = '#e2d7c0';
    ctx.fillRect(0, 0, W, H);

    const px = M, py = M, pw = W - M * 2, ph = H - M * 2;
    const ground = GROUND;

    // --- 로케 촬영본: 실제 씬 렌더가 사진 전체를 채운다 ---
    if (world) {
      ctx.save();
      ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
      // 인화지 톤 — 원색이면 게임 스크린샷으로 보인다. 세피아로 눌러 10년 전 인화지로.
      // RT 직접 렌더에는 포스트FX 노출이 안 걸려 원본이 어둡다 — 밝기를 여기서 크게 올린다(실측)
      ctx.filter = 'sepia(0.5) saturate(0.85) contrast(1.02) brightness(1.75)';
      ctx.drawImage(world.img, px, py, pw, ph);
      ctx.filter = 'none';
      ctx.restore();
      finishFront(ctx, damaged, world.bleed);
      return;
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();

    // --- 세피아 하늘 ---
    const sky = ctx.createLinearGradient(0, py, 0, ground);
    sky.addColorStop(0, '#d6c39c');
    sky.addColorStop(1, '#b39f79');
    ctx.fillStyle = sky;
    ctx.fillRect(px, py, pw, ph);

    // --- 도리이: 두 사람 뒤에 선다. 이 사진이 **피안제 날**이었다는 유일한 단서 ---
    ctx.fillStyle = '#8a5442';
    const tx = px + pw * 0.52, tw = 236, th = 196, top = ground - th;
    ctx.fillRect(tx - tw / 2, top, 18, th);                 // 좌 기둥
    ctx.fillRect(tx + tw / 2 - 18, top, 18, th);            // 우 기둥
    ctx.fillRect(tx - tw / 2 - 26, top - 2, tw + 52, 15);   // 가사기(맨 위 가로대)
    ctx.fillRect(tx - tw / 2 - 8, top + 40, tw + 16, 11);   // 누키(두 번째 가로대)

    // --- 뒤편 삼나무 띠 — 개별 나무가 아니라 톱니 실루엣 하나. 사진에서는 그렇게 보인다 ---
    ctx.fillStyle = 'rgba(74,62,45,0.94)';
    ctx.beginPath();
    ctx.moveTo(px, ground);
    for (let x = px; x <= px + pw; x += 15) {
      const h = 44 + Math.sin(x * 0.13) * 13 + Math.sin(x * 0.041) * 20;
      ctx.lineTo(x + 7, ground - h);
      ctx.lineTo(x + 15, ground);
    }
    ctx.closePath(); ctx.fill();

    // --- 바닥 ---
    const gr = ctx.createLinearGradient(0, ground, 0, py + ph);
    gr.addColorStop(0, '#6b5a43');
    gr.addColorStop(1, '#4a3d2c');
    ctx.fillStyle = gr;
    ctx.fillRect(px, ground, pw, py + ph - ground);
    ctx.restore();

    // --- 인물 ---
    let bleedAt: { x: number; y: number; r: number } | null;
    if (people) {
      bleedAt = people(ctx);
    } else {
      bleedAt = paintFigures(ctx, px, pw, ground);
    }

    finishFront(ctx, damaged, bleedAt);
  });
}

/** 물얼룩 → 입자 → 비네트 → 긁힘·모서리 — 그림 경로와 로케 경로가 공유하는 마무리 */
function finishFront(ctx: CanvasRenderingContext2D, damaged: number, bleedAt: { x: number; y: number; r: number } | null) {
  const px = M, py = M, pw = W - M * 2, ph = H - M * 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
  // --- 물에 번진 얼룩: **사요의 얼굴만** ---
  if (damaged > 0 && bleedAt) bleed(ctx, bleedAt.x, bleedAt.y, bleedAt.r, damaged);

  // --- 세월 ---
  grain(ctx, px, py, pw, ph);
  // 네 모서리가 어두워진다(빛에 바랜 인화지는 가운데가 아니라 가장자리가 죽는다)
  const vig = ctx.createRadialGradient(px + pw / 2, py + ph / 2, Math.min(pw, ph) * 0.3, px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(58,42,24,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();

  // --- 인화지 위의 흠: 접힌 자국 · 긁힘 · 모서리 마모 ---
  ctx.strokeStyle = 'rgba(255,250,238,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(W * 0.16, 0); ctx.lineTo(W * 0.125, H); ctx.stroke();
  ctx.strokeStyle = 'rgba(70,55,35,0.16)';
  ctx.lineWidth = 1;
  for (const [x0, y0, x1, y1] of [[120, 90, 300, 120], [430, 400, 570, 372], [650, 130, 706, 250]] as const) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(120,100,70,0.24)';
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
    ctx.beginPath(); ctx.arc(cx, cy, 44, 0, Math.PI * 2); ctx.fill();
  }
}

/** 캔버스 인물(대체용) — 캐릭터 렌더가 실패했을 때만 쓴다. 사요 머리 위치를 돌려준다 */
function paintFigures(ctx: CanvasRenderingContext2D, px: number, pw: number, ground: number) {
  const sayo = figure(ctx, px + pw * SAYO.x, ground, SAYO.h, '#c4b697', '#241c14');
  const mio = figure(ctx, px + pw * MIO.x, ground, MIO.h, '#3d4859', '#241d16');
  // 손을 잡고 있다 — 이 게임 전체가 이 한 줄에서 나온다
  const handX = (sayo.shoulderL + mio.shoulderR) / 2;
  const handY = mio.shoulderY + mio.headR * 1.9;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#a89a7c'; ctx.lineWidth = 13;
  ctx.beginPath(); ctx.moveTo(sayo.shoulderL + 3, sayo.shoulderY + 6); ctx.lineTo(handX + 5, handY); ctx.stroke();
  ctx.strokeStyle = '#a98d6c'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(mio.shoulderR - 2, mio.shoulderY + 4); ctx.lineTo(handX - 3, handY); ctx.stroke();
  ctx.fillStyle = '#b89a76';
  ctx.beginPath(); ctx.ellipse(handX, handY, 9, 7, 0.2, 0, Math.PI * 2); ctx.fill();
  // 머리카락 실루엣은 남긴다 — "낡아서"가 아니라 "저 사람 얼굴만 없다"로 읽히게
  hair(ctx, sayo.headX, sayo.headY, sayo.headR, '#241c14', 0.82);
  return { x: sayo.headX, y: sayo.headY + 2, r: sayo.headR * 1.12 };
}

interface Figure { headX: number; headY: number; headR: number; shoulderY: number; shoulderL: number; shoulderR: number }

/** 사람 하나 — 머리·머리카락·몸. 얼굴은 읽힐락 말락 해야 한다 */
function figure(ctx: CanvasRenderingContext2D, x: number, footY: number, h: number, cloth: string, hairColor: string): Figure {
  const headR = h * 0.105;
  const headY = footY - h + headR;
  const shoulderY = headY + headR * 1.7;
  const halfShoulder = headR * 1.15;
  const halfHem = headR * 1.5;

  ctx.fillStyle = cloth;
  ctx.beginPath();
  ctx.moveTo(x - halfShoulder, shoulderY);
  ctx.lineTo(x + halfShoulder, shoulderY);
  ctx.lineTo(x + halfHem, footY);
  ctx.lineTo(x - halfHem, footY);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#b99e7e';
  ctx.fillRect(x - headR * 0.3, headY + headR * 0.6, headR * 0.6, headR * 0.8);

  ctx.fillStyle = '#c6ab8a';
  ctx.beginPath(); ctx.ellipse(x, headY, headR * 0.84, headR, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(42,30,20,0.6)';
  const eye = headR * 0.16;
  ctx.beginPath(); ctx.arc(x - headR * 0.33, headY - headR * 0.06, eye, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + headR * 0.33, headY - headR * 0.06, eye, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(42,30,20,0.34)'; ctx.lineWidth = Math.max(1, headR * 0.1);
  ctx.beginPath(); ctx.moveTo(x - headR * 0.2, headY + headR * 0.45); ctx.lineTo(x + headR * 0.2, headY + headR * 0.45); ctx.stroke();

  hair(ctx, x, headY, headR, hairColor, 1);
  return { headX: x, headY, headR, shoulderY, shoulderL: x - halfShoulder, shoulderR: x + halfShoulder };
}

/** 머리카락 — 정수리를 덮고 귀 옆으로 내려온다 */
function hair(ctx: CanvasRenderingContext2D, x: number, headY: number, headR: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, headY - headR * 0.16, headR * 0.95, headR * 0.9, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x - headR * 0.95, headY - headR * 0.2, headR * 0.3, headR * 1.7);
  ctx.rect(x + headR * 0.65, headY - headR * 0.2, headR * 0.3, headR * 1.7);
  ctx.fill();
  ctx.restore();
}

/**
 * 물에 번진 얼룩.
 * 물이 인화지를 먹으면 **유제가 녹아 번지고 종이색이 올라온다** — 지워진 자리 + 고인 테두리 + 흘러내린 줄기.
 */
function bleed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number) {
  ctx.save();
  // 종이색보다 **어둡게** 지운다. 인화지색 그대로 칠하면 전구처럼 떠 보인다(실제로 그랬다)
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, `rgba(191,175,145,${0.86 * k})`);
  g.addColorStop(0.6, `rgba(183,166,136,${0.7 * k})`);
  g.addColorStop(1, 'rgba(178,161,131,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 1.1, 0, 0, Math.PI * 2); ctx.fill();
  for (const [dx, dy, rr] of [[-0.5, -0.4, 0.55], [0.6, -0.1, 0.48], [-0.2, 0.7, 0.6], [0.45, 0.62, 0.4]] as const) {
    const g2 = ctx.createRadialGradient(x + dx * r, y + dy * r, 1, x + dx * r, y + dy * r, rr * r);
    g2.addColorStop(0, `rgba(188,172,142,${0.6 * k})`);
    g2.addColorStop(1, 'rgba(188,172,142,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.5 * k;
  ctx.strokeStyle = '#8a7250';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.12, r * 0.98, r * 1.05, 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.34 * k;
  ctx.beginPath(); ctx.ellipse(x - r * 0.1, y + r * 0.3, r * 0.72, r * 0.8, -0.3, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.42 * k;
  ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (const dx of [-0.45, -0.05, 0.38]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * r, y + r * 0.85);
    ctx.lineTo(x + dx * r * 1.2, y + r * (2.1 + Math.abs(dx) * 1.4));
    ctx.stroke();
  }
  ctx.restore();
}

/** 인화지 입자 — 없으면 벡터 그림처럼 보인다 */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    d[i] = clamp255(d[i]! + n);
    d[i + 1] = clamp255(d[i + 1]! + n * 0.95);
    d[i + 2] = clamp255(d[i + 2]! + n * 0.8);
  }
  ctx.putImageData(img, x, y);
}
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** 뒷면 — 연필로 쓴 날짜. 「사진 확인」에서 뒤집으면 나온다 */
function drawBack(): THREE.CanvasTexture {
  return canvas((ctx) => {
    ctx.fillStyle = '#e6dcc7';
    ctx.fillRect(0, 0, W, H);
    grain(ctx, 0, 0, W, H);
    ctx.fillStyle = 'rgba(120,100,70,0.22)';
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]] as const) {
      ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(64,56,46,0.72)';
    ctx.textAlign = 'left';
    ctx.font = '400 46px "Nanum Pen Script", "Noto Serif KR", serif';
    ctx.fillText('彼ヶ里  彼岸祭', 88, 210);
    ctx.font = '400 38px "Nanum Pen Script", "Noto Serif KR", serif';
    ctx.fillText('미오 여섯 살', 88, 282);
    // 두 번째 줄은 물에 번져 읽히지 않는다 — 여기에 사요의 이름이 있었다
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillText('사요 열여섯', 88, 344);
    ctx.restore();
    bleed(ctx, 205, 326, 82, 0.9);
  });
}
