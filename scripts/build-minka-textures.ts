/**
 * High-detail but compact shared materials for the procedural village houses.
 *
 * Generated sources stay under assets/ (not shipped). Runtime output uses 1K
 * base/normal maps and 512px packed ARM maps so every house can share the same
 * GPU resources regardless of house count.
 *
 *   node scripts/build-minka-textures.ts
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(ROOT, 'assets/generated/textures/minka');
const OUT = resolve(ROOT, 'public/textures/minka');
const SIZE = 1024;
const ARM_SIZE = 512;
const CHANNELS = 3;

interface Grade { saturation: number; gain: number; lift: number }
interface Surface {
  name: string;
  source: string;
  grade: Grade;
  normalStrength: number;
  roughness: number;
  roughVariation: number;
  seamBorder: number;
  writeNormal: boolean;
}

const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function featherPeriodicEdges(data: Uint8Array, border: number) {
  if (border <= 1) return;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < border; x++) {
    const opposite = SIZE - 1 - x;
    const keep = smoothstep(x / (border - 1));
    for (let c = 0; c < CHANNELS; c++) {
      const a = (y * SIZE + x) * CHANNELS + c;
      const b = (y * SIZE + opposite) * CHANNELS + c;
      const mean = (data[a]! + data[b]!) * 0.5;
      data[a] = clampByte(mean * (1 - keep) + data[a]! * keep);
      data[b] = clampByte(mean * (1 - keep) + data[b]! * keep);
    }
  }
  for (let y = 0; y < border; y++) {
    const opposite = SIZE - 1 - y;
    const keep = smoothstep(y / (border - 1));
    for (let x = 0; x < SIZE; x++) for (let c = 0; c < CHANNELS; c++) {
      const a = (y * SIZE + x) * CHANNELS + c;
      const b = (opposite * SIZE + x) * CHANNELS + c;
      const mean = (data[a]! + data[b]!) * 0.5;
      data[a] = clampByte(mean * (1 - keep) + data[a]! * keep);
      data[b] = clampByte(mean * (1 - keep) + data[b]! * keep);
    }
  }
}

function grade(data: Uint8Array, g: Grade) {
  for (let i = 0; i < data.length; i += CHANNELS) {
    const r = data[i]!, green = data[i + 1]!, b = data[i + 2]!;
    const luma = r * 0.28 + green * 0.60 + b * 0.12;
    data[i] = clampByte((luma + (r - luma) * g.saturation) * g.gain + g.lift);
    data[i + 1] = clampByte((luma + (green - luma) * g.saturation) * g.gain + g.lift);
    data[i + 2] = clampByte((luma + (b - luma) * g.saturation) * g.gain + g.lift);
  }
}

function heightFromRgb(rgb: Uint8Array) {
  const height = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < height.length; i++) {
    const p = i * CHANNELS;
    height[i] = clampByte(rgb[p]! * 0.28 + rgb[p + 1]! * 0.60 + rgb[p + 2]! * 0.12);
  }
  return height;
}

function normalFromHeight(height: Uint8Array, strength: number) {
  const out = new Uint8Array(SIZE * SIZE * CHANNELS);
  const at = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]!;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const gx = (
      -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
      + at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
    ) / 1020;
    const gy = (
      -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
      + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
    ) / 1020;
    let nx = -gx * strength, ny = -gy * strength, nz = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv; nz *= inv;
    const p = (y * SIZE + x) * CHANNELS;
    out[p] = clampByte((nx * 0.5 + 0.5) * 255);
    out[p + 1] = clampByte((ny * 0.5 + 0.5) * 255);
    out[p + 2] = clampByte((nz * 0.5 + 0.5) * 255);
  }
  return out;
}

async function build(surface: Surface) {
  const raw = await sharp(surface.source)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer();
  const albedo = new Uint8Array(raw);
  featherPeriodicEdges(albedo, surface.seamBorder);
  grade(albedo, surface.grade);

  const height = heightFromRgb(albedo);
  const blurred = await sharp(height, { raw: { width: SIZE, height: SIZE, channels: 1 } })
    .blur(surface.name === 'kaya-thatch' ? 3.2 : 4.4)
    .raw()
    .toBuffer();
  const arm = new Uint8Array(SIZE * SIZE * CHANNELS);
  for (let i = 0; i < height.length; i++) {
    const cavity = height[i]! - blurred[i]!;
    const p = i * CHANNELS;
    arm[p] = clampByte(236 + cavity * 1.18);
    arm[p + 1] = clampByte(surface.roughness + (128 - height[i]!) * surface.roughVariation - Math.abs(cavity) * 0.15);
    arm[p + 2] = 0;
  }

  const runtime = { width: SIZE, height: SIZE, channels: CHANNELS as 3 };
  const jobs: Promise<unknown>[] = [
    sharp(albedo, { raw: runtime })
      .webp({ quality: 84, smartSubsample: true, effort: 6 })
      .toFile(resolve(OUT, `${surface.name}-diff-1k.webp`)),
    sharp(arm, { raw: runtime })
      .resize(ARM_SIZE, ARM_SIZE, { kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 82, smartSubsample: true, effort: 6 })
      .toFile(resolve(OUT, `${surface.name}-arm-512.webp`)),
  ];
  if (surface.writeNormal) {
    const normal = normalFromHeight(height, surface.normalStrength);
    jobs.push(sharp(normal, { raw: runtime })
      .webp({ quality: 86, smartSubsample: true, effort: 6 })
      .toFile(resolve(OUT, `${surface.name}-nor-gl-1k.webp`)));
  }
  await Promise.all(jobs);
  console.info(`minka texture: ${surface.name}`);
}

mkdirSync(OUT, { recursive: true });
await build({
  name: 'weathered-cedar',
  // v2: 새 목재처럼 보이던 주황색 원본 대신 회갈색 삼나무, 들뜬 섬유, 판자 틈 곰팡이와
  // 못 녹을 한 장에 담는다. 민가용 노멀도 여기서 다시 뽑아 다른 건물의 깨끗한 목재와 분리한다.
  source: resolve(SOURCE, 'weathered-cedar-source-v2.png'),
  grade: { saturation: 0.70, gain: 1.15, lift: 10 },
  normalStrength: 2.10,
  roughness: 236,
  roughVariation: 0.075,
  seamBorder: 64,
  writeNormal: true,
});
await build({
  name: 'aged-mud-plaster',
  // v2: 레퍼런스의 습기층·곰팡이·세로 빗물 자국을 넣되, 밤의 비조명면이 뭉개지지 않게
  // 원본 중간톤을 조금 들어 올린다. 가장자리는 64 px 를 주기화해 큰 얼룩의 타일 이음매를 숨긴다.
  source: resolve(SOURCE, 'aged-mud-plaster-source-v2.png'),
  grade: { saturation: 0.72, gain: 1.10, lift: 8 },
  normalStrength: 1.85,
  roughness: 239,
  roughVariation: 0.055,
  seamBorder: 64,
  writeNormal: true,
});
await build({
  name: 'kaya-thatch',
  source: resolve(SOURCE, 'kaya-thatch-source.png'),
  grade: { saturation: 0.78, gain: 1.18, lift: 18 },
  normalStrength: 2.65,
  roughness: 244,
  roughVariation: 0.035,
  seamBorder: 0,
  writeNormal: true,
});
