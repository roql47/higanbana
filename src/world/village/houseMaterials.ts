import * as THREE from 'three';

/**
 * 폐가 재질 — 절차적 PBR 세트.
 *
 * 예전에는 64 px 알베도 한 장이 전부였다. 그래서 아무리 형태를 잘 잡아도
 * "코드로 그린 것"처럼 보였다. 이 게임의 광원은 사실상 **움직이는 점광원 하나**(초칭)이고,
 * 그때 실물감을 만드는 건 색이 아니라 **빛이 요철을 스칠 때 생기는 미세 그림자**다.
 * 평면에는 그 정보가 아예 없다.
 *
 * 그래서 재질 한 장마다 세 장을 만든다 — 전부 캔버스에서 파생시키므로 다운로드는 0 바이트다.
 *   1) 알베도  — 캔버스에 직접 그린다 (+ 파인 곳을 미리 곱해 어둡게: 베이크드 AO)
 *   2) 노멀맵  — 높이 캔버스의 중심차분. 알베도에 선으로 그려 둔 홈·결이 실제 요철이 된다
 *   3) ARM     — R:AO  G:러프니스  B:메탈(0). 러프니스가 상수가 아니어야 나무가 나무로 보인다
 *
 * 타일 반복은 셰이더 안티타일링 대신 **버텍스 컬러 그런지**(house.ts)로 깬다.
 * 시야가 초칭 반경(~3 m)으로 제한돼 한 번에 타일 한두 장만 보이므로 그 편이 싸고 효과적이다.
 */

export interface HouseMaterials {
  dirt: THREE.MeshStandardMaterial;
  plank: THREE.MeshStandardMaterial;
  plankDark: THREE.MeshStandardMaterial;
  tatami: THREE.MeshStandardMaterial;
  mud: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  thatch: THREE.MeshStandardMaterial;
  shojiMat: THREE.MeshStandardMaterial;
  fusuma: THREE.MeshStandardMaterial;
}

// ---------------------------------------------------------------- 캔버스 유틸

type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;

function makeCanvas(w: number, h: number, draw: Draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  draw(c, w, h);
  return cv;
}

function canvasTexture(cv: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // WebGLTextures 가 GPU 최대치로 클램프하므로 16 을 그냥 넣어도 안전하다
  t.anisotropy = 16;
  return t;
}

/** 알베도 휘도 → 높이(그레이). 어두운 선 = 파인 홈이라는 가정 (invert 면 반대) */
function lumaHeight(src: HTMLCanvasElement, invert = false) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d')!.getImageData(0, 0, w, h);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let v = (p[i]! * 0.30 + p[i + 1]! * 0.59 + p[i + 2]! * 0.11);
    if (invert) v = 255 - v;
    p[i] = p[i + 1] = p[i + 2] = v; p[i + 3] = 255;
  }
  return makeCanvas(w, h, (c) => c.putImageData(d, 0, 0));
}

/** 3×3 박스 블러된 높이값 읽기용 배열 (AO 는 국소 평균보다 낮은 곳이 어둡다) */
function heightArray(cv: HTMLCanvasElement) {
  const w = cv.width, h = cv.height;
  const p = cv.getContext('2d')!.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = p[i * 4]! / 255;
  return { a, w, h };
}

const wrap = (v: number, n: number) => ((v % n) + n) % n;

/**
 * 높이 캔버스 → 탄젠트 공간 노멀맵.
 * 알베도와 같은 CanvasTexture(flipY=true)로 감싸야 상하가 어긋나지 않는다 —
 * DataTexture 는 flipY 기본값이 false 라 뒤집힌다.
 */
function normalCanvas(height: HTMLCanvasElement, strength: number) {
  const { a, w, h } = heightArray(height);
  const H = (x: number, y: number) => a[wrap(y, h) * w + wrap(x, w)]!;
  return makeCanvas(w, h, (c) => {
    const img = c.createImageData(w, h);
    const p = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      // 캔버스 y 는 아래로, UV v 는 위로 → dv = −dy. n = normalize(−dh/du, −dh/dv, 1)
      p[i] = (-dx / l * 0.5 + 0.5) * 255;
      p[i + 1] = (dy / l * 0.5 + 0.5) * 255;
      p[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      p[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

/** 높이 캔버스 → ARM (R:AO, G:러프니스, B:메탈=0) */
function armCanvas(height: HTMLCanvasElement, rough: number, spread: number, aoAmt: number) {
  const { a, w, h } = heightArray(height);
  const H = (x: number, y: number) => a[wrap(y, h) * w + wrap(x, w)]!;
  return makeCanvas(w, h, (c) => {
    const img = c.createImageData(w, h);
    const p = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // 반경 2 의 국소 평균보다 낮으면 파인 곳 → 가려진다
      let mean = 0;
      for (let j = -2; j <= 2; j++) for (let i2 = -2; i2 <= 2; i2++) mean += H(x + i2, y + j);
      mean /= 25;
      const hv = H(x, y);
      const cavity = Math.max(0, Math.min(1, 0.5 + (hv - mean) * 3));
      const i = (y * w + x) * 4;
      p[i] = (1 - aoAmt * (1 - cavity)) * 255;
      // 튀어나온 곳은 손·발에 닳아 매끈해진다 → 러프니스가 낮다
      p[i + 1] = Math.max(0, Math.min(1, rough + (0.5 - hv) * spread)) * 255;
      p[i + 2] = 0;
      p[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
}

/** 파인 곳을 알베도에 미리 곱해 둔다 (직접광에도 먹는 캐비티 — aoMap 은 간접광에만 먹는다) */
function bakeCavity(albedo: HTMLCanvasElement, arm: HTMLCanvasElement, amount: number) {
  const w = albedo.width, h = albedo.height;
  const ac = albedo.getContext('2d')!;
  const ai = ac.getImageData(0, 0, w, h);
  const ar = arm.getContext('2d')!.getImageData(0, 0, w, h).data;
  const p = ai.data;
  for (let i = 0; i < p.length; i += 4) {
    const k = 1 - amount * (1 - ar[i]! / 255);
    p[i] = p[i]! * k; p[i + 1] = p[i + 1]! * k; p[i + 2] = p[i + 2]! * k;
  }
  ac.putImageData(ai, 0, 0);
}

interface PbrOpts {
  albedo: HTMLCanvasElement;
  /** 생략하면 알베도 휘도에서 뽑는다 */
  height?: HTMLCanvasElement;
  invertHeight?: boolean;
  rough: number;
  spread?: number;
  ao?: number;
  cavity?: number;
  nrm: number;
  side?: THREE.Side;
}

function pbr(o: PbrOpts): THREE.MeshStandardMaterial {
  const height = o.height ?? lumaHeight(o.albedo, o.invertHeight);
  const arm = armCanvas(height, o.rough, o.spread ?? 0.15, o.ao ?? 0.7);
  bakeCavity(o.albedo, arm, o.cavity ?? 0.35);
  const armTex = canvasTexture(arm, false);
  // three r152+ 는 aoMap 이 uv1 을 쓴다. 폐가는 UV 가 한 벌뿐이므로 채널 0 으로 돌린다
  armTex.channel = 0;
  return new THREE.MeshStandardMaterial({
    map: canvasTexture(o.albedo, true),
    normalMap: canvasTexture(normalCanvas(height, o.nrm), false),
    normalScale: new THREE.Vector2(1, 1),
    aoMap: armTex, aoMapIntensity: 0.85,
    roughnessMap: armTex,
    roughness: 1, metalness: 0,
    vertexColors: true,
    side: o.side ?? THREE.FrontSide,
  });
}

// ---------------------------------------------------------------- 그리기

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 널마루 — 판 단위 색차 + 옹이 + 나뭇결 + 못. 결은 u 축을 따라 흐른다 */
function plankDraw(base: [number, number, number], dark: string, boards = 5): Draw {
  return (c, w, h) => {
    const bh = h / boards;
    for (let b = 0; b < boards; b++) {
      const t = rnd(-16, 16);
      c.fillStyle = `rgb(${base[0] + t},${base[1] + t * 0.85},${base[2] + t * 0.7})`;
      c.fillRect(0, b * bh, w, bh);
      // 나뭇결 — 판마다 위상이 다르다
      const ph = Math.random() * 6.28;
      for (let i = 0; i < 26; i++) {
        const y = b * bh + Math.random() * bh;
        c.strokeStyle = `rgba(0,0,0,${rnd(0.04, 0.16)})`;
        c.lineWidth = rnd(0.6, 1.8);
        c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= w; x += w / 8) c.lineTo(x, y + Math.sin(x * 0.02 + ph) * 1.6);
        c.stroke();
      }
      // 옹이 (나이테 몇 겹)
      if (Math.random() < 0.55) {
        const kx = Math.random() * w, ky = b * bh + rnd(0.25, 0.75) * bh, kr = rnd(2.5, 6);
        for (let r = kr; r > 0.6; r -= 1.1) {
          c.strokeStyle = `rgba(0,0,0,${0.10 + (kr - r) * 0.05})`; c.lineWidth = 1.1;
          c.beginPath(); c.ellipse(kx, ky, r, r * 0.62, rnd(0, 3.14), 0, 6.28); c.stroke();
        }
      }
      // 못 자국
      for (let i = 0; i < 2; i++) {
        c.fillStyle = 'rgba(0,0,0,0.42)';
        c.beginPath(); c.arc(rnd(0.05, 0.95) * w, b * bh + bh * (i ? 0.85 : 0.15), 1.5, 0, 6.28); c.fill();
      }
      // 널 이음매 (홈)
      c.fillStyle = dark; c.fillRect(0, b * bh - 1, w, 2.4);
    }
  };
}

/** 손도끼(チョウナ) 자국이 남은 각재 — 민가 구조재는 대패가 아니라 자귀로 깎았다 */
const timberDraw: Draw = (c, w, h) => {
  c.fillStyle = '#33261b'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    c.strokeStyle = `rgba(0,0,0,${rnd(0.05, 0.18)})`; c.lineWidth = rnd(0.7, 1.6);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + rnd(6, 22), y + rnd(-1.5, 1.5)); c.stroke();
  }
  // 자귀로 쳐낸 얕은 홈 — 대각선 스캘럽
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w, y = Math.random() * h, l = rnd(8, 20);
    c.strokeStyle = `rgba(0,0,0,0.22)`; c.lineWidth = rnd(1.5, 3);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + l * 0.35); c.stroke();
    c.strokeStyle = `rgba(190,170,140,0.10)`; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x + l, y + 2 + l * 0.35); c.stroke();
  }
  // 갈라짐 (건조 균열)
  for (let i = 0; i < 4; i++) {
    let x = Math.random() * w, y = Math.random() * h;
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = rnd(1, 2.2);
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rnd(6, 16); y += rnd(-2, 2); c.lineTo(x, y); }
    c.stroke();
  }
};

/** 흙벽(荒壁) — 여물(짚) 섞인 회벽 + 균열 + 빗물 얼룩. 폐가라는 설정이 여기서 나온다 */
const mudDraw: Draw = (c, w, h) => {
  c.fillStyle = '#6b6250'; c.fillRect(0, 0, w, h);
  // 흙손 자국 (넓은 저주파 얼룩)
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(${rnd(90, 160)},${rnd(85, 150)},${rnd(70, 125)},0.16)`;
    c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rnd(12, 46), rnd(6, 22), rnd(0, 3.14), 0, 6.28); c.fill();
  }
  // 여물 — 짚 부스러기가 표면에 박혀 있다
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.28, l = rnd(3, 11);
    c.strokeStyle = `rgba(${rnd(150, 205)},${rnd(140, 190)},${rnd(105, 150)},${rnd(0.18, 0.5)})`;
    c.lineWidth = rnd(0.6, 1.3);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  // 균열 — 가지치는 선
  for (let i = 0; i < 7; i++) {
    let x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.28;
    c.strokeStyle = 'rgba(28,24,18,0.55)';
    for (let s = 0; s < 14; s++) {
      c.lineWidth = Math.max(0.5, 2.2 - s * 0.13);
      const nx = x + Math.cos(a) * rnd(4, 13), ny = y + Math.sin(a) * rnd(4, 13);
      c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      x = nx; y = ny; a += rnd(-0.5, 0.5);
    }
  }
  // 빗물 얼룩 — 위에서 아래로 흘러내린 자국
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * w;
    const g = c.createLinearGradient(x, 0, x, h);
    g.addColorStop(0, 'rgba(40,34,26,0.34)'); g.addColorStop(1, 'rgba(40,34,26,0)');
    c.fillStyle = g; c.fillRect(x - rnd(3, 10), 0, rnd(6, 20), h);
  }
};

/** 다진 흙바닥(土間) — 자갈과 발자국 자국 */
const dirtDraw: Draw = (c, w, h) => {
  c.fillStyle = '#3a3128'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = `rgba(${rnd(80, 145)},${rnd(66, 118)},${rnd(50, 90)},${rnd(0.15, 0.5)})`;
    c.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(1, 3));
  }
  // 박힌 자갈
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = rnd(1.5, 4);
    c.fillStyle = `rgba(${rnd(110, 165)},${rnd(105, 155)},${rnd(95, 140)},0.55)`;
    c.beginPath(); c.ellipse(x, y, r, r * rnd(0.6, 1), rnd(0, 3.14), 0, 6.28); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(x - r * 0.3, y + r * 0.4, r * 0.8, r * 0.4, 0, 0, 6.28); c.fill();
  }
  // 밟혀 눌린 자리
  for (let i = 0; i < 14; i++) {
    c.fillStyle = `rgba(22,18,14,${rnd(0.10, 0.24)})`;
    c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rnd(6, 18), rnd(4, 11), rnd(0, 3.14), 0, 6.28); c.fill();
  }
};

/** 짚지붕(茅葺) — 아래로 흐르는 짚단. 세로(v)가 처마 방향이다 */
const thatchDraw: Draw = (c, w, h) => {
  c.fillStyle = '#31291f'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * w, y = Math.random() * h, l = rnd(8, 26);
    c.strokeStyle = `rgba(${rnd(62, 128)},${rnd(54, 108)},${rnd(38, 76)},${rnd(0.25, 0.6)})`;
    c.lineWidth = rnd(0.7, 1.8);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + rnd(-2.5, 2.5), y + l); c.stroke();
  }
  // 짚단 뭉치 — 몇 다발이 두껍게 튀어나온다
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    c.fillStyle = `rgba(${rnd(90, 140)},${rnd(80, 120)},${rnd(56, 88)},0.28)`;
    c.beginPath(); c.ellipse(x, y, rnd(4, 10), rnd(12, 28), 0, 0, 6.28); c.fill();
  }
  // 이끼·삭은 자리
  for (let i = 0; i < 10; i++) {
    c.fillStyle = `rgba(${rnd(40, 70)},${rnd(52, 82)},${rnd(30, 50)},0.30)`;
    c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rnd(10, 30), rnd(8, 20), 0, 0, 6.28); c.fill();
  }
};

/** 다다미 한 장 (타일 = 실제 1 장). 알베도와 높이를 따로 그린다 — 縁(가장자리 천)은 홈이 아니라 융기다 */
const tatamiAlbedo: Draw = (c, w, h) => {
  c.fillStyle = '#6d6c41'; c.fillRect(0, 0, w, h);
  // 이구사(골풀) 결 — 짧은 변 방향으로 촘촘히
  for (let y = 0; y < h; y += 2.4) {
    c.strokeStyle = `rgba(${rnd(140, 178)},${rnd(136, 172)},${rnd(86, 120)},${rnd(0.20, 0.42)})`;
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + rnd(-0.7, 0.7)); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.16)'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(0, y + 1.2); c.lineTo(w, y + 1.2); c.stroke();
  }
  // 볕에 바랜 얼룩 / 곰팡이
  for (let i = 0; i < 16; i++) {
    c.fillStyle = `rgba(${rnd(60, 110)},${rnd(60, 105)},${rnd(40, 70)},${rnd(0.08, 0.22)})`;
    c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rnd(8, 30), rnd(6, 22), 0, 0, 6.28); c.fill();
  }
  // 縁(헤리) — **긴 두 변**에만 검은 천을 두른다 (캔버스 세로가 긴 변이므로 좌·우)
  const ew = Math.round(w * 0.075);
  const edge = c.createLinearGradient(0, 0, ew, 0);
  edge.addColorStop(0, '#15150f'); edge.addColorStop(1, '#2a2a1d');
  c.fillStyle = edge; c.fillRect(0, 0, ew, h);
  const edge2 = c.createLinearGradient(w, 0, w - ew, 0);
  edge2.addColorStop(0, '#15150f'); edge2.addColorStop(1, '#2a2a1d');
  c.fillStyle = edge2; c.fillRect(w - ew, 0, ew, h);
  // 짧은 변끼리는 잘린 골풀이 맞닿는다 — 가는 틈만
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, w, 1.6); c.fillRect(0, h - 1.6, w, 1.6);
};
const tatamiHeight: Draw = (c, w, h) => {
  c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2.4) {
    c.strokeStyle = '#c8c8c8'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
    c.strokeStyle = '#3a3a3a'; c.lineWidth = 1.0;
    c.beginPath(); c.moveTo(0, y + 1.3); c.lineTo(w, y + 1.3); c.stroke();
  }
  const ew = Math.round(w * 0.075);
  c.fillStyle = '#a6a6a6'; c.fillRect(0, 0, ew, h); c.fillRect(w - ew, 0, ew, h); // 縁은 살짝 융기
  c.fillStyle = '#0d0d0d'; c.fillRect(0, 0, w, 1.8); c.fillRect(0, h - 1.8, w, 1.8); // 짧은 변 이음매는 홈
};

/** 장지 — 살(桟)은 종이보다 **튀어나온** 나무다. 높이를 따로 그려야 홈이 되지 않는다 */
const SHOJI_COLS = 4, SHOJI_ROWS = 6, SHOJI_BAR = 3.4;
const shojiAlbedo: Draw = (c, w, h) => {
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, w, h);
  // 종이 섬유
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.28;
    c.strokeStyle = `rgba(${rnd(190, 225)},${rnd(180, 214)},${rnd(158, 190)},${rnd(0.12, 0.3)})`;
    c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * rnd(3, 12), y + Math.sin(a) * rnd(3, 12)); c.stroke();
  }
  // 물 얼룩 · 곰팡이
  for (let i = 0; i < 22; i++) {
    c.fillStyle = `rgba(${rnd(90, 140)},${rnd(78, 120)},${rnd(54, 88)},${rnd(0.05, 0.16)})`;
    c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rnd(5, 22), rnd(4, 16), 0, 0, 6.28); c.fill();
  }
  // 찢긴 자리 — 안쪽이 비쳐 어둡다
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * w, y = Math.random() * h;
    c.fillStyle = 'rgba(24,20,15,0.62)';
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 7; s++) c.lineTo(x + rnd(-11, 11), y + rnd(-9, 9));
    c.closePath(); c.fill();
  }
  // 살(桟)
  c.strokeStyle = '#33281c'; c.lineWidth = SHOJI_BAR;
  for (let i = 0; i <= SHOJI_COLS; i++) { const p = (i / SHOJI_COLS) * w; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, h); c.stroke(); }
  for (let i = 0; i <= SHOJI_ROWS; i++) { const p = (i / SHOJI_ROWS) * h; c.beginPath(); c.moveTo(0, p); c.lineTo(w, p); c.stroke(); }
};
const shojiHeight: Draw = (c, w, h) => {
  c.fillStyle = '#5a5a5a'; c.fillRect(0, 0, w, h);        // 종이면
  c.strokeStyle = '#e8e8e8'; c.lineWidth = SHOJI_BAR;      // 살은 융기
  for (let i = 0; i <= SHOJI_COLS; i++) { const p = (i / SHOJI_COLS) * w; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, h); c.stroke(); }
  for (let i = 0; i <= SHOJI_ROWS; i++) { const p = (i / SHOJI_ROWS) * h; c.beginPath(); c.moveTo(0, p); c.lineTo(w, p); c.stroke(); }
  // 종이의 미세한 처짐
  for (let i = 0; i < 60; i++) {
    c.fillStyle = `rgba(${rnd(60, 110) | 0},${rnd(60, 110) | 0},${rnd(60, 110) | 0},0.25)`;
    c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rnd(6, 18), rnd(5, 14), 0, 0, 6.28); c.fill();
  }
};

/** 맹장지(襖) — 두꺼운 종이에 무늬. 벽장문이라 안쪽은 캄캄하다 */
const fusumaDraw: Draw = (c, w, h) => {
  c.fillStyle = '#4a4335'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 700; i++) {
    c.fillStyle = `rgba(${rnd(110, 165)},${rnd(102, 152)},${rnd(84, 126)},${rnd(0.08, 0.24)})`;
    c.fillRect(Math.random() * w, Math.random() * h, rnd(2, 7), rnd(1.5, 4));
  }
  // 빛바랜 문양 (성긴 격자)
  c.strokeStyle = 'rgba(150,138,108,0.10)'; c.lineWidth = 1.6;
  for (let i = 0; i < 8; i++) { const p = (i / 8) * w; c.beginPath(); c.moveTo(p, 0); c.lineTo(p + w * 0.12, h); c.stroke(); }
  // 테두리(縁)
  c.fillStyle = '#241d15'; c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4); c.fillRect(0, 0, 4, h); c.fillRect(w - 4, 0, 4, h);
  // 손잡이(引手) 자리의 손때
  c.fillStyle = 'rgba(20,16,12,0.35)';
  c.beginPath(); c.ellipse(w * 0.5, h * 0.55, w * 0.06, h * 0.05, 0, 0, 6.28); c.fill();
};

// ---------------------------------------------------------------- 조립

let cached: HouseMaterials | null = null;

export function makeHouseMaterials(): HouseMaterials {
  if (cached) return cached;
  const S = 256;

  const shojiA = makeCanvas(S, S, shojiAlbedo);
  const shojiH = makeCanvas(S, S, shojiHeight);

  // 장지문만은 **알베도 한 장**으로 간다. 이유가 둘 있다.
  //  1) 종이는 평평하다. 노멀맵을 얹으면 위의 abs(dotNL) 해킹과 겹쳐서, 스쳐 지나가야 할
  //     초칭 빛에 종이 전체가 정면으로 반응해 순백으로 날아간다(normalScale 1.0 에서 화면 절반이 포화).
  //  2) 이 패널은 반투명·양면·depthWrite=false 인 전면 오버드로다. 맵을 세 장 붙이면
  //     복도 뷰에서만 6 fps 를 먹는다(실측 43.7 → 37.7 fps).
  // 살(桟)의 그늘은 대신 알베도에 미리 구워 둔다.
  const shojiArm = armCanvas(shojiH, 0.95, 0.1, 0.55);
  bakeCavity(shojiA, shojiArm, 0.32);
  const shojiMat = new THREE.MeshStandardMaterial({
    map: canvasTexture(shojiA, true),
    color: 0xf2ead8, roughness: 1, metalness: 0, vertexColors: true,
    side: THREE.DoubleSide, transparent: true, opacity: 0.94, depthWrite: false,
  });
  // 장지문: **거의 불투명**한 양면 + 그림자 수신.
  // 사람이 종이 너머로 직접 보이면 안 된다 — 보이는 건 등불이 종이에 던진 **그림자 실루엣**뿐.
  // 종이는 빛을 투과하므로 디퓨즈 항의 saturate(dotNL) 을 abs(dotNL) 로 바꿔 **뒷면에서 온 빛도 밝힌다**.
  // 포인트라이트 그림자는 dotNL 이전에 directLight.color 에 곱해지므로 실루엣은 양면 모두에 남는다 (2026-08-19)
  shojiMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk['lights_physical_pars_fragment']!
        .replace(/saturate\( dot\( geometryNormal, directLight\.direction \) \)/g,
                 'abs( dot( geometryNormal, directLight.direction ) ) * 0.85'),
    );
  };

  cached = {
    dirt: pbr({ albedo: makeCanvas(S, S, dirtDraw), rough: 0.97, spread: 0.05, ao: 0.75, cavity: 0.40, nrm: 1.8 }),
    plank: pbr({ albedo: makeCanvas(S, S, plankDraw([75, 58, 40], '#2a1f15')), rough: 0.74, spread: 0.26, cavity: 0.45, nrm: 2.6 }),
    plankDark: pbr({ albedo: makeCanvas(S, S, plankDraw([43, 33, 26], '#151009', 4)), rough: 0.88, spread: 0.16, cavity: 0.40, nrm: 2.2 }),
    tatami: pbr({
      albedo: makeCanvas(128, 256, tatamiAlbedo), height: makeCanvas(128, 256, tatamiHeight),
      rough: 0.93, spread: 0.12, ao: 0.6, cavity: 0.30, nrm: 1.9,
    }),
    mud: pbr({ albedo: makeCanvas(S, S, mudDraw), rough: 0.97, spread: 0.06, ao: 0.8, cavity: 0.45, nrm: 2.4 }),
    timber: pbr({ albedo: makeCanvas(S, S, timberDraw), rough: 0.78, spread: 0.22, cavity: 0.45, nrm: 2.8 }),
    thatch: pbr({ albedo: makeCanvas(S, S, thatchDraw), rough: 1.0, spread: 0.04, ao: 0.85, cavity: 0.5, nrm: 3.4 }),
    shojiMat,
    fusuma: pbr({ albedo: makeCanvas(S, S, fusumaDraw), rough: 0.95, spread: 0.1, cavity: 0.3, nrm: 1.6, side: THREE.DoubleSide }),
  };
  return cached;
}
