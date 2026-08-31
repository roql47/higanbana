import * as THREE from 'three';

export interface AxialBillboardOptions {
  /** 알파 테스트 문턱. 블렌딩을 쓰지 않아 깊이 정렬·오버드로 비용을 피한다. */
  alphaTest?: number;
  color?: THREE.ColorRepresentation;
  /** 카드 윗부분에만 적용하는 좌우 흔들림(m). 0 이면 정적이다. */
  sway?: { time: { value: number }; amplitude: number; speed: number };
  /** 카메라 방위에 맞춰 고를 다방향 임포스터 아틀라스. 행은 이미지 위에서 아래 순서다. */
  atlas?: { frames: number; columns: number; rows: number; angleOffset?: number };
}

/**
 * 세로축은 고정하고 카메라의 수평 방향만 따라 도는 인스턴스 빌보드 재질.
 * CPU 에서 인스턴스 행렬을 매 프레임 다시 쓰지 않고, 정점 셰이더가 카메라 방향을 계산한다.
 */
export function makeAxialBillboardMaterial(
  map: THREE.Texture,
  opts: AxialBillboardOptions = {},
): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map,
    color: opts.color ?? 0xffffff,
    alphaTest: opts.alphaTest ?? 0.25,
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  const sway = opts.sway;
  const atlas = opts.atlas;
  mat.onBeforeCompile = (shader) => {
    if (sway) shader.uniforms['uBillboardTime'] = sway.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${sway ? 'uniform float uBillboardTime;' : ''}`)
      .replace('#include <project_vertex>', `
        // 인스턴스의 위치·크기는 유지하되 회전은 버리고 월드 Y축을 세운다.
        // 그러면 카메라가 움직여도 CPU 행렬 갱신 없이 카드가 수평으로만 따라 돈다.
        vec4 billboardRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mat3 billboardBasis = mat3(modelMatrix) * mat3(instanceMatrix);
        float billboardWidthScale = 0.5 * (length(billboardBasis[0]) + length(billboardBasis[2]));
        float billboardHeightScale = length(billboardBasis[1]);
        vec2 billboardToCamera = cameraPosition.xz - billboardRoot.xz;
        float billboardCameraLen = length(billboardToCamera);
        vec2 billboardFacing = billboardCameraLen > 0.0001
          ? billboardToCamera / billboardCameraLen
          : vec2(0.0, 1.0);
        vec3 billboardRight = vec3(billboardFacing.y, 0.0, -billboardFacing.x);
        ${atlas ? `
        // 인스턴스의 원래 +Z 방향과 카메라 방위 사이의 각도로 가장 가까운 촬영 프레임을 고른다.
        // 행 방향은 WebGL UV 원점(아래)과 이미지 아틀라스 원점(위)이 반대라 뒤집는다.
        vec2 billboardForward = normalize(vec2(billboardBasis[2].x, billboardBasis[2].z));
        float billboardViewAngle = atan(
          billboardForward.y * billboardFacing.x - billboardForward.x * billboardFacing.y,
          dot(billboardForward, billboardFacing)
        ) + ${(atlas.angleOffset ?? 0).toFixed(8)};
        float billboardFrame = floor(mod(
          billboardViewAngle / 6.28318530718 * ${atlas.frames.toFixed(1)} + 0.5 + ${atlas.frames.toFixed(1)},
          ${atlas.frames.toFixed(1)}
        ));
        float billboardColumn = mod(billboardFrame, ${atlas.columns.toFixed(1)});
        float billboardRow = floor(billboardFrame / ${atlas.columns.toFixed(1)});
        #ifdef USE_MAP
          vMapUv = vec2(
            (vMapUv.x + billboardColumn) / ${atlas.columns.toFixed(1)},
            (vMapUv.y + (${(atlas.rows - 1).toFixed(1)} - billboardRow)) / ${atlas.rows.toFixed(1)}
          );
        #endif
        ` : ''}
        ${sway ? `float billboardPhase = dot(billboardRoot.xz, vec2(0.37, 0.29));
        float billboardSway = sin(uBillboardTime * ${sway.speed.toFixed(4)} + billboardPhase)
          * ${sway.amplitude.toFixed(4)} * uv.y * uv.y;` : 'float billboardSway = 0.0;'}
        vec3 billboardWorldPosition = billboardRoot.xyz
          + billboardRight * (transformed.x * billboardWidthScale + billboardSway)
          + vec3(0.0, transformed.y * billboardHeightScale, 0.0);
        vec4 mvPosition = viewMatrix * vec4(billboardWorldPosition, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      `);
  };
  mat.customProgramCacheKey = () => `axial-billboard-v3-${
    sway ? `sway-${sway.amplitude}-${sway.speed}` : 'static'
  }-${atlas ? `atlas-${atlas.frames}-${atlas.columns}-${atlas.rows}-${atlas.angleOffset ?? 0}` : 'single'}`;
  return mat;
}

/** 밑동이 원점에 놓이는 수직 카드. */
export function makeBillboardPlane(width: number, height: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(width, height, 1, 1);
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/** 원거리 삼나무용 절차적 임포스터 텍스처. 외부 이미지 로드 없이 한 번만 생성한다. */
export function makeCedarBillboardTexture(): THREE.CanvasTexture {
  return canvasTexture('cedar-billboard-hq', 512, 1024, (ctx, w, h) => {
    const trunk = ctx.createLinearGradient(0, 0, w, 0);
    trunk.addColorStop(0, '#251c17');
    trunk.addColorStop(0.34, '#49352a');
    trunk.addColorStop(0.56, '#684a38');
    trunk.addColorStop(1, '#211915');
    ctx.fillStyle = trunk;
    ctx.beginPath();
    ctx.moveTo(w * 0.43, h * 0.995);
    ctx.bezierCurveTo(w * 0.46, h * 0.72, w * 0.47, h * 0.35, w * 0.492, h * 0.055);
    ctx.lineTo(w * 0.515, h * 0.055);
    ctx.bezierCurveTo(w * 0.535, h * 0.36, w * 0.55, h * 0.73, w * 0.57, h * 0.995);
    ctx.closePath();
    ctx.fill();

    const rng = seeded(7319);
    // 수피의 세로 갈라짐. 가까운 안개 경계에서도 통나무가 평면 갈색 막대로 보이지 않게 한다.
    ctx.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      const x = w * (0.455 + rng() * 0.09);
      ctx.strokeStyle = i % 3 ? 'rgba(19,13,10,0.22)' : 'rgba(177,135,98,0.12)';
      ctx.lineWidth = 1 + rng() * 3;
      ctx.beginPath(); ctx.moveTo(x, h * (0.25 + rng() * 0.55));
      ctx.bezierCurveTo(x - 7, h * 0.62, x + 9, h * 0.82, x - 2, h * 0.98); ctx.stroke();
    }

    // 86개의 독립 가지와 잔가지. 삼각형 층을 겹치는 대신 실제 가지가 처지는 실루엣을 만든다.
    for (let i = 0; i < 86; i++) {
      const t = i / 85;
      const y = h * (0.075 + t * 0.82);
      const side = i % 2 ? -1 : 1;
      const reach = w * (0.055 + Math.pow(t, 0.78) * 0.43) * (0.72 + rng() * 0.34);
      const rootX = w * 0.5 + (rng() - 0.5) * w * 0.035;
      const tipX = rootX + side * reach;
      const tipY = y + h * (0.012 + rng() * 0.035);
      ctx.strokeStyle = `rgba(${33 + Math.floor(rng() * 13)},${42 + Math.floor(rng() * 18)},${30 + Math.floor(rng() * 12)},0.9)`;
      ctx.lineWidth = Math.max(2, 8 - t * 4.8);
      ctx.beginPath(); ctx.moveTo(rootX, y - h * 0.02);
      ctx.quadraticCurveTo(rootX + side * reach * 0.44, y - h * (0.015 + rng() * 0.018), tipX, tipY); ctx.stroke();

      // 가지를 따라 작은 침엽 덩어리를 분리해 찍는다. 가장자리가 매끈한 원뿔처럼 닫히지 않는다.
      const tufts = 4 + Math.floor(rng() * 4);
      for (let j = 1; j <= tufts; j++) {
        const u = j / tufts;
        const bx = rootX + (tipX - rootX) * u;
        const by = y + (tipY - y) * u - Math.sin(u * Math.PI) * h * 0.014;
        const rw = w * (0.018 + (1 - u) * 0.016) * (0.8 + rng() * 0.5);
        const rh = h * (0.012 + rng() * 0.009);
        const shade = 24 + Math.floor((1 - t) * 18 + rng() * 10);
        ctx.fillStyle = `rgba(${shade},${shade + 22 + Math.floor(rng() * 13)},${shade + 10},${0.72 + rng() * 0.25})`;
        ctx.beginPath();
        ctx.moveTo(bx - rw, by + rh * 0.2);
        ctx.quadraticCurveTo(bx - rw * 0.15, by - rh, bx + rw, by + rh * 0.1);
        ctx.quadraticCurveTo(bx, by + rh * 0.9, bx - rw, by + rh * 0.2);
        ctx.fill();
      }
    }

    // 꼭대기는 한 장짜리 삼각형이 아니라 가느다란 새순 여러 개로 닫는다.
    for (let i = 0; i < 17; i++) {
      const a = (i - 8) / 8;
      ctx.strokeStyle = `rgba(${39 + i % 7},${72 + i % 11},${46 + i % 5},0.9)`;
      ctx.lineWidth = 5 - Math.abs(a) * 2;
      ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.19);
      ctx.quadraticCurveTo(w * (0.5 + a * 0.08), h * 0.10, w * (0.5 + a * 0.045), h * (0.018 + Math.abs(a) * 0.055)); ctx.stroke();
    }
  });
}

/** 원거리 피안화 한 송이의 꽃대·꽃잎·수술을 납작하게 구운 텍스처. */
export function makeHiganbanaBillboardTexture(): THREE.CanvasTexture {
  return canvasTexture('higanbana-billboard-hq', 256, 320, (ctx, w, h) => {
    const cx = w * 0.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 꽃대는 밑동에서 꽃머리로 갈수록 붉어진다.
    const stem = ctx.createLinearGradient(0, h, 0, h * 0.26);
    stem.addColorStop(0, '#172416');
    stem.addColorStop(0.72, '#31482b');
    stem.addColorStop(1, '#7c2630');
    ctx.strokeStyle = stem;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(cx, h * 0.98);
    ctx.bezierCurveTo(cx - 3, h * 0.74, cx + 3, h * 0.49, cx, h * 0.28);
    ctx.stroke();

    const rng = seeded(991);
    const heads = 6;
    for (let k = 0; k < heads; k++) {
      const a = (k / heads) * Math.PI * 2 - Math.PI * 0.5;
      const hx = cx + Math.cos(a) * w * 0.17;
      const hy = h * 0.27 + Math.sin(a) * h * 0.075;
      ctx.strokeStyle = '#8f1d2c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, h * 0.3);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      for (let p = 0; p < 6; p++) {
        const pa = (p / 6) * Math.PI * 2 + a * 0.23;
        const len = w * (0.105 + rng() * 0.035);
        const ex = hx + Math.cos(pa) * len;
        const ey = hy + Math.sin(pa) * len * 0.66;
        // 납작한 선 대신 폭이 줄어드는 꽃잎 면. 끝이 뒤로 말려 피안화 실루엣이 남는다.
        const mx = hx + Math.cos(pa + 0.65) * len * 0.75;
        const my = hy + Math.sin(pa + 0.65) * len * 0.45;
        const nx = -Math.sin(pa) * 3.8, ny = Math.cos(pa) * 3.8;
        const petal = ctx.createLinearGradient(hx, hy, ex, ey);
        petal.addColorStop(0, '#8e1025'); petal.addColorStop(0.55, p % 2 ? '#ff334a' : '#d91b36'); petal.addColorStop(1, '#ff5363');
        ctx.fillStyle = petal;
        ctx.beginPath(); ctx.moveTo(hx + nx, hy + ny);
        ctx.quadraticCurveTo(mx + nx, my + ny, ex, ey);
        ctx.quadraticCurveTo(mx - nx, my - ny, hx - nx, hy - ny);
        ctx.closePath(); ctx.fill();

        // 수술은 꽃잎보다 길고 끝의 꽃밥이 가장 밝다.
        const sx = hx + Math.cos(pa + 0.25) * len * 1.45;
        const sy = hy + Math.sin(pa + 0.25) * len * 0.86;
        ctx.strokeStyle = '#ff6070';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.fillStyle = '#ffadb4';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ff263e';
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function canvasTexture(
  name: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`${name} 캔버스를 만들 수 없다`);
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
