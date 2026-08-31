import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '@/core/physics';
import { MIO } from '@/character/config';

/** 미오(1.62 m)가 3인칭 카메라로 지나갈 때 머리 위에 0.78 m가 남는 공통 문 유효 높이. */
export const MIO_CLEAR_DOOR_HEIGHT = (MIO.targetHeight ?? 1.62) + 0.78;

interface BuildOptions {
  /**
   * 재질 병합을 이 크기의 XYZ 셀 안에서만 한다. 큰 실내를 한 메시로 합치면 점광원 그림자
   * 큐브맵의 여섯 면이 방 전체 정점을 매번 처리한다. 공간 청크로 나누면 Three의 기존
   * 그림자 프러스텀 컬링이 보이지 않는 방/층을 건너뛴다. 지오메트리와 재질은 그대로다.
   */
  spatialCellSize?: number;
}

/**
 * 모듈러 구조물 공통 도구 — shrine.ts 의 parts/box/collide/roofGeo 패턴을
 * 스토리 구조물(비석·사당·받침대·블록아웃)이 재사용할 수 있게 뽑았다.
 * 재질별로 병합해 구조물 하나 = 드로우콜 재질 수만큼.
 */
export class PartsBuilder {
  private parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  /**
   * `ghost` 는 **콜라이더를 만들지 않는 빌더**다. 같은 평면을 두 벌 지을 때 쓴다 —
   * 폐여관의 「거울 속 세계」처럼 눈에만 있고 몸으로는 없는 층이 그렇다.
   * 옵션이 없으면 두 번째 벌의 벽이 현실 공간에 콜라이더를 겹겹이 깔아 통로가 막힌다.
   */
  constructor(private physics: Physics, private opts: { ghost?: boolean } = {}) {}

  mat(c: number, rough = 0.85) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }); }

  /**
   * 타일 텍스처 재질 — 이 재질을 받은 box() 는 UV 를 **월드 크기**로 다시 깐다.
   * BoxGeometry 기본 UV 는 면마다 0..1 이라, 크기가 다른 박스를 병합하면 같은 텍스처가
   * 널빤지에서는 늘어나고 기둥에서는 뭉갠다 — 면의 실제 치수를 곱해 텍셀 밀도를 통일한다.
   * tint 는 map 에 곱해지므로(three 의 color×map) 기존 단색 팔레트 값에 boost 를 곱해 넘긴다.
   */
  texMat(map: THREE.Texture, normalMap: THREE.Texture | null, tint: number, opts?: { boost?: number; rough?: number; repeat?: number; normalScale?: number }) {
    const m = new THREE.MeshStandardMaterial({
      map,
      normalMap: normalMap ?? undefined,
      color: new THREE.Color(tint).multiplyScalar(opts?.boost ?? 2.1),
      roughness: opts?.rough ?? 0.9,
      metalness: 0,
    });
    if (normalMap) m.normalScale.setScalar(opts?.normalScale ?? 0.8);
    m.userData['worldUV'] = opts?.repeat ?? 0.55;   // 미터당 반복 횟수
    return m;
  }

  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, yaw = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    const rep = m.userData['worldUV'] as number | undefined;
    if (rep) remapBoxUV(g, w, h, d, rep, x, z);
    if (yaw) g.rotateY(yaw);
    g.translate(x, y, z);
    this.parts.push({ geo: g, mat: m });
  }

  cyl(rTop: number, rBot: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 10) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    g.translate(x, y, z);
    this.parts.push({ geo: g, mat: m });
  }

  add(geo: THREE.BufferGeometry, m: THREE.Material) { this.parts.push({ geo, mat: m }); }

  /** 맞배지붕 — 용마루가 x 축 방향. yaw 로 돌린다 */
  gable(cx: number, cz: number, halfW: number, halfD: number, base: number, rise: number, m: THREE.Material, yaw = 0) {
    const v = [
      [-halfW, base, -halfD], [halfW, base, -halfD], [halfW, base, halfD], [-halfW, base, halfD],
      [-halfW + 0.3, base + rise, 0], [halfW - 0.3, base + rise, 0],
    ].flat();
    const idx = [0, 1, 5, 0, 5, 4, 2, 3, 4, 2, 4, 5, 0, 4, 3, 1, 2, 5];
    const pos: number[] = [], uv: number[] = [];
    for (const i of idx) { pos.push(v[i * 3]!, v[i * 3 + 1]!, v[i * 3 + 2]!); uv.push(0, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (yaw) g.rotateY(yaw);
    g.translate(cx, 0, cz);
    g.computeVertexNormals();
    this.parts.push({ geo: g, mat: m });
  }

  collide(x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw = 0) {
    if (this.opts.ghost) return;
    const q = yaw ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw) : undefined;
    this.physics.addStaticBox(new THREE.Vector3(x, y, z), new THREE.Vector3(hx, hy, hz), q);
  }

  /** 재질별(선택 시 공간 셀별) 병합 → 그룹. parts 는 비워진다 (빌더 재사용 가능) */
  build(name: string, opts: BuildOptions = {}): THREE.Group {
    const group = new THREE.Group();
    const byMat = new Map<THREE.Material, Map<string, THREE.BufferGeometry[]>>();
    const cell = opts.spatialCellSize ?? 0;
    const center = new THREE.Vector3();
    for (const p of this.parts) {
      let buckets = byMat.get(p.mat);
      if (!buckets) { buckets = new Map(); byMat.set(p.mat, buckets); }
      let key = 'all';
      if (cell > 0) {
        p.geo.computeBoundingBox();
        p.geo.boundingBox!.getCenter(center);
        key = `${Math.floor(center.x / cell)}:${Math.floor(center.y / cell)}:${Math.floor(center.z / cell)}`;
      }
      let geos = buckets.get(key);
      if (!geos) { geos = []; buckets.set(key, geos); }
      geos.push(p.geo.index ? p.geo.toNonIndexed() : p.geo);
    }
    let chunk = 0;
    for (const [m, buckets] of byMat) {
      for (const geos of buckets.values()) {
        const merged = mergeGeometries(geos, false);
        if (!merged) continue;
        merged.computeVertexNormals();
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, m);
        mesh.name = `${name}-chunk-${chunk++}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    group.name = name;
    this.parts = [];
    return group;
  }
}

/** BoxGeometry(24정점, 면당 4개: +x −x +y −y +z −z)의 UV 를 면의 실제 치수 × 반복률로 편다 */
function remapBoxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, rep: number, ox: number, oz: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const face: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  // 박스마다 다른 위상 — 같은 자리에서 타일 반복이 눈에 띄지 않게 위치로 시드를 만든다
  const off = ((ox * 7.13 + oz * 3.71) % 1 + 1) % 1;
  for (let i = 0; i < 24; i++) {
    const f = face[i >> 2]!;
    uv.setXY(i, uv.getX(i) * f[0] * rep + off, uv.getY(i) * f[1] * rep + off);
  }
}

const tileCache = new Map<string, THREE.Texture>();
/** 반복 타일 텍스처 로드(캐시) — PolyHaven 계열. diff 는 srgb=true, 노멀맵은 false */
export function tileTex(url: string, srgb: boolean): THREE.Texture {
  let t = tileCache.get(url);
  if (!t) {
    t = new THREE.TextureLoader().load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    tileCache.set(url, t);
  }
  return t;
}

/** 캔버스 텍스트 텍스처 — 비석 각인·팻말·석판. 글자는 텍스처가 제일 싸다 */
export function textCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * 실내 칸막이 벽 헬퍼 — school.ts 의 partX/partZ 와 같은 문법을 여관·저택 실내가 공유한다.
 * 문 틈을 남기고 두 조각 + 인방. 콜라이더 포함(요괴 LOS·플레이어 충돌이 이 벽에 막힌다).
 * floorY = 바닥 윗면, H = 벽 높이, door = 문 폭.
 */
export function makePartitions(
  k: PartsBuilder,
  mWall: THREE.Material,
  floorY: number,
  H = 2.6,
  DOOR = 1.2,
  DOOR_HEAD = MIO_CLEAR_DOOR_HEIGHT,
) {
  const T = 0.1;
  const partX = (px: number, zA: number, zB: number, doorAt?: number) => {
    if (doorAt === undefined) {
      const len = zB - zA;
      k.box(T, H, len, px, floorY + H / 2, (zA + zB) / 2, mWall);
      k.collide(px, floorY + H / 2, (zA + zB) / 2, T / 2, H / 2, len / 2);
      return;
    }
    const aLen = doorAt - DOOR / 2 - zA, bLen = zB - (doorAt + DOOR / 2);
    if (aLen > 0.05) { k.box(T, H, aLen, px, floorY + H / 2, zA + aLen / 2, mWall); k.collide(px, floorY + H / 2, zA + aLen / 2, T / 2, H / 2, aLen / 2); }
    if (bLen > 0.05) { k.box(T, H, bLen, px, floorY + H / 2, zB - bLen / 2, mWall); k.collide(px, floorY + H / 2, zB - bLen / 2, T / 2, H / 2, bLen / 2); }
    k.box(T, H - DOOR_HEAD, DOOR, px, floorY + DOOR_HEAD + (H - DOOR_HEAD) / 2, doorAt, mWall);
  };
  const partZ = (pz: number, xA: number, xB: number, doorAt?: number) => {
    if (doorAt === undefined) {
      const len = xB - xA;
      k.box(len, H, T, (xA + xB) / 2, floorY + H / 2, pz, mWall);
      k.collide((xA + xB) / 2, floorY + H / 2, pz, len / 2, H / 2, T / 2);
      return;
    }
    const aLen = doorAt - DOOR / 2 - xA, bLen = xB - (doorAt + DOOR / 2);
    if (aLen > 0.05) { k.box(aLen, H, T, xA + aLen / 2, floorY + H / 2, pz, mWall); k.collide(xA + aLen / 2, floorY + H / 2, pz, aLen / 2, H / 2, T / 2); }
    if (bLen > 0.05) { k.box(bLen, H, T, xB - bLen / 2, floorY + H / 2, pz, mWall); k.collide(xB - bLen / 2, floorY + H / 2, pz, bLen / 2, H / 2, T / 2); }
    k.box(DOOR, H - DOOR_HEAD, T, doorAt, floorY + DOOR_HEAD + (H - DOOR_HEAD) / 2, pz, mWall);
  };
  return { partX, partZ };
}
