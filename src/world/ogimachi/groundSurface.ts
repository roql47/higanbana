import * as THREE from 'three';
import type {GroundWear} from './groundWear';

/**
 * Procedural ground surface shared by the survey terrain and the precinct turf.
 *
 * Both used to draw one 4 m grass tile under a constant tint — the precinct sheet even threw the
 * texture's colour away and kept only its luminance (`.75 + luma * .55`, a 10 % wobble), so the
 * ground read as a flat painted sheet: the tile repeated on a visible grid and nothing changed
 * between one metre and the next.
 *
 * Here the same photographic tile is driven by a seamless fBm field baked once into a data texture:
 *  · **tone** — three octaves (190 / 41 / 8.5 m) shift the tint between lush, dry and damp ground
 *  · **bare soil** — a patch mask, opened further by slope, exposes earth on banks and worn ground
 *  · **anti-tiling** — two rotated samples of the tile, picked by noise instead of averaged, so the
 *    4 m repeat breaks up without the contrast loss that made the old two-scale blend look washed
 *  · **relief** — the noise texture carries its own gradient (g/b), used as a micro normal at 8.5 m
 *    and 1.35 m. That is what the surface was missing most: a DEM at 4 m has no detail at all below
 *    its grid, so the ground had no shading response to walk past.
 */

export interface GroundSurfaceOptions {
  /** Seamless fBm field from `makeGroundNoise` — r: fBm, g/b: its gradient, a: second fBm. */
  noise: THREE.Texture;
  /** Photographic ground tile (albedo). */
  albedo: THREE.Texture;
  /** Tangent-space normal map for the same tile. Also assigned to `material.normalMap`. */
  normal: THREE.Texture;
  /** Packed ao / roughness / metalness for the same tile. */
  arm?: THREE.Texture | null;
  /** Metres per albedo repeat. */
  tile?: number;
  /** Micro relief strength: broad (8.5 m) and fine (1.35 m). */
  relief?: [number, number];
  /** Worn-earth field from `bakeGroundWear` — turf gives way to packed earth along the routes. */
  wear?: GroundWear | null;
  /** How far the wear reaches out from a route edge and from a house wall, in metres. */
  wearReach?: [number, number];
  /** Crossfade to the material's own `map` (the orthophoto) between these eye distances. */
  aerial?: { near: number; far: number };
  /** Overall brightness of the procedural surface — matched to the aerial photo it fades into. */
  exposure?: number;
}

const LUSH = [0.56, 0.72, 0.38] as const;
const DRY = [0.82, 0.76, 0.50] as const;
const DAMP = [0.42, 0.48, 0.36] as const;
const SOIL = [0.41, 0.31, 0.21] as const;
// Trodden ground is greyer and duller than a freshly eroded bank — it is earth that has been packed.
const PACKED = [0.45, 0.38, 0.30] as const;
// Field scales in metres. Incommensurate on purpose: no two share a visible beat.
const FAR = 190, MID = 41, LOW = 8.5, MICRO = 1.35;

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const v3 = (c: readonly number[]) => `vec3(${c.map(f).join(',')})`;

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Value noise on a lattice that wraps at `period` cells — the reason the texture tiles. */
function tileNoise(u: number, v: number, period: number, seed: number) {
  const x = u * period, y = v * period;
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const fx = xf * xf * xf * (xf * (xf * 6 - 15) + 10), fy = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
  const m = (a: number) => ((a % period) + period) % period;
  const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fy;
}
function tileFbm(u: number, v: number, seed: number, octaves = 5) {
  let amp = 1, period = 4, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) { sum += amp * tileNoise(u, v, period, seed + o * 1013); norm += amp; amp *= 0.5; period *= 2; }
  return sum / norm;
}

/**
 * Seamless noise field. Baking it beats evaluating fBm per pixel: the shader needs four taps where
 * in-shader fBm would cost ~30 hashes, and the gradient comes for free from the baked field.
 */
export function makeGroundNoise(size = 256, seed = 20260912): THREE.DataTexture {
  const field = new Float32Array(size * size), second = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, u = x / size, v = y / size;
    field[i] = tileFbm(u, v, seed);
    second[i] = tileFbm(u, v, seed + 7919);
  }
  // Five octaves of averaged noise pile up around 0.5; left as is, every threshold downstream sits
  // in the same narrow band and the ground comes out uniform again. Stretch both fields to 0…1.
  const stretch = (a: Float32Array) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    for (let i = 0; i < a.length; i++) a[i] = (a[i]! - lo) / span;
  };
  stretch(field); stretch(second);
  const gx = new Float32Array(size * size), gy = new Float32Array(size * size);
  let peak = 1e-6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    gx[i] = (field[y * size + ((x + 1) % size)]! - field[y * size + ((x + size - 1) % size)]!) * 0.5;
    gy[i] = (field[((y + 1) % size) * size + x]! - field[((y + size - 1) % size) * size + x]!) * 0.5;
    peak = Math.max(peak, Math.abs(gx[i]!), Math.abs(gy[i]!));
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(field[i]! * 255);
    data[i * 4 + 1] = Math.round((0.5 + (gx[i]! / peak) * 0.5) * 255);
    data[i * 4 + 2] = Math.round((0.5 + (gy[i]! / peak) * 0.5) * 255);
    data[i * 4 + 3] = Math.round(second[i]! * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

let shared: THREE.DataTexture | null = null;
/** One field for the whole world — baking it twice would cost the same milliseconds for nothing. */
export function sharedGroundNoise() { return (shared ??= makeGroundNoise()); }

/** Drive `material` from the noise field. The material keeps its own `map` for the aerial fade. */
export function applyGroundSurface(material: THREE.MeshStandardMaterial, options: GroundSurfaceOptions) {
  const tile = options.tile ?? 4, [broad, fine] = options.relief ?? [0.75, 0.45];
  const exposure = options.exposure ?? 1, wear = options.wear ?? null;
  const [verge, yard] = options.wearReach ?? [3.2, 2.4];
  material.normalMap = options.normal;
  material.onBeforeCompile = shader => {
    shader.uniforms['groundNoise'] = { value: options.noise };
    shader.uniforms['groundAlbedo'] = { value: options.albedo };
    if (options.arm) shader.uniforms['groundArm'] = { value: options.arm };
    if (wear) {
      shader.uniforms['groundWear'] = { value: wear.texture };
      shader.uniforms['groundWearRect'] = { value: new THREE.Vector4(wear.minX, wear.minZ, 1 / wear.size, wear.maxDistance) };
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGroundPos;\nvarying vec3 vGroundNrm;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vGroundPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
        vGroundNrm = normalize( mat3( modelMatrix ) * normal );
        // The tangent frame is derived from this UV, so the first albedo sample must use it too.
        vNormalMapUv = vec2( vGroundPos.x, -vGroundPos.z ) / ${f(tile)};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D groundNoise;
        uniform sampler2D groundAlbedo;
        ${options.arm ? 'uniform sampler2D groundArm;' : ''}
        ${wear ? 'uniform sampler2D groundWear;\n        uniform vec4 groundWearRect;' : ''}
        varying vec3 vGroundPos;
        varying vec3 vGroundNrm;
        mat2 groundRot( float a ) { float c = cos(a), s = sin(a); return mat2( c, -s, s, c ); }
        vec2 gGroundUvB;      // second, rotated tile sample
        vec4 gGroundMix;      // x: tile pick, y: bare soil, z: tone, w: worn earth
        vec4 gGroundRelief;   // broad + fine noise gradients`)
      .replace('#include <map_fragment>', `
        vec2 gP = vec2( vGroundPos.x, -vGroundPos.z );
        vec4 nFar = texture2D( groundNoise, gP * ${f(1 / FAR)} );
        vec4 nMid = texture2D( groundNoise, gP * ${f(1 / MID)} + vec2( 0.37, 0.61 ) );
        vec4 nLow = texture2D( groundNoise, groundRot( 0.9 ) * gP * ${f(1 / LOW)} );
        vec4 nMicro = texture2D( groundNoise, groundRot( 2.3 ) * gP * ${f(1 / MICRO)} );

        // Pick one rotated tile or the other rather than averaging them: a blend of two samples
        // halves the contrast everywhere, which is what flattened the old ground.
        float pick = smoothstep( 0.34, 0.66, nLow.r * 0.75 + nMid.a * 0.25 );
        vec2 uvA = vNormalMapUv;
        gGroundUvB = groundRot( 2.39 ) * gP / ${f(tile)} + vec2( 11.3, 7.9 );
        vec3 albedo = mix( texture2D( groundAlbedo, uvA ).rgb, texture2D( groundAlbedo, gGroundUvB ).rgb, pick );

        float slope = clamp( 1.0 - vGroundNrm.y, 0.0, 1.0 );
        float tone = clamp( nFar.r * 0.5 + nMid.r * 0.34 + nLow.r * 0.16, 0.0, 1.0 );
        float bare = smoothstep( 0.46, 0.80, nMid.a * 0.5 + nLow.r * 0.22 + nFar.a * 0.18 + slope * 1.9 );

        vec3 tint = mix( ${v3(LUSH)}, ${v3(DRY)}, smoothstep( 0.52, 0.90, tone ) );
        tint = mix( tint, ${v3(DAMP)}, 1.0 - smoothstep( 0.04, 0.32, tone ) );
        // Cavity from the same field the relief uses: hollows read darker whatever the light does,
        // which is most of what makes a surface look like ground rather than a tinted plane.
        float cavity = 0.80 + 0.40 * ( nLow.r * 0.45 + nMicro.r * 0.55 );
        vec3 surface = albedo * tint * ( 0.82 + 0.36 * tone ) * cavity * ${f(exposure)};
        // Earth keeps the tile's own grain so bare patches are not flat brown either.
        float grain = 0.62 + 0.85 * dot( albedo, vec3( 0.3333 ) );
        surface = mix( surface, ${v3(SOIL)} * grain * ( 0.86 + 0.28 * nMicro.r ), bare );

        float worn = 0.0;
        ${wear ? `
        // Distance in metres from the nearest lane edge and the nearest house wall. The threshold —
        // not the distance — is what the noise shifts, so the verge wanders instead of ringing.
        vec2 wearUv = ( vGroundPos.xz - groundWearRect.xy ) * groundWearRect.z;
        vec2 wearD = texture2D( groundWear, wearUv ).rg * groundWearRect.w;
        float inField = step( 0.0, wearUv.x ) * step( wearUv.x, 1.0 ) * step( 0.0, wearUv.y ) * step( wearUv.y, 1.0 );
        float ragged = ( nLow.r - 0.5 ) * 2.6 + ( nMicro.r - 0.5 ) * 1.0;
        worn = max( 1.0 - smoothstep( 0.0, ${f(verge)}, wearD.r + ragged ),
                    ( 1.0 - smoothstep( 0.0, ${f(yard)}, wearD.g + ragged ) ) * 0.85 ) * inField;
        // Traffic is patchy, and nobody walks up a bank: tufts survive, steep ground stays turf.
        worn *= ( 0.55 + 0.45 * nMicro.a ) * ( 1.0 - smoothstep( 0.25, 0.60, slope ) );
        surface = mix( surface, ${v3(PACKED)} * grain * ( 0.90 + 0.22 * nMicro.r ), worn );` : ''}

        gGroundMix = vec4( pick, bare, tone, worn );
        gGroundRelief = vec4( ( nLow.gb - 0.5 ) * 2.0, ( nMicro.gb - 0.5 ) * 2.0 );
        ${options.aerial ? `
        #ifdef USE_MAP
          float covered = step( 0.0, vMapUv.x ) * step( vMapUv.x, 1.0 ) * step( 0.0, vMapUv.y ) * step( vMapUv.y, 1.0 );
          float distant = smoothstep( ${f(options.aerial.near)}, ${f(options.aerial.far)}, length( vViewPosition ) ) * covered;
          surface = mix( surface, texture2D( map, vMapUv ).rgb, distant );
          gGroundRelief *= 1.0 - distant;
        #endif` : ''}
        diffuseColor.rgb *= surface;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 mapA = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 mapB = texture2D( normalMap, gGroundUvB ).xyz * 2.0 - 1.0;
        mapB.xy = groundRot( -2.39 ) * mapB.xy;   // back into the frame the tangent basis uses
        vec3 mapN = mix( mapA, mapB, gGroundMix.x );
        mapN.xy -= gGroundRelief.xy * ${f(broad)} + gGroundRelief.zw * ${f(fine)} * ( 0.6 + 0.8 * gGroundMix.y );
        mapN.xy *= 1.0 - 0.62 * gGroundMix.w;   // trodden ground is flattened, not just recoloured
        mapN.xy *= normalScale;
        normal = normalize( tbn * mapN );`);
    if (options.arm) shader.fragmentShader = shader.fragmentShader
      .replace('#include <roughnessmap_fragment>', `
        vec3 gArm = texture2D( groundArm, vNormalMapUv ).rgb;
        float roughnessFactor = clamp( roughness * mix( 1.0, gArm.g, 0.55 ) * mix( 1.0, 0.88, gGroundMix.y ) * mix( 1.0, 0.93, gGroundMix.w ), 0.35, 1.0 );`)
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= mix( 1.0, gArm.r, 0.5 );`);
  };
  material.customProgramCacheKey = () =>
    `ground:${tile}:${broad}:${fine}:${exposure}:${wear ? `${verge}-${yard}` : 'nowear'}:${options.aerial ? `${options.aerial.near}-${options.aerial.far}` : 'none'}`;
  material.needsUpdate = true;
}
